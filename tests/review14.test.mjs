// 14.ª revisión: rutas que seguían convirtiendo datos desconocidos en válidos, enlaces, Lynch, Greenblatt y simulador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveYear } from '../js/calc/finance.js';
import { wacc } from '../js/calc/valuation.js';
import { rankMethod } from '../js/calc/methods.js';
import { safeUrl } from '../js/ui/dom.js';
import { buildModel } from '../js/calc/model.js';

test('1. capital invertido desconocido no produce ROIC ni RC (no se cuela el ROCE)', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 100 }, b: { totalStockholdersEquity: 100, totalDebt: 0, totalAssets: 200, totalCurrentLiabilities: 50 }, c: {} });
  assert.equal(y.roic, null); assert.equal(y.rc, null);
});
test('1b. con capital invertido conocido y negativo sí se usa el ROCE', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 100 }, b: { totalStockholdersEquity: -300, totalDebt: 100, cashAndCashEquivalents: 0, totalAssets: 200, totalCurrentLiabilities: 50 }, c: {} });
  assert.ok(Math.abs(y.rc - 100 / 150) < 1e-9);
});
test('2. WACC marca el impuesto supuesto', () => {
  assert.equal(wacc({ rf: 0.04, beta: 1, erp: 0.05, costDebtPre: 0.08, taxRate: null, equityValue: 100, debtValue: 100 }).taxAssumed, true);
  assert.equal(wacc({ rf: 0.04, beta: 1, erp: 0.05, costDebtPre: 0.08, taxRate: 0.25, equityValue: 100, debtValue: 100 }).taxAssumed, false);
});
test('13. deuda total con un solo componente queda desconocida', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 100 }, b: { shortTermDebt: 100, totalStockholdersEquity: 100, cashAndCashEquivalents: 20 }, c: {} });
  assert.equal(y.debt, null); assert.equal(y.netDebt, null);
});
test('3-4. Alpha Vantage y la tabla de balances no restan caja desconocida', () => {
  const av = readFileSync(new URL('../js/providers/alphavantage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(av, /csti \?\? cash \?\? 0/);
  const st = readFileSync(new URL('../js/views/tabs/statements.js', import.meta.url), 'utf8');
  assert.doesNotMatch(st, /cashAndCashEquivalents \?\? 0/);
});
test('7. enlaces externos: solo http(s)', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,x'), '');
  assert.equal(safeUrl('/relativa'), '');
  assert.equal(safeUrl('https://www.sec.gov/x'), 'https://www.sec.gov/x');
});
test('11. Lynch: dividendo desconocido no da PEGY ni «entra»', () => {
  const m = { symbol: 'L', price: 100, pe: 10, T: { eps: 10 }, last: {}, years: [], X: (v) => v, growth: { eps5: 0.1 }, dpsTTM: null, rTTM: {}, profile: { sector: 'Technology' }, market: {} };
  const [x] = rankMethod('lynch', [{ sym: 'L', S: { m } }]);
  assert.notEqual(x.res.verdict, 'entra');
  assert.match(x.res.checks.find((c) => c.t === 'PEGY ≤ 1').v, /sin dato de dividendo/);
});
test('12. Greenblatt: con una empresa la nota no es 100', () => {
  const last = { ebit: 35, currentAssets: 100, currentLiabilities: 50, ppe: 20, cash: 10, shortTermDebt: 0 };
  const S = { m: { symbol: 'G', price: 10, ev: 200, X: (v) => v, T: last, last, years: [last], market: { rf10: 0.04 }, profile: { sector: 'Technology' } } };
  const [x] = rankMethod('greenblatt', [{ sym: 'G', S }]);
  assert.ok(x.res.score <= 50);
});
test('5. moneda de las cuentas desconocida fuera de EE. UU.: no se cruza precio con cuentas', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
  const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { ok: true, data: v }]));
  const inc = fx.income.map((r) => { const o = { ...r }; delete o.reportedCurrency; return o; });
  const m = buildModel({ ...raw, income: { ok: true, data: inc }, profile: { ok: true, data: { ...fx.profile, country: 'DE', currency: 'EUR' } }, quote: { ok: true, data: { ...(fx.quote || {}), currency: 'EUR' } } });
  assert.equal(m.fx, null);
  const us = buildModel({ ...raw, income: { ok: true, data: inc }, profile: { ok: true, data: { ...fx.profile, country: 'US' } } });
  assert.equal(us.fx, 1);
});
test('9-10. publicación: sin Worker no se publican claves y la prueba en vivo bloquea', () => {
  const y = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(y, /fmpKey: process\.env\.FMP_KEY/);
  assert.doesNotMatch(y, /continue-on-error: true/);
  assert.match(y, /Sin Worker de Cloudflare no se publica/);
});
