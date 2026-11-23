// 13.ª revisión (auditoría exhaustiva): datos desconocidos que se convertían en datos válidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveYear, lastAvg, piotroski, piotroskiRange } from '../js/calc/finance.js';
import { buildModel } from '../js/calc/model.js';
import { rankMethod, METHODS } from '../js/calc/methods.js';

const B = { totalStockholdersEquity: 100, totalDebt: 0, cashAndCashEquivalents: 0, totalAssets: 200, totalCurrentLiabilities: 50 };
test('1. sin datos fiscales el impuesto supuesto no pasa por real', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 100 }, b: B, c: {} });
  assert.equal(y.taxRate, null); assert.equal(y.taxAssumed, true);
  const r = deriveYear({ year: '2025', i: { ebit: 100, incomeTaxExpense: 25, incomeBeforeTax: 100 }, b: B, c: {} });
  assert.equal(r.taxRate, 0.25); assert.equal(r.taxAssumed, false);
});
test('2. sin caja no hay deuda neta ni capital invertido', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 10 }, b: { totalDebt: 100, totalStockholdersEquity: 100 }, c: {} });
  assert.equal(y.netDebt, null); assert.equal(y.roic, null);
});
test('5. una media de 5 años exige 5 datos', () => {
  assert.equal(lastAvg([0.1, 0.2], 5), null); assert.equal(lastAvg([1, 2, 3, 4, 5], 5), 3);
});
test('4. Piotroski con pruebas sin dato no es un 9/9', () => {
  const a = { netIncome: 1, ocf: 2, roa: 0.1, assets: 10, longTermDebt: 1, currentRatio: 2, shares: 1, revenue: 5 };
  const b = { netIncome: 1, ocf: 1, roa: 0.05, assets: 10, longTermDebt: 2, currentRatio: 1, shares: 1, revenue: 4 };
  assert.equal(piotroski(a, b), null); // faltan márgenes brutos
  const rg = piotroskiRange(a, b); assert.equal(rg.known, 8); assert.equal(rg.max, rg.min + 1);
});
test('8. errores con HTTP 200 se reconocen', async () => {
  // http.js depende del navegador (config): entorno mínimo para importarlo en Node
  globalThis.location ??= { pathname: '/investment-intelligence-pro/', origin: 'https://x' };
  const mem = {}; globalThis.localStorage ??= { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  globalThis.window ??= globalThis;
  const { classify } = await import('../js/providers/http.js');
  assert.ok(classify('fmp', 200, { error: 'Invalid symbol' }));
  assert.equal(classify('fmp', 200, [{ symbol: 'AAPL' }]), null);
});
const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { ok: true, data: v }]));
test('3. historial de dividendos no descargado = desconocido, no 0', () => {
  const p = { ...fx.profile }; delete p.lastDividend;
  const m = buildModel({ ...raw, profile: { ok: true, data: p }, dividends: { ok: false, error: new Error('red') } });
  assert.equal(m.dpsTTM, null);
  const m2 = buildModel({ ...raw, profile: { ok: true, data: p }, dividends: { ok: true, data: [] } });
  assert.equal(m2.dpsTTM, 0);
});
test('3b. un objeto de error en dividendos no rompe el modelo', () => {
  assert.doesNotThrow(() => buildModel({ ...raw, dividends: { ok: true, data: { error: 'x' } } }));
});
test('6. moneda de las cuentas sin indicar: se marca', () => {
  const inc = fx.income.map((r) => { const o = { ...r }; delete o.reportedCurrency; return o; });
  assert.equal(buildModel({ ...raw, income: { ok: true, data: inc } }).repCurAssumed, true);
  assert.equal(buildModel(raw).repCurAssumed, false);
});
// Greenblatt con caja desconocida y universo de 1
function gbS({ cash }) {
  const last = { ebit: 35, currentAssets: 100, currentLiabilities: 50, ppe: 20, cash, shortTermDebt: 0 };
  return { m: { symbol: 'G', price: 10, ev: 200, X: (v) => v, T: last, last, years: [last], market: { rf10: 0.04 }, profile: { sector: 'Technology' } } };
}
test('9. Greenblatt: caja desconocida = sin dato; universo de 1 no da «entra»', () => {
  const [a] = rankMethod('greenblatt', [{ sym: 'G', S: gbS({ cash: undefined }) }]);
  assert.notEqual(a.res.verdict, 'entra');
  const [b] = rankMethod('greenblatt', [{ sym: 'G', S: gbS({ cash: 10 }) }]);
  assert.notEqual(b.res.verdict, 'entra'); // universo de 1
  assert.ok(b.res.checks.some((c) => c.t === 'Universo suficiente' && c.ok === false));
});
test('11. Buffett: casilla del foso para el usuario', () => {
  assert.equal(METHODS.buffett.manual[0].key, 'foso');
});
