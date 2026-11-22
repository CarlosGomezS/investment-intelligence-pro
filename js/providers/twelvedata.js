// Twelve Data (gratis: 800 créditos/día, 8/minuto; cotizaciones de EE. UU. y divisas).
// Se usa para cotización, histórico de precios y tipos de cambio.
import { getJSON } from './http.js?v=b26089cc';
import { config } from '../config.js?v=b26089cc';

const H = () => config.get().cacheHours;
const q = (path, params, ttl, v) => getJSON('td', path, params, ttl, v);
const n = (v) => (v == null || v === '' ? null : Number(v));
// Sufijo de bolsa estilo Yahoo/FMP → código de mercado de Twelve Data
const EX = { MC: 'BME', DE: 'XETR', PA: 'Euronext', AS: 'Euronext', BR: 'Euronext', LS: 'Euronext', L: 'LSE', MI: 'MTA', SW: 'SIX', TO: 'TSX', T: 'JPX', HK: 'HKEX', AX: 'ASX', ST: 'OMX', CO: 'OMXC', HE: 'OMXH', OL: 'OSE' };
function sym(s) { const [b, x] = s.split('.'); return x && EX[x] ? { symbol: b, exchange: EX[x] } : { symbol: s }; }

export const twelvedata = {
  id: 'td', name: 'Twelve Data',
  async search(query) {
    const r = await q('symbol_search', { symbol: query, outputsize: 12 }, H().static, (b) => b && Array.isArray(b.data));
    return { ...r, data: r.data.data.filter((x) => /Common Stock|Depositary/i.test(x.instrument_type || '')).map((x) => ({ symbol: x.symbol, name: x.instrument_name, exchange: x.exchange, currency: x.currency, country: x.country, _source: 'Twelve Data' })) };
  },
  async quote(s) {
    const r = await q('quote', sym(s), H().quote, (b) => b && b.close);
    const x = r.data;
    return { ...r, data: { symbol: s, name: x.name, price: n(x.close), change: n(x.change), changePercentage: n(x.percent_change), previousClose: n(x.previous_close), volume: n(x.volume), currency: x.currency, yearHigh: x.fifty_two_week && n(x.fifty_two_week.high), yearLow: x.fifty_two_week && n(x.fifty_two_week.low) } };
  },
  async pricesDaily(s, from) {
    const r = await q('time_series', { ...sym(s), interval: '1day', outputsize: 5000, start_date: from && from > '1990' ? from : undefined }, H().prices, (b) => b && Array.isArray(b.values));
    return { ...r, data: r.data.values.map((p) => ({ date: p.datetime.slice(0, 10), open: n(p.open), high: n(p.high), low: n(p.low), close: n(p.close), volume: n(p.volume) })).sort((a, b) => a.date.localeCompare(b.date)) };
  },
  async fx(pair) {
    const r = await q('exchange_rate', { symbol: `${pair.slice(0, 3)}/${pair.slice(3, 6)}` }, H().prices, (b) => b && b.rate);
    return { ...r, data: { symbol: pair, price: n(r.data.rate) } };
  },
};
