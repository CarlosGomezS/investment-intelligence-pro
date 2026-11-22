// Servicio de datos con proveedores intercambiables y reparto de cuota.
//
// Para cada tipo de dato hay un orden de preferencia (calidad primero). Antes de cada petición:
//  - se descartan los proveedores sin clave (o que requieren el Worker y no está configurado);
//  - los proveedores con tope diario que ya han gastado ≥70 % de su cuota pasan al final de la cola,
//    para que la cuota que queda se use solo cuando nadie más tiene el dato.
// Se devuelve el primer proveedor que responde con datos, junto con su procedencia.
import { fmp } from './fmp.js';
import { alphavantage } from './alphavantage.js';
import { finnhub } from './finnhub.js';
import { twelvedata } from './twelvedata.js';
import { roic } from './roic.js';
import { sec } from './sec.js';
import { esef } from './esef.js';
import { config } from '../config.js';
import { ApiError, usage, queueDelay } from './http.js';
import { setHint } from './hints.js';

const P = { fmp, av: alphavantage, finnhub, td: twelvedata, roic, sec, esef };

const STATEMENTS = ['fmp', 'sec', 'esef', 'roic', 'av'];
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
const BLK = 'iip.blocked.v1';
let blocked = (() => { try { const b = JSON.parse(localStorage.getItem(BLK) || '{}'); const now = Date.now(); return Object.fromEntries(Object.entries(b).filter(([, t]) => now - t < 3 * 864e5)); } catch { return {}; } })();
const isSym = (x) => typeof x === 'string' && /^[A-Z0-9.^\-]{1,15}$/i.test(x);
function block(id, sym) { blocked[`${id}:${sym}`] = Date.now(); try { localStorage.setItem(BLK, JSON.stringify(blocked)); } catch {} }
const isBlocked = (id, args) => isSym(args[0]) && !!blocked[`${id}:${args[0]}`];

function demoted(id) {
  const lim = (config.get().limits || {})[id];
  return lim ? (usage()[id] || 0) >= lim * 0.7 : false;
}
function chain(method, args) {
  let ids = ORDER[method] || ['fmp'];
  if (['income', 'balance', 'cashflow'].includes(method) && args[1] === 'quarter') ids = QUARTERLY;
  ids = ids.filter((id) => config.canUse(id) && typeof P[id][method] === 'function' && !isBlocked(id, args));
  return [...ids.filter((id) => !demoted(id)), ...ids.filter(demoted)];
}

const PRIORITY = { premium: 5, rate_limit: 4, bad_key: 6, needs_proxy: 1, network: 3, not_found: 2, no_key: 1, bad_response: 2 };

async function run(method, args) {
  const list = chain(method, args);
  if (!list.length) {
    const anyBlocked = (ORDER[method] || ['fmp']).some((id) => isBlocked(id, args));
    throw anyBlocked ? new ApiError('premium', 'Tus fuentes gratuitas no ofrecen este dato para esta empresa') : new ApiError('no_key', 'Ningún proveedor configurado ofrece este dato. Revisa Ajustes.');
  }
  let best = null;
  for (const [i, id] of list.entries()) {
    // Una fuente con cola por límite de minuto se salta si hay alternativas detrás (no hacer esperar)
    if (i < list.length - 1 && queueDelay(id) > 8000) continue;
    try {
      const r = await P[id][method](...args);
      const empty = r.data == null || (Array.isArray(r.data) && r.data.length === 0);
      if (empty) { best = best || new ApiError('not_found', 'Sin datos', { provider: id }); continue; }
      if (method === 'profile' && r.data) setHint(args[0], { name: r.data.companyName, isin: r.data.isin, country: r.data.country });
      return { ...r, provider: id };
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(e.code || 'not_found', e.message || 'Sin datos', { provider: id });
      if (err.code === 'premium' && isSym(args[0]) && ['profile', 'income', 'quote'].includes(method)) block(id, args[0]);
      if (!best || (PRIORITY[err.code] || 0) > (PRIORITY[best.code] || 0)) best = err;
    }
  }
  throw best;
}

/** Búsqueda: primero fuentes sin tope diario; FMP y ROIC.AI solo si hacen falta más resultados. */
async function search(query) {
  const tiers = [['finnhub', 'td', 'sec'], ['fmp'], ['roic', 'av']];
  const seen = new Set(), out = []; let lastErr = null; const src = [];
  for (const tier of tiers) {
    const ids = tier.filter((id) => config.canUse(id) && !(demoted(id) && out.length));
    const res = await Promise.allSettled(ids.map((id) => P[id].search(query)));
    res.forEach((r, i) => {
      if (r.status === 'rejected') { lastErr = r.reason; return; }
      src.push(P[ids[i]].name);
      for (const x of r.value.data || []) if (x.symbol && !seen.has(x.symbol)) { seen.add(x.symbol); out.push(x); }
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
data.logo = fmp.logo;
export { setHint };

/** Ejecuta varias peticiones y nunca lanza: devuelve {ok, value|error} por clave. */
export async function gather(map) {
  const keys = Object.keys(map);
  const res = await Promise.allSettled(keys.map((k) => map[k]()));
  return Object.fromEntries(keys.map((k, i) => [k, res[i].status === 'fulfilled' ? { ok: true, ...res[i].value } : { ok: false, error: res[i].reason }]));
}
