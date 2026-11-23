// Capa HTTP común: caché en IndexedDB con caducidad, contador de peticiones diarias,
// errores normalizados y deduplicación de peticiones simultáneas.
import { config, KEYS } from '../config.js?v=ed7bffe0';

export class ApiError extends Error {
  constructor(code, message, meta = {}) { super(message); this.code = code; Object.assign(this, meta); }
}
// Códigos: no_key, needs_proxy, bad_key, premium (plan no cubre), not_found, rate_limit, network, bad_response

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
  try { const u = JSON.parse(localStorage.getItem(USAGE) || '{}'); return u.day === today() ? u : { day: today() }; }
  catch { return { day: today() }; }
}
function bump(p) { const u = usage(); u[p] = (u[p] || 0) + 1; try { localStorage.setItem(USAGE, JSON.stringify(u)); } catch {} window.dispatchEvent(new CustomEvent('iip:usage')); }

// ---------- Proveedores: base, parámetro de clave y límite por minuto ----------
export const PROVIDERS = {
  fmp: { name: 'Financial Modeling Prep', base: 'https://financialmodelingprep.com/stable/', key: 'apikey', perMin: 0 },
  av: { name: 'Alpha Vantage', base: 'https://www.alphavantage.co/query', key: 'apikey', perMin: 5 },
  finnhub: { name: 'Finnhub', base: 'https://finnhub.io/api/v1/', key: 'token', perMin: 55 },
  td: { name: 'Twelve Data', base: 'https://api.twelvedata.com/', key: 'apikey', perMin: 8 },
  roic: { name: 'ROIC.AI', base: 'https://api.roic.ai/v2/', key: 'apikey', perMin: 5 },
  sec: { name: 'SEC EDGAR', base: null, key: null, perMin: 300 },
  esef: { name: 'filings.xbrl.org (ESEF)', base: 'https://filings.xbrl.org/', key: null, perMin: 60 },
};
export const providerName = (p) => (PROVIDERS[p] || {}).name || p;

// Limitador por minuto (ventana deslizante): deja pasar hasta perMin peticiones en cualquier minuto
// y hace esperar a las siguientes, para no recibir errores 429.
const stamps = {};
async function throttle(p) {
  const per = PROVIDERS[p].perMin; if (!per) return;
  const st = (stamps[p] = stamps[p] || []);
  for (;;) {
    const now = Date.now();
    while (st.length && now - st[0] >= 60000) st.shift();
    if (st.length < per) { st.push(now); return; }
    await new Promise((r) => setTimeout(r, 60000 - (now - st[0]) + 20));
  }
}
export function queueDelay(p) { const per = PROVIDERS[p].perMin, st = stamps[p] || []; return per && st.length >= per ? Math.max(0, 60000 - (Date.now() - st[0])) : 0; }

function buildUrl(provider, path, qs, cfg) {
  const P = PROVIDERS[provider];
  if (cfg.proxyUrl) return `${cfg.proxyUrl.replace(/\/$/, '')}/${provider}/${path}${qs ? '?' + qs : ''}`;
  if (provider === 'sec') throw new ApiError('needs_proxy', 'SEC EDGAR solo es accesible a través del backend (Worker)', { provider });
  const key = cfg[KEYS[provider]];
  if (P.key && !key) throw new ApiError('no_key', `Falta la clave de ${P.name}`, { provider });
  const auth = P.key ? `${P.key}=${encodeURIComponent(key)}` : '';
  const q = [qs, auth].filter(Boolean).join('&');
  return provider === 'av' ? `${P.base}?${q}` : `${P.base}${path}${q ? '?' + q : ''}`;
}

// ---------- Petición con caché ----------
const inflight = new Map();

/**
 * @returns {Promise<{data:any, source:string, endpoint:string, fetchedAt:number, cached:boolean}>}
 */
export async function getJSON(provider, path, params, ttlHours, validate) {
  const cfg = config.get();
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  const cacheKey = `${provider}:${path}?${qs}`;
  const hit = await idbGet(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < ttlHours * 3600e3) return { ...hit, cached: true };
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const p = (async () => {
    const url = buildUrl(provider, path, qs, cfg);
    const lim = (cfg.limits || {})[provider];
    if (lim && (usage()[provider] || 0) >= lim) {
      if (hit) return { ...hit, cached: true, stale: true };
      throw new ApiError('rate_limit', `Has agotado las ${lim} peticiones diarias de ${providerName(provider)}`, { provider });
    }
    let res, body;
    try {
      await throttle(provider);
      bump(provider);
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), provider === 'esef' || provider === 'sec' ? 45000 : 15000);
      try { res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal }); } finally { clearTimeout(to); }
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch (e) {
      if (hit) return { ...hit, cached: true, stale: true };
      throw new ApiError('network', `${providerName(provider)} no responde`, { provider });
    }
    const err = classify(provider, res.status, body);
    if (err) { if (hit && err.code !== 'premium') return { ...hit, cached: true, stale: true }; throw err; }
    if (validate && !validate(body)) throw new ApiError('not_found', `${providerName(provider)} no tiene datos para esta consulta`, { provider });
    const rec = { data: body, source: providerName(provider), endpoint: path || (params && params.function) || '', fetchedAt: Date.now() };
    await idbSet(cacheKey, rec);
    return { ...rec, cached: false };
  })();
  inflight.set(cacheKey, p);
  try { return await p; } finally { inflight.delete(cacheKey); }
}

export function classify(provider, status, body) {
  const msg = typeof body === 'string' ? body.slice(0, 300) : (body && (body['Error Message'] || body.error || body.message || body.Information || body.Note || (body.status === 'error' && body.message))) || '';
  if (provider === 'td' && body && body.status === 'error') { if (body.code === 429) return new ApiError('rate_limit', 'Límite de Twelve Data alcanzado', { provider }); if (body.code === 403) return new ApiError('premium', 'Este dato requiere un plan de pago de Twelve Data', { provider, detail: msg }); if (body.code === 401) return new ApiError('bad_key', 'La clave de Twelve Data no es válida', { provider }); return new ApiError('not_found', msg || 'Sin datos', { provider }); }
  if (provider === 'finnhub' && /don't have access|You don.t have access/i.test(msg)) return new ApiError('premium', 'Este dato requiere un plan de pago de Finnhub', { provider });
  if (/Falta el secreto/.test(msg)) return new ApiError('no_key', `El Worker no tiene configurada la clave de ${providerName(provider)}`, { provider });
  if (status === 401 || /invalid api key|apikey is invalid|Invalid API KEY/i.test(msg)) return new ApiError('bad_key', 'La clave de API no es válida', { provider });
  // El aviso de límite diario de Alpha Vantage menciona «premium»: se comprueba antes para no confundirlo con un dato de pago
  if (status === 429 || /rate limit|requests per day|call frequency|limit reach|standard API rate/i.test(msg)) return new ApiError('rate_limit', `Límite de ${providerName(provider)} alcanzado por hoy`, { provider });
  if (status === 402 || status === 403 || /premium endpoint|premium query|subscription|restricted|upgrade|not available under your current|premium plan/i.test(msg)) return new ApiError('premium', 'Este dato requiere un plan de pago del proveedor', { provider, detail: msg });
  if (status === 429 || /limit reach|rate limit|call frequency|requests per day|Thank you for using Alpha Vantage/i.test(msg)) return new ApiError('rate_limit', 'Límite de peticiones del proveedor alcanzado', { provider });
  if (status === 404) return new ApiError('not_found', 'Sin datos', { provider });
  if (status >= 500) return new ApiError('network', 'El proveedor no responde', { provider });
  if (provider === 'av' && body && body['Error Message']) return new ApiError('not_found', 'Símbolo no encontrado en Alpha Vantage', { provider });
  if (status >= 400) return new ApiError('bad_response', msg || `Error ${status}`, { provider });
  return null;
}
