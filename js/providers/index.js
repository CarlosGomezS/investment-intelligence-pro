// Servicio de datos con proveedores intercambiables y reparto de cuota.
//
// Para cada tipo de dato hay un orden de preferencia (calidad primero). Antes de cada petición:
//  - se descartan los proveedores sin clave (o que requieren el Worker y no está configurado);
//  - los proveedores con tope diario que ya han gastado ≥70 % de su cuota pasan al final de la cola,
//    para que la cuota que queda se use solo cuando nadie más tiene el dato.
// Se devuelve el primer proveedor que responde con datos, junto con su procedencia.
import { fmp } from './fmp.js?v=169485d7';
import { alphavantage } from './alphavantage.js?v=169485d7';
import { finnhub, forgetFinnhub } from './finnhub.js?v=169485d7';
import { twelvedata } from './twelvedata.js?v=169485d7';
import { roic } from './roic.js?v=169485d7';
import { sec, forgetSec } from './sec.js?v=169485d7';
import { esef, forgetEsef } from './esef.js?v=169485d7';
import { config } from '../config.js?v=169485d7';
import { ApiError, usage, queueDelay } from './http.js?v=169485d7';
import { setHint } from './hints.js?v=169485d7';

const P = { fmp, av: alphavantage, finnhub, td: twelvedata, roic, sec, esef };

// SEC EDGAR primero: gratis, sin cupo diario y con más de 10 años en una sola petición (solo con el Worker; sin él
// se salta sola). Así el cupo de FMP queda para lo que la SEC no da. Fuera de EE. UU. la SEC no responde y se pasa a
// la siguiente. ESEF (lento) después de ROIC; completa años si faltan.
const STATEMENTS = ['sec', 'fmp', 'finnhub', 'roic', 'esef', 'av'];
export const ORDER = {
  profile: ['fmp', 'finnhub', 'roic', 'av', 'sec'],
  quote: ['finnhub', 'td', 'fmp', 'av'],
  pricesDaily: ['td', 'fmp', 'roic', 'av'],
  income: STATEMENTS, balance: STATEMENTS, cashflow: STATEMENTS,
  ratiosTTM: ['fmp', 'finnhub'], keyMetricsTTM: ['fmp', 'finnhub'],
  peers: ['fmp', 'finnhub'], gradesConsensus: ['fmp', 'finnhub'], gradesHistorical: ['fmp', 'finnhub'],
  dividends: ['fmp', 'av'], earnings: ['fmp', 'finnhub', 'av'], earningsCalendar: ['finnhub', 'fmp'],
  news: ['fmp', 'finnhub', 'av'], filings: ['fmp', 'sec'], fx: ['td', 'fmp'],
};
const QUARTERLY = ['fmp', 'av']; // solo estos dan trimestres reales

// Si un proveedor responde «plan de pago» para un símbolo, no se le vuelve a preguntar por ese símbolo
// durante 3 días: así no se gasta cuota en peticiones que van a fallar (p. ej. FMP gratis con acciones europeas).
const BLK = 'iip.blocked.v2'; // v2: se descartan los bloqueos erróneos de la versión anterior
let blocked = (() => { try { const b = JSON.parse(localStorage.getItem(BLK) || '{}'); const now = Date.now(); return Object.fromEntries(Object.entries(b).filter(([, t]) => now - t < 3 * 864e5)); } catch { return {}; } })();
const isSym = (x) => typeof x === 'string' && /^[A-Z0-9.^\-]{1,15}$/i.test(x);
function block(id, sym) { blocked[`${id}:${sym}`] = Date.now(); try { localStorage.setItem(BLK, JSON.stringify(blocked)); } catch {} }
const badKeys = new Set(); // claves rechazadas: no se vuelve a usar esa fuente en esta sesión
const isBlocked = (id, args) => badKeys.has(id) || (isSym(args[0]) && !!blocked[`${id}:${args[0]}`]);

function demoted(id) {
  const lim = (config.get().limits || {})[id];
  return lim ? (usage()[id] || 0) >= lim * 0.7 : false;
}
function chain(method, args, order) {
  let ids = order || ORDER[method] || ['fmp'];
  if (['income', 'balance', 'cashflow'].includes(method) && args[1] === 'quarter') ids = QUARTERLY;
  ids = ids.filter((id) => config.canUse(id) && typeof P[id][method] === 'function' && !isBlocked(id, args));
  return [...ids.filter((id) => !demoted(id)), ...ids.filter(demoted)];
}

const PRIORITY = { premium: 5, rate_limit: 4, bad_key: 6, needs_proxy: 1, network: 3, not_found: 2, no_key: 1, bad_response: 2 };

// Campos clave por estado: si faltan años o estos campos, se completa con la siguiente fuente que los tenga.
const KEYF = {
  income: ['revenue', 'netIncome', 'eps', 'operatingIncome'],
  balance: ['totalAssets', 'totalStockholdersEquity', 'cashAndCashEquivalents'],
  cashflow: ['operatingCashFlow', 'freeCashFlow', 'capitalExpenditure'],
};
const fyOf = (r) => String(r.fiscalYear || String(r.date || '').slice(0, 4));
function gaps(method, rows, limit = 15) {
  if (!Array.isArray(rows) || limit < 8) return false; // consultas cortas (competidores, screener): no se completa
  if (rows.length < 8) return true;
  return KEYF[method].some((f) => rows.filter((r) => r[f] == null).length > rows.length * 0.2);
}
async function complete(method, args, base, rest) {
  const rows = base.data.map((r) => ({ ...r }));
  const cur = rows[0] && rows[0].reportedCurrency;
  const used = [base.provider];
  const deadline = Date.now() + 10000; // como mucho 10 s extra: nunca bloquear la carga
  for (const id of rest) {
    if (!gaps(method, rows) || Date.now() > deadline) break;
    if (id === 'av' || queueDelay(id) > 2000) continue; // Alpha Vantage (25/día) no se gasta en completar
    try {
      let tm; // el temporizador se limpia siempre (la petición en sí tiene su propio tiempo máximo en http.js)
      const r = await Promise.race([P[id][method](...args), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('lento')), Math.max(1000, deadline - Date.now())); })]).finally(() => clearTimeout(tm));
      if (!Array.isArray(r.data) || !r.data.length) continue;
      // Misma moneda obligatoria (si alguna no la indica, no se mezcla)
      if (!cur || !r.data[0].reportedCurrency || r.data[0].reportedCurrency !== cur) continue;
      let added = false;
      // Se emparejan ejercicios por fecha de cierre (±45 días), no por la etiqueta del año: hay fuentes que llaman
      // «2024» al ejercicio que cierra en enero de 2025 y otras «2025»
      const endOf = (x) => (x.date ? new Date(x.date).getTime() : null);
      for (const o of r.data) {
        if (o.reportedCurrency && o.reportedCurrency !== cur) continue; // moneda comprobada fila a fila
        const eo = endOf(o);
        const mine = rows.find((x) => (eo && endOf(x) ? Math.abs(endOf(x) - eo) < 45 * 864e5 : fyOf(x) === fyOf(o)));
        if (!mine) { rows.push({ ...o, _from: id }); added = true; continue; }
        // Dentro de una fila ya existente no se mezclan acciones ni BPA de otra fuente (pueden ir sin ajustar a splits)
        for (const [k, v] of Object.entries(o)) if (mine[k] == null && v != null && !/eps|Shs|shares/i.test(k)) { mine[k] = v; added = true; }
      }
      if (added) used.push(id);
    } catch (e) { /* la fuente secundaria no aporta: se sigue con lo que hay */ }
  }
  rows.sort((a, b) => String(b.date || fyOf(b)).localeCompare(String(a.date || fyOf(a)))); // iguales = 0 (orden estable)
  const names = { fmp: 'FMP', av: 'Alpha Vantage', finnhub: 'Finnhub', td: 'Twelve Data', roic: 'ROIC.AI', sec: 'SEC EDGAR', esef: 'ESEF' };
  return used.length > 1 ? { ...base, data: rows.slice(0, Math.max(args[2] || 15, base.data.length)), source: used.map((u) => names[u] || u).join(' + '), merged: used } : base;
}

const EMPTY_OK = new Set(['splits', 'dividends', 'insiders', 'filings', 'pressReleases', 'news', 'dividendsCalendar', 'grades', 'gradesHistorical']);

async function run(method, args, order) {
  const list = chain(method, args, order);
  if (!list.length) {
    const anyBlocked = (ORDER[method] || ['fmp']).some((id) => isBlocked(id, args));
    const names = { fmp: 'FMP', av: 'Alpha Vantage', finnhub: 'Finnhub', td: 'Twelve Data', roic: 'ROIC.AI', sec: 'SEC EDGAR', esef: 'ESEF' };
    const who = (ORDER[method] || ['fmp']).map((id) => names[id]).join(', ');
    throw anyBlocked ? new ApiError('premium', `Solo lo ofrece ${who} y su plan gratuito no cubre esta empresa`) : new ApiError('no_key', `Solo lo ofrece ${who}: añade su clave en Ajustes`);
  }
  let best = null, emptyHit = null; const tried = [];
  for (const [i, id] of list.entries()) {
    // Alpha Vantage (25/día) no se gasta si otra fuente ya respondió «vacío» para una empresa de EE. UU.
    if (emptyHit && id === 'av' && isSym(args[0]) && !String(args[0]).includes('.')) continue;
    // Una fuente con cola por límite de minuto se salta si hay alternativas detrás (no hacer esperar)
    if (i < list.length - 1 && queueDelay(id) > 8000) { tried.push([id, 'en cola por límite por minuto']); continue; }
    try {
      const r = await P[id][method](...args);
      // Una lista vacía es una respuesta válida en estos datos («no tiene splits», «no paga dividendo»…): no es un fallo
      // …pero se sigue probando con las demás fuentes por si alguna sí tiene datos (FMP puede no cubrir la empresa)
      if (Array.isArray(r.data) && r.data.length === 0 && EMPTY_OK.has(method)) { emptyHit = emptyHit || { ...r, provider: id }; continue; }
      const empty = r.data == null || (Array.isArray(r.data) && r.data.length === 0);
      if (empty) { tried.push([id, 'sin datos']); best = best || new ApiError('not_found', 'Sin datos', { provider: id }); continue; }
      if (method === 'profile' && r.data) setHint(args[0], { name: r.data.companyName, isin: r.data.isin, country: r.data.country });
      if (KEYF[method] && args[1] !== 'quarter' && gaps(method, r.data, args[2] ?? 15)) return await complete(method, args, { ...r, provider: id }, list.slice(i + 1));
      return { ...r, provider: id };
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(e.code || 'not_found', e.message || 'Sin datos', { provider: id });
      tried.push([id, ({ premium: 'plan de pago', not_found: 'sin datos', rate_limit: 'límite alcanzado', bad_key: 'clave no válida', network: 'no responde', no_key: 'sin clave', needs_proxy: 'necesita el Worker' })[err.code] || err.message]);
      if (err.code === 'bad_key' || err.code === 'no_key') badKeys.add(id); // sin clave (también en el Worker): no se reintenta en esta sesión
      if (err.code === 'premium' && isSym(args[0]) && ['profile', 'income', 'quote'].includes(method)) block(id, args[0]);
      if (!best || (PRIORITY[err.code] || 0) > (PRIORITY[best.code] || 0)) best = err;
    }
  }
  const names = { fmp: 'FMP', av: 'Alpha Vantage', finnhub: 'Finnhub', td: 'Twelve Data', roic: 'ROIC.AI', sec: 'SEC EDGAR', esef: 'ESEF' };
  const skipped = (ORDER[method] || ['fmp']).filter((id) => !list.includes(id)).map((id) => [id, isBlocked(id, args) ? 'plan de pago (bloqueado 3 días)' : !config.canUse(id) ? (id === 'sec' ? 'necesita el Worker' : 'sin clave') : 'cuota del día gastada']);
  if (emptyHit) return emptyHit; // nadie tenía datos: la respuesta válida es «lista vacía»
  if (best) best.tried = [...tried, ...skipped].map(([id, why]) => `${names[id] || id}: ${why}`).join(' · ');
  throw best;
}

/** Búsqueda: primero fuentes sin tope diario; FMP y ROIC.AI solo si hacen falta más resultados. */
// Nombres populares que no coinciden con el nombre oficial (las fuentes devuelven antes ETF «SpaceX» que la propia SpaceX)
const ALIAS = { SPACEX: ['SPCX', 'Space Exploration Technologies Corp.'], GOOGLE: ['GOOGL', 'Alphabet Inc.'], FACEBOOK: ['META', 'Meta Platforms, Inc.'], INDITEX: ['ITX.MC', 'Industria de Diseño Textil, S.A.'], ZARA: ['ITX.MC', 'Industria de Diseño Textil, S.A.'], BERKSHIRE: ['BRK-B', 'Berkshire Hathaway Inc.'], BUFFETT: ['BRK-B', 'Berkshire Hathaway Inc.'], TSMC: ['TSM', 'Taiwan Semiconductor Manufacturing'], COCACOLA: ['KO', 'The Coca-Cola Company'] };

async function search(query) {
  const al = ALIAS[String(query).toUpperCase().replace(/[^A-Z]/g, '')];
  const r = await searchRaw(query);
  if (al && !r.data.some((x) => x.symbol === al[0])) r.data.unshift({ symbol: al[0], name: al[1], exchange: al[0].includes('.') ? 'BME' : 'NASDAQ', _alias: true });
  return r;
}

async function searchRaw(query) {
  const tiers = [['finnhub', 'td', 'sec'], ['fmp'], ['roic', 'av']];
  const seen = new Set(), out = []; let lastErr = null; const src = [];
  for (const tier of tiers) {
    const ids = tier.filter((id) => config.canUse(id) && !(demoted(id) && out.length));
    const res = await Promise.allSettled(ids.map((id) => P[id].search(query)));
    res.forEach((r, i) => {
      if (r.status === 'rejected') { lastErr = r.reason; return; }
      src.push(P[ids[i]].name);
      for (const x of r.value.data || []) {
        if (!x.symbol || /^0[A-Z0-9]{3}(\.(L|IL))?$/.test(x.symbol)) continue;
        if (seen.has(x.symbol)) { const o = out.find((y) => y.symbol === x.symbol); for (const [k, v] of Object.entries(x)) if (o[k] == null || o[k] === '') o[k] = v; continue; } // completar bolsa, moneda…
        seen.add(x.symbol); out.push({ ...x });
      }
    });
    if (out.length >= 4) break;
  }
  if (!out.length && lastErr) throw lastErr;
  return { data: out, source: src.join(' + '), fetchedAt: Date.now() };
}

const METHODS = ['profile', 'quote', 'priceChange', 'pricesDaily', 'pricesAdjusted', 'intraday', 'income', 'balance', 'cashflow',
  'incomeTTM', 'balanceTTM', 'cashflowTTM', 'keyMetrics', 'ratios', 'keyMetricsTTM', 'ratiosTTM', 'scores', 'enterpriseValues', 'dcf',
  'estimates', 'priceTarget', 'gradesConsensus', 'grades', 'gradesHistorical', 'peers', 'dividends', 'splits', 'earnings', 'earningsCalendar', 'dividendsCalendar',
  'news', 'pressReleases', 'insiders', 'institutional', 'filings', 'treasury', 'riskPremium', 'screener', 'productSegments', 'geoSegments', 'fx', 'index'];

export const data = Object.fromEntries(METHODS.map((m) => [m, (...a) => run(m, a)]));
data.search = search;
data.profileLite = (sym) => run('profile', [sym]); // sin completar con otras fuentes (competidores, screener)
/** Igual que data[method] pero con otro orden de fuentes (p. ej. análisis masivo: Finnhub primero para no gastar FMP). */
data.via = (order, method, ...args) => run(method, args, order);
/** Claves nuevas en Ajustes (guardadas o importadas): las fuentes rechazadas antes vuelven a probarse. */
export function resetProviders() { badKeys.clear(); }
/** Olvida los datos en memoria de una empresa (botón «Actualizar»). La caché del Worker, si lo usas, expira sola. */
export function forget(sym) {
  forgetFinnhub(sym); forgetSec(sym); forgetEsef(sym);
  for (const k of Object.keys(blocked)) if (k.endsWith(`:${sym}`)) delete blocked[k];
  try { localStorage.setItem(BLK, JSON.stringify(blocked)); } catch {}
}

/** Perfil combinado: se toma el mejor y se completan los campos que falten con las demás fuentes. */
const PROFILE_FIELDS = ['description', 'beta', 'range', 'sector', 'industry', 'ceo', 'website', 'currency', 'country', 'exchange', 'marketCap', 'sharesOutstanding', 'fullTimeEmployees', 'ipoDate', 'isin', 'cik'];
data.profile = async (sym) => {
  const base = await run('profile', [sym]);
  const p = { ...base.data };
  const missing = () => PROFILE_FIELDS.filter((k) => p[k] == null || p[k] === '');
  const filled = [];
  for (const id of ['finnhub', 'roic', 'av']) {
    if (!missing().length || id === base.provider || !config.canUse(id) || isBlocked(id, [sym]) || !P[id].profile) continue;
    if (id === 'av' && !missing().includes('description')) continue;
    try { const r = await P[id].profile(sym); let used = false; for (const k of missing()) if (r.data[k] != null && r.data[k] !== '') { p[k] = r.data[k]; used = true; } if (used) filled.push(P[id].name); } catch {}
  }
  setHint(sym, { name: p.companyName, isin: p.isin, country: p.country });
  return { ...base, data: p, source: [base.source, ...filled].join(' + ') };
};
data.logo = fmp.logo;
export { setHint };

/** Ejecuta varias peticiones y nunca lanza: devuelve {ok, value|error} por clave. */
export async function gather(map, ms = 0) {
  const keys = Object.keys(map);
  const lim = (p) => { if (!ms) return p; let tm; return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new ApiError('network', 'La fuente tarda demasiado; inténtalo de nuevo en un minuto')), ms); })]).finally(() => clearTimeout(tm)); };
  const res = await Promise.allSettled(keys.map((k) => lim(Promise.resolve().then(map[k]))));
  return Object.fromEntries(keys.map((k, i) => [k, res[i].status === 'fulfilled' ? { ok: true, ...res[i].value } : { ok: false, error: res[i].reason }]));
}
