// Finnhub (gratis: 60 peticiones/minuto, sin tope diario; datos de EE. UU.).
// Se usa para cotización, perfil, ratios TTM, competidores, recomendaciones, resultados, noticias y calendario,
// y así se reserva la cuota diaria de FMP para lo que solo da FMP.
import { getJSON } from './http.js?v=5ad630d4';
import { config } from '../config.js?v=5ad630d4';
import { toStatements } from './xbrl.js?v=5ad630d4';

const H = () => config.get().cacheHours;
const q = (path, params, ttl, v) => getJSON('finnhub', path, params, ttl, v);
const pc = (v) => (typeof v === 'number' ? v / 100 : null);
const nonEmpty = (b) => b && typeof b === 'object' && Object.keys(b).length > 0;

// Estados presentados ante la SEC (10-K / 20-F), gratis en Finnhub: se normalizan con el mismo mapeo XBRL que SEC EDGAR.
const stMemo = new Map();
export const forgetFinnhub = (sym) => stMemo.delete(sym);
async function reported(sym) {
  if (stMemo.has(sym)) return stMemo.get(sym);
  const p = (async () => {
    const r = await q('stock/financials-reported', { symbol: sym, freq: 'annual' }, H().fundamentals, (b) => b && Array.isArray(b.data) && b.data.length);
    const F = [];
    for (const d of r.data.data) {
      const start = String(d.startDate || '').slice(0, 10), end = String(d.endDate || '').slice(0, 10);
      for (const [sec, items] of Object.entries(d.report || {})) for (const it of items || []) {
        if (it.value == null || typeof it.value !== 'number') continue;
        const c = String(it.concept || '');
        const concept = c.includes('_') ? c.replace('_', ':') : 'us-gaap:' + c;
        F.push({ concept, start: sec === 'bs' ? null : start, end, val: it.value, unit: /share/i.test(it.unit || '') ? it.unit : String(it.unit || 'usd').toUpperCase(), filed: d.filedDate });
      }
    }
    return { st: toStatements(F, sym, 12), meta: r };
  })();
  stMemo.set(sym, p); p.catch(() => stMemo.delete(sym));
  return p;
}
const stWrap = (sel) => async (sym, period) => {
  if (period === 'quarter') throw Object.assign(new Error('Solo anual'), { code: 'not_found' });
  const { st, meta } = await reported(sym);
  return { data: st[sel], source: 'Finnhub (informes SEC)', endpoint: 'financials-reported', fetchedAt: meta.fetchedAt, cached: meta.cached };
};

export const finnhub = {
  income: stWrap('income'), balance: stWrap('balance'), cashflow: stWrap('cashflow'),
  id: 'finnhub', name: 'Finnhub',
  async search(query) {
    const r = await q('search', { q: query }, H().static, (b) => b && Array.isArray(b.result));
    return { ...r, data: r.data.result.filter((x) => /Common Stock|ADR|EQS/i.test(x.type || 'Common Stock')).slice(0, 12).map((x) => ({ symbol: x.symbol, name: x.description, exchange: x.symbol.includes('.') ? x.symbol.split('.')[1] : 'US', _source: 'Finnhub' })) };
  },
  async profile(sym) {
    const r = await q('stock/profile2', { symbol: sym }, H().fundamentals, (b) => b && b.name);
    const p = r.data;
    let mt = {}; try { mt = (await this._metric(sym)).data.metric || {}; } catch {}
    return { ...r, data: { symbol: sym, beta: mt.beta ?? null, range: mt['52WeekLow'] && mt['52WeekHigh'] ? `${mt['52WeekLow']}-${mt['52WeekHigh']}` : null, companyName: p.name, currency: p.currency, exchange: p.exchange, exchangeFullName: p.exchange, country: p.country, industry: p.finnhubIndustry, sector: p.finnhubIndustry, marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null, sharesOutstanding: p.shareOutstanding ? p.shareOutstanding * 1e6 : null, website: p.weburl, ipoDate: p.ipo, _source: 'Finnhub' } };
  },
  async quote(sym) {
    const r = await q('quote', { symbol: sym }, H().quote, (b) => b && b.c > 0);
    const x = r.data;
    return { ...r, data: { symbol: sym, price: x.c, change: x.d, changePercentage: x.dp, previousClose: x.pc, dayHigh: x.h, dayLow: x.l, open: x.o, timestamp: x.t } };
  },
  async _metric(sym) { return q('stock/metric', { symbol: sym, metric: 'all' }, H().fundamentals, (b) => b && nonEmpty(b.metric)); },
  async ratiosTTM(sym) {
    const r = await this._metric(sym), m = r.data.metric;
    return { ...r, data: { priceToEarningsRatioTTM: m.peTTM ?? m.peBasicExclExtraTTM, priceToSalesRatioTTM: m.psTTM, priceToBookRatioTTM: m.pbQuarterly ?? m.pbAnnual, grossProfitMarginTTM: pc(m.grossMarginTTM), operatingProfitMarginTTM: pc(m.operatingMarginTTM), netProfitMarginTTM: pc(m.netProfitMarginTTM), currentRatioTTM: m.currentRatioQuarterly ?? m.currentRatioAnnual, quickRatioTTM: m.quickRatioQuarterly ?? m.quickRatioAnnual, debtToEquityRatioTTM: m['totalDebt/totalEquityQuarterly'] ?? m['totalDebt/totalEquityAnnual'], dividendYieldTTM: pc(m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual), dividendPayoutRatioTTM: pc(m.payoutRatioTTM), _source: 'Finnhub' } };
  },
  async keyMetricsTTM(sym) {
    const r = await this._metric(sym), m = r.data.metric;
    const pfcf = m.pfcfShareTTM; // (EV/FCF no es precio/FCF: no se usa como sustituto)
    return { ...r, data: { returnOnEquityTTM: pc(m.roeTTM), returnOnAssetsTTM: pc(m.roaTTM), returnOnInvestedCapitalTTM: pc(m.roiTTM), freeCashFlowYieldTTM: pfcf > 0 ? 1 / pfcf : null, evToEBITDATTM: m.evEbitdaTTM ?? null, netDebtToEBITDATTM: null, _source: 'Finnhub' } };
  },
  async peers(sym) {
    const r = await q('stock/peers', { symbol: sym }, H().static, (b) => Array.isArray(b) && b.length > 1);
    return { ...r, data: r.data.filter((s) => s !== sym).slice(0, 8).map((s) => ({ symbol: s })) };
  },
  async gradesConsensus(sym) {
    const r = await q('stock/recommendation', { symbol: sym }, H().fundamentals, (b) => Array.isArray(b) && b.length);
    const x = r.data[0];
    const score = (x.strongBuy * 2 + x.buy - x.sell - x.strongSell * 2) / Math.max(1, x.strongBuy + x.buy + x.hold + x.sell + x.strongSell);
    return { ...r, data: { strongBuy: x.strongBuy, buy: x.buy, hold: x.hold, sell: x.sell, strongSell: x.strongSell, consensus: score > 0.75 ? 'Strong Buy' : score > 0.25 ? 'Buy' : score > -0.25 ? 'Hold' : 'Sell', _period: x.period } };
  },
  async gradesHistorical(sym) {
    const r = await q('stock/recommendation', { symbol: sym }, H().fundamentals, (b) => Array.isArray(b) && b.length);
    return { ...r, data: r.data.map((x) => ({ date: x.period, analystRatingsStrongBuy: x.strongBuy, analystRatingsBuy: x.buy, analystRatingsHold: x.hold, analystRatingsSell: x.sell, analystRatingsStrongSell: x.strongSell })) };
  },
  async earnings(sym) {
    const r = await q('stock/earnings', { symbol: sym }, H().fundamentals, (b) => Array.isArray(b));
    const out = r.data.map((e) => ({ date: e.period, epsActual: e.actual, epsEstimated: e.estimate }));
    try {
      const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 130 * 864e5).toISOString().slice(0, 10);
      const c = await q('calendar/earnings', { symbol: sym, from, to }, H().prices, (b) => b && Array.isArray(b.earningsCalendar));
      for (const e of c.data.earningsCalendar) out.push({ date: e.date, epsActual: e.epsActual ?? null, epsEstimated: e.epsEstimate, revenueEstimated: e.revenueEstimate });
    } catch {}
    return { ...r, data: out };
  },
  async metricAll(sym) { return this._metric(sym); },
  async news(sym) {
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const r = await q('company-news', { symbol: sym, from, to }, H().quote * 10, (b) => Array.isArray(b));
    return { ...r, data: r.data.slice(0, 50).map((n) => ({ title: n.headline, text: n.summary, url: n.url, site: n.source, publishedDate: new Date(n.datetime * 1000).toISOString().replace('T', ' ').slice(0, 16) })) };
  },
  async earningsCalendar(from, to) {
    const r = await q('calendar/earnings', { from, to }, H().prices, (b) => b && Array.isArray(b.earningsCalendar));
    return { ...r, data: r.data.earningsCalendar.map((e) => ({ symbol: e.symbol, date: e.date, epsEstimated: e.epsEstimate, epsActual: e.epsActual, revenueEstimated: e.revenueEstimate })) };
  },
};
