// Proveedor Financial Modeling Prep (API "stable"). Devuelve datos ya en el modelo canónico
// (el modelo canónico de la app usa los nombres de campo de FMP; ver docs/ARQUITECTURA.md).
import { getJSON } from './http.js?v=7feadaa0';
import { config } from '../config.js?v=7feadaa0';

const H = () => config.get().cacheHours;
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const nonEmpty = (b) => Array.isArray(b) ? b.length > 0 : !!b && typeof b === 'object';
const q = (path, params, ttl, v = nonEmpty) => getJSON('fmp', path, params, ttl, v).then((r) => ({ ...r, data: r.data }));

export const fmp = {
  id: 'fmp',
  name: 'Financial Modeling Prep',
  async search(query) {
    const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(query.toUpperCase());
    if (isIsin) return q('search-isin', { isin: query.toUpperCase() }, H().static, () => true);
    const [a, b] = await Promise.allSettled([
      q('search-symbol', { query, limit: 12 }, H().static, () => true),
      q('search-name', { query, limit: 12 }, H().static, () => true),
    ]);
    const seen = new Set(), out = [];
    for (const r of [a, b]) if (r.status === 'fulfilled') for (const x of arr(r.value.data)) if (x.symbol && !seen.has(x.symbol)) { seen.add(x.symbol); out.push(x); }
    if (!out.length && a.status === 'rejected') throw a.reason;
    return { data: out, source: this.name, fetchedAt: Date.now() };
  },
  profile: (s) => q('profile', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  quote: (s) => q('quote', { symbol: s }, H().quote).then((r) => ({ ...r, data: arr(r.data)[0] })),
  priceChange: (s) => q('stock-price-change', { symbol: s }, H().quote).then((r) => ({ ...r, data: arr(r.data)[0] })),
  pricesDaily: (s, from) => q('historical-price-eod/full', { symbol: s, from }, H().prices).then((r) => ({ ...r, data: arr(r.data).map((p) => ({ date: p.date, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume })).sort((a, b) => a.date.localeCompare(b.date)) })),
  pricesAdjusted: (s, from) => q('historical-price-eod/dividend-adjusted', { symbol: s, from }, H().prices).then((r) => ({ ...r, data: arr(r.data).map((p) => ({ date: p.date, close: p.adjClose ?? p.close, volume: p.volume })).sort((a, b) => a.date.localeCompare(b.date)) })),
  intraday: (s, from, to) => q('historical-chart/5min', { symbol: s, from, to }, H().quote).then((r) => ({ ...r, data: arr(r.data).map((p) => ({ date: p.date, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume })).sort((a, b) => a.date.localeCompare(b.date)) })),
  income: (s, period = 'annual', limit = 15) => q('income-statement', { symbol: s, period, limit }, H().fundamentals),
  balance: (s, period = 'annual', limit = 15) => q('balance-sheet-statement', { symbol: s, period, limit }, H().fundamentals),
  cashflow: (s, period = 'annual', limit = 15) => q('cash-flow-statement', { symbol: s, period, limit }, H().fundamentals),
  incomeTTM: (s) => q('income-statement-ttm', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  balanceTTM: (s) => q('balance-sheet-statement-ttm', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  cashflowTTM: (s) => q('cash-flow-statement-ttm', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  keyMetrics: (s, period = 'annual', limit = 15) => q('key-metrics', { symbol: s, period, limit }, H().fundamentals),
  ratios: (s, period = 'annual', limit = 15) => q('ratios', { symbol: s, period, limit }, H().fundamentals),
  keyMetricsTTM: (s) => q('key-metrics-ttm', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  ratiosTTM: (s) => q('ratios-ttm', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  scores: (s) => q('financial-scores', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  enterpriseValues: (s, limit = 15) => q('enterprise-values', { symbol: s, limit }, H().fundamentals),
  dcf: (s) => q('discounted-cash-flow', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  estimates: (s, period = 'annual', limit = 10) => q('analyst-estimates', { symbol: s, period, limit }, H().fundamentals),
  priceTarget: (s) => q('price-target-consensus', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  gradesConsensus: (s) => q('grades-consensus', { symbol: s }, H().fundamentals).then((r) => ({ ...r, data: arr(r.data)[0] })),
  grades: (s, limit = 30) => q('grades', { symbol: s, limit }, H().fundamentals),
  gradesHistorical: (s, limit = 24) => q('grades-historical', { symbol: s, limit }, H().fundamentals),
  peers: (s) => q('stock-peers', { symbol: s }, H().static),
  dividends: (s) => q('dividends', { symbol: s, limit: 400 }, H().fundamentals, () => true),
  splits: (s) => q('splits', { symbol: s }, H().static, () => true),
  earnings: (s) => q('earnings', { symbol: s, limit: 24 }, H().fundamentals, () => true),
  dividendsCalendar: (from, to) => q('dividends-calendar', { from, to }, H().prices, () => true),
  earningsCalendar: (from, to) => q('earnings-calendar', { from, to }, H().prices, () => true),
  news: (s, limit = 40) => q('news/stock', { symbols: s, limit }, H().quote * 10, () => true),
  pressReleases: (s, limit = 20) => q('news/press-releases', { symbols: s, limit }, H().quote * 10, () => true),
  insiders: (s, limit = 60) => q('insider-trading/search', { symbol: s, limit }, H().fundamentals, () => true),
  institutional: (s, year, quarter) => q('institutional-ownership/symbol-positions-summary', { symbol: s, year, quarter }, H().static, () => true),
  filings: (s, from, to) => q('sec-filings-search/symbol', { symbol: s, from, to, limit: 100 }, H().fundamentals, () => true),
  treasury: (from) => q('treasury-rates', { from }, H().fundamentals),
  riskPremium: () => q('market-risk-premium', {}, H().static),
  screener: (params) => q('company-screener', params, H().prices, () => true),
  productSegments: (s) => q('revenue-product-segmentation', { symbol: s }, H().static, () => true),
  geoSegments: (s) => q('revenue-geographic-segmentation', { symbol: s }, H().static, () => true),
  fx: (pair) => q('quote', { symbol: pair }, H().prices).then((r) => ({ ...r, data: arr(r.data)[0] })),
  index: (s, from) => q('historical-price-eod/light', { symbol: s, from }, H().prices).then((r) => ({ ...r, data: arr(r.data).map((p) => ({ date: p.date, close: p.price ?? p.close })).sort((a, b) => a.date.localeCompare(b.date)) })),
  logo: (s) => `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(s)}.png`,
};
