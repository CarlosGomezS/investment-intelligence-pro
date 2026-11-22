// Servicio de datos con proveedores intercambiables.
// Cada método prueba los proveedores en orden de prioridad y devuelve el primero que responde,
// junto con su procedencia y fecha. Si ninguno tiene el dato, se propaga el error más informativo.
import { fmp } from './fmp.js';
import { alphavantage } from './alphavantage.js';
import { config } from '../config.js';
import { ApiError } from './http.js';

const PROVIDERS = [fmp, alphavantage];

function available() {
  const c = config.get();
  if (c.proxyUrl) return PROVIDERS;
  return PROVIDERS.filter((p) => (p.id === 'fmp' ? c.fmpKey : c.avKey));
}

const PRIORITY = { premium: 5, rate_limit: 4, bad_key: 6, network: 3, not_found: 2, no_key: 1, bad_response: 2 };

async function run(method, args) {
  const list = available().filter((p) => typeof p[method] === 'function');
  if (!list.length) throw new ApiError('no_key', 'Configura al menos una clave de API en Ajustes');
  let best = null;
  for (const p of list) {
    try {
      const r = await p[method](...args);
      const empty = r.data == null || (Array.isArray(r.data) && r.data.length === 0);
      if (empty && p !== list[list.length - 1]) { best = best || new ApiError('not_found', 'Sin datos', { provider: p.id }); continue; }
      return { ...r, provider: p.id };
    } catch (e) {
      if (!best || (PRIORITY[e.code] || 0) > (PRIORITY[best.code] || 0)) best = e;
    }
  }
  throw best;
}

const METHODS = ['search', 'profile', 'quote', 'priceChange', 'pricesDaily', 'pricesAdjusted', 'intraday', 'income', 'balance', 'cashflow',
  'incomeTTM', 'balanceTTM', 'cashflowTTM', 'keyMetrics', 'ratios', 'keyMetricsTTM', 'ratiosTTM', 'scores', 'enterpriseValues', 'dcf',
  'estimates', 'priceTarget', 'gradesConsensus', 'grades', 'gradesHistorical', 'peers', 'dividends', 'splits', 'earnings', 'earningsCalendar', 'dividendsCalendar',
  'news', 'pressReleases', 'insiders', 'institutional', 'filings', 'treasury', 'riskPremium', 'screener', 'productSegments', 'geoSegments', 'fx', 'index'];

export const data = Object.fromEntries(METHODS.map((m) => [m, (...a) => run(m, a)]));
data.logo = fmp.logo;

/** Ejecuta varias peticiones y nunca lanza: devuelve {ok, value|error} por clave. */
export async function gather(map) {
  const keys = Object.keys(map);
  const res = await Promise.allSettled(keys.map((k) => map[k]()));
  return Object.fromEntries(keys.map((k, i) => [k, res[i].status === 'fulfilled' ? { ok: true, ...res[i].value } : { ok: false, error: res[i].reason }]));
}
