// Finnhub (gratis: 60 peticiones/minuto, sin tope diario; datos de EE. UU.).
// Se usa para cotización, perfil, ratios TTM, competidores, recomendaciones, resultados, noticias y calendario,
// y así se reserva la cuota diaria de FMP para lo que solo da FMP.
import { getJSON } from './http.js';
import { config } from '../config.js';

const H = () => config.get().cacheHours;
const q = (path, params, ttl, v) => getJSON('finnhub', path, params, ttl, v);
const pc = (v) => (typeof v === 'number' ? v / 100 : null);
const nonEmpty = (b) => b && typeof b === 'object' && Object.keys(b).length > 0;

export const finnhub = {
  id: 'finnhub', name: 'Finnhub',
  async search(query) {
    const r = await q('search', { q: query }, H().static, (b) => b && Array.isArray(b.result));
    return { ...r, data: r.data.result.filter((x) => /Common Stock|ADR|EQS/i.test(x.type || 'Common Stock')).slice(0, 12).map((x) => ({ symbol: x.symbol, name: x.description, exchange: x.symbol.includes('.') ? x.symbol.split('.')[1] : 'US', _source: 'Finnhub' })) };
  },
  async profile(sym) {
    const r = await q('stock/profile2', { symbol: sym }, H().fundamentals, (b) => b && b.name);
    const p = r.data;
    return { ...r, data: { symbol: sym, companyName: p.name, currency: p.currency, exchange: p.exchange, exchangeFullName: p.exchange, country: p.country, industry: p.finnhubIndustry, sector: p.finnhubIndustry, marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null, sharesOutstanding: p.shareOutstanding ? p.shareOutstanding * 1e6 : null, website: p.weburl, ipoDate: p.ipo, _source: 'Finnhub' } };
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
    const pfcf = m.pfcfShareTTM ?? m['currentEv/freeCashFlowTTM'];
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
    return { ...r, data: r.data.map((e) => ({ date: e.period, epsActual: e.actual, epsEstimated: e.estimate })) };
  },
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
