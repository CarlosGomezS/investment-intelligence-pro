// SEC EDGAR (oficial, gratuito, sin clave). Cubre empresas de EE. UU. y extranjeras registradas en la SEC
// (20-F/40-F: ASML, TSMC, Santander, Novo Nordisk…). Requiere el Worker: la SEC no admite llamadas desde el navegador.
import { getJSON } from './http.js?v=e1106417';
import { config } from '../config.js?v=e1106417';
import { toStatements } from './xbrl.js?v=e1106417';
import { hint } from './hints.js?v=e1106417';

const H = () => config.get().cacheHours;
let tickers = null;

async function tickerMap() {
  if (tickers) return tickers;
  const r = await getJSON('sec', 'files/company_tickers.json', {}, H().static * 2);
  tickers = Object.values(r.data || {}).map((x) => ({ cik: String(x.cik_str).padStart(10, '0'), ticker: x.ticker, title: x.title }));
  return tickers;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|corp|corporation|co|ltd|plc|sa|s a|nv|n v|ag|se|spa|s p a|group|holding|holdings|the|company|limited)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Resuelve un símbolo a CIK: ticker exacto; si lleva sufijo de bolsa (SAN.MC), ticker base solo si el nombre coincide. */
export async function cikFor(sym) {
  const T = await tickerMap(), s = sym.toUpperCase().replace(/-/g, '.');
  const exact = T.find((t) => t.ticker.replace(/-/g, '.') === s);
  if (exact) return exact;
  const h = hint(sym);
  const base = s.split('.')[0];
  if (h && h.name) {
    const nm = norm(h.name);
    const byBase = T.find((t) => t.ticker === base && norm(t.title) === nm);
    if (byBase) return byBase;
    const byName = T.find((t) => norm(t.title) === nm);
    if (byName) return byName;
  }
  return null;
}

async function facts(sym) {
  const c = await cikFor(sym);
  if (!c) throw Object.assign(new Error('Empresa no registrada en la SEC'), { code: 'not_found', provider: 'sec' });
  const r = await getJSON('sec', `api/xbrl/companyfacts/CIK${c.cik}.json`, {}, H().fundamentals);
  const F = [];
  for (const tax of ['us-gaap', 'ifrs-full']) {
    const g = (r.data.facts || {})[tax]; if (!g) continue;
    for (const [concept, def] of Object.entries(g)) for (const [unit, arr] of Object.entries(def.units || {})) for (const x of arr) {
      if (!/^(10-K|20-F|40-F)/.test(x.form || '')) continue;
      F.push({ concept: `${tax}:${concept}`, start: x.start, end: x.end, val: x.val, unit, filed: x.filed });
    }
  }
  return { st: toStatements(F, sym), meta: r, cik: c };
}

const memo = new Map();
const statements = (sym) => { if (!memo.has(sym)) memo.set(sym, facts(sym).catch((e) => { memo.delete(sym); throw e; })); return memo.get(sym); };

function wrap(sel) {
  return async (sym) => { const { st, meta } = await statements(sym); return { data: st[sel], source: 'SEC EDGAR', endpoint: 'companyfacts', fetchedAt: meta.fetchedAt, cached: meta.cached }; };
}

export const sec = {
  id: 'sec', name: 'SEC EDGAR',
  async search(q) {
    const T = await tickerMap(), Q = q.toUpperCase(), nq = norm(q);
    const out = T.filter((t) => t.ticker.startsWith(Q) || norm(t.title).includes(nq)).slice(0, 10).map((t) => ({ symbol: t.ticker, name: t.title, exchange: 'SEC', _source: 'SEC EDGAR' }));
    return { data: out, source: 'SEC EDGAR', endpoint: 'company_tickers', fetchedAt: Date.now() };
  },
  async profile(sym) {
    const c = await cikFor(sym); if (!c) throw Object.assign(new Error('No registrada en la SEC'), { code: 'not_found' });
    const r = await getJSON('sec', `submissions/CIK${c.cik}.json`, {}, H().static);
    const d = r.data;
    return { ...r, data: { symbol: sym, companyName: d.name, cik: c.cik, exchange: (d.exchanges || [])[0], sector: d.sicDescription, industry: d.sicDescription, country: d.addresses && d.addresses.business && d.addresses.business.stateOrCountryDescription, website: d.website || null, _fiscalYearEnd: d.fiscalYearEnd, _source: 'SEC EDGAR' } };
  },
  income: wrap('income'),
  balance: wrap('balance'),
  cashflow: wrap('cashflow'),
  async filings(sym, from) {
    const c = await cikFor(sym); if (!c) throw Object.assign(new Error('No registrada en la SEC'), { code: 'not_found' });
    const r = await getJSON('sec', `submissions/CIK${c.cik}.json`, {}, H().fundamentals);
    const R = r.data.filings && r.data.filings.recent; if (!R) return { ...r, data: [] };
    const out = R.form.map((f, i) => ({ formType: f, filingDate: R.filingDate[i], link: `https://www.sec.gov/Archives/edgar/data/${Number(c.cik)}/${R.accessionNumber[i].replace(/-/g, '')}/${R.primaryDocument[i]}` })).filter((x) => !from || x.filingDate >= from);
    return { ...r, data: out };
  },
};
