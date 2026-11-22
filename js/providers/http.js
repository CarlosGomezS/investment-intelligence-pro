// Capa HTTP común: caché en IndexedDB con caducidad, contador de peticiones diarias,
// errores normalizados y deduplicación de peticiones simultáneas.
import { config } from '../config.js';

export class ApiError extends Error {
  constructor(code, message, meta = {}) { super(message); this.code = code; Object.assign(this, meta); }
}
// Códigos: no_key, premium (plan no cubre), not_found, rate_limit, network, bad_response

// ---------- IndexedDB mínima ----------
const DB = 'iip-cache', STORE = 'kv';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
async function idbGet(k) {
  const d = await db(); if (!d) return undefined;
  return new Promise((res) => { const t = d.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(undefined); });
}
async function idbSet(k, v) {
  const d = await db(); if (!d) return;
  return new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = res; });
}
export async function clearCache() {
  const d = await db(); if (!d) return;
  return new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).clear(); t.oncomplete = res; t.onerror = res; });
}

// ---------- Contador de uso diario por proveedor ----------
const USAGE = 'iip.usage.v1';
function today() { return new Date().toISOString().slice(0, 10); }
export function usage() {
  try { const u = JSON.parse(localStorage.getItem(USAGE) || '{}'); return u.day === today() ? u : { day: today(), fmp: 0, av: 0 }; }
  catch { return { day: today(), fmp: 0, av: 0 }; }
}
function bump(p) { const u = usage(); u[p] = (u[p] || 0) + 1; try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch {} window.dispatchEvent(new CustomEvent('iip:usage')); }

// ---------- Petición con caché ----------
const inflight = new Map();

/**
 * @param provider 'fmp' | 'av'
 * @param url URL completa SIN clave (la clave se añade aquí o la añade el proxy)
 * @param ttlHours caducidad de la caché
 * @returns {Promise<{data:any, source:string, fetchedAt:number, cached:boolean}>}
 */
export async function getJSON(provider, path, params, ttlHours, validate) {
  const cfg = config.get();
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const cacheKey = `${provider}:${path}?${qs}`;
  const hit = await idbGet(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < ttlHours * 3600e3) return { ...hit, cached: true };
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const p = (async () => {
    let url;
    if (cfg.proxyUrl) {
      url = `${cfg.proxyUrl.replace(/\/$/, '')}/${provider}/${path}${qs ? '?' + qs : ''}`;
    } else {
      const key = provider === 'fmp' ? cfg.fmpKey : cfg.avKey;
      if (!key) throw new ApiError('no_key', provider === 'fmp' ? 'Falta la clave de Financial Modeling Prep' : 'Falta la clave de Alpha Vantage', { provider });
      const base = provider === 'fmp' ? 'https://financialmodelingprep.com/stable/' : 'https://www.alphavantage.co/query';
      url = provider === 'fmp' ? `${base}${path}?${qs}${qs ? '&' : ''}apikey=${encodeURIComponent(key)}` : `${base}?${qs}&apikey=${encodeURIComponent(key)}`;
    }
    const lim = provider === 'fmp' ? cfg.fmpDailyLimit : cfg.avDailyLimit;
    if ((usage()[provider] || 0) >= lim) {
      if (hit) return { ...hit, cached: true, stale: true };
      throw new ApiError('rate_limit', `Has agotado las ${lim} peticiones diarias de ${provider === 'fmp' ? 'FMP' : 'Alpha Vantage'}`, { provider });
    }
    let res, body;
    try {
      bump(provider);
      res = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch (e) {
      if (hit) return { ...hit, cached: true, stale: true };
      throw new ApiError('network', 'No hay conexión con el proveedor de datos', { provider });
    }
    const err = classify(provider, res.status, body);
    if (err) { if (hit && err.code !== 'premium') return { ...hit, cached: true, stale: true }; throw err; }
    if (validate && !validate(body)) throw new ApiError('not_found', 'El proveedor no tiene datos para esta consulta', { provider });
    const rec = { data: body, source: provider === 'fmp' ? 'Financial Modeling Prep' : 'Alpha Vantage', endpoint: path || params.function, fetchedAt: Date.now() };
    await idbSet(cacheKey, rec);
    return { ...rec, cached: false };
  })();
  inflight.set(cacheKey, p);
  try { return await p; } finally { inflight.delete(cacheKey); }
}

export function classify(provider, status, body) {
  const msg = typeof body === 'string' ? body : (body && (body['Error Message'] || body.error || body.message || body.Information || body.Note)) || '';
  if (status === 401 || /invalid api key|apikey is invalid|Invalid API KEY/i.test(msg)) return new ApiError('bad_key', 'La clave de API no es válida', { provider });
  if (status === 402 || status === 403 || /premium|subscription|restricted|upgrade|not available under your current/i.test(msg)) return new ApiError('premium', 'Este dato requiere un plan de pago del proveedor', { provider, detail: msg });
  if (status === 429 || /limit reach|rate limit|call frequency|requests per day|Thank you for using Alpha Vantage/i.test(msg)) return new ApiError('rate_limit', 'Límite de peticiones del proveedor alcanzado', { provider });
  if (status === 404) return new ApiError('not_found', 'Sin datos', { provider });
  if (status >= 500) return new ApiError('network', 'El proveedor no responde', { provider });
  if (provider === 'av' && body && body['Error Message']) return new ApiError('not_found', 'Símbolo no encontrado en Alpha Vantage', { provider });
  if (status >= 400) return new ApiError('bad_response', msg || `Error ${status}`, { provider });
  return null;
}
