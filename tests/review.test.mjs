// Pruebas de la tercera revisión externa: cada una reproduce el fallo señalado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveYear, adjustSplits } from '../js/calc/finance.js';
import { buildModel } from '../js/calc/model.js';
import { composite, dcfDefaults, runDcf, multiples, dividendModel } from '../js/calc/intrinsic.js';
import { scenarios, wacc, dcf } from '../js/calc/valuation.js';
import { evaluateRatios } from '../js/calc/ratios.js';
import { detectAlerts } from '../js/calc/alerts.js';
import { score } from '../js/calc/scoring.js';
import { alligator } from '../js/calc/alligator.js';
import { METHODS } from '../js/calc/methods.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = () => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(fx))).map(([k, v]) => [k, { ok: true, data: v }]));

test('denominadores negativos no invierten el signo', () => {
  const y = deriveYear({ year: '2025', i: { revenue: 100, operatingIncome: -30, netIncome: -100, ebitda: -2000 }, b: { totalDebt: 12000, cashAndCashEquivalents: 2000, totalAssets: 100, totalCurrentLiabilities: 150 }, c: { operatingCashFlow: -150, capitalExpenditure: -10 } });
  assert.equal(y.netDebtToEbitda, null); assert.ok(y.ebitdaNegWithDebt);
  assert.equal(y.incomeQuality, null); assert.equal(y.fcfConversion, null); assert.equal(y.capexToOcf, null); assert.equal(y.roce, null);
});

test('una ampliación de capital no se toma por split', () => {
  const ys = [{ year: '2023', date: '2023-12-31', shares: 100, eps: 1, netIncome: 100 }, { year: '2024', date: '2024-12-31', shares: 200, eps: 0.5, netIncome: 100, issuance: 5000, equity: 8000 }];
  assert.equal(adjustSplits(JSON.parse(JSON.stringify(ys)), []).length, 0); // el proveedor dice: sin splits
  assert.equal(adjustSplits(JSON.parse(JSON.stringify(ys)), null).length, 0); // sin lista: emisión relevante
  assert.equal(adjustSplits(JSON.parse(JSON.stringify(ys)), [{ date: '2024-06-10', numerator: 2, denominator: 1 }]).length, 1); // split real
});

test('sin tipo de cambio no se valora con fx = 1', () => {
  const r = raw(); r.income.data = r.income.data.map((x) => ({ ...x, reportedCurrency: 'TWD' }));
  const m = buildModel(r, null);
  assert.ok(m.fxMissing); assert.equal(m.X(100), null); assert.equal(m.ev, m.ev); // no lanza
  const d = dcfDefaults(m); assert.equal(d.fcfBase.value, null);
  const res = runDcf(m, { fcf0: d.fcfBase.value, growth: 0.05, years: 10, terminalGrowth: 0.025, wacc: 0.09, netDebt: m.netDebt, shares: m.shares });
  assert.ok(res.error);
  evaluateRatios(m); detectAlerts(m); score(m, { alerts: [], mos: null, prices: [] });
});

test('el valor central exige dos métodos distintos y cuenta 0 si la deuda supera el valor', () => {
  const m = { price: 10 };
  assert.equal(composite(m, { perShare: 20 }, [], null).value, null);
  const c = composite(m, { perShare: -5 }, [{ method: 'PER medio 5 años', value: 12 }], null);
  assert.equal(c.n, 2); assert.equal(c.value, 4); assert.equal(c.low, 0); // 2 familias: (0×2 + 12) / 3 = 4, rango 0–12
});

test('escenarios con crecimiento negativo siguen ordenados', () => {
  const s = scenarios({ growth: -0.1, discount: 0.09, terminalGrowth: 0.025, fcf0: 100, shares: 10, netDebt: 0 });
  assert.ok(s[0].growth < s[1].growth && s[1].growth < s[2].growth);
});

test('WACC sin capitalización no queda en el coste de la deuda', () => {
  const w = wacc({ rf: 0.04, beta: 1, erp: 0.05, costDebtPre: 0.03, taxRate: 0.2, equityValue: null, debtValue: 1000 });
  assert.equal(w.wacc, 0.09);
  assert.ok(dcf({ fcf0: 10, growth: 0.05, discount: 0.09, shares: 1 }).error); // sin deuda neta no se supone 0
});

test('cocodrilo a la baja: sin entrada técnica', () => {
  const bars = []; let p = 100; for (let i = 0; i < 120; i++) { p *= 0.996; bars.push({ date: String(i).padStart(4, '0'), high: p * 1.01, low: p * 0.99, close: p }); }
  const a = alligator(bars); assert.ok(a.state.includes('baja')); assert.equal(a.entry, null);
});

test('Lynch: un rebote del BPA no da PEGY de ganga y exige crecimiento positivo', () => {
  const S = (g, pe, dy) => ({ m: { price: pe, T: { eps: 1 }, last: {}, X: (v) => v, growth: { eps5: g }, rTTM: { dividendYieldTTM: dy }, profile: {}, years: [] }, val: {} });
  const a = METHODS.lynch.evaluate(S(0.9, 40, 0));
  assert.equal(a.verdict, 'vigilar'); // 40 / 30 = 1,33
  const b = METHODS.lynch.evaluate(S(-0.02, 3, 0.05));
  assert.equal(b.verdict, 'no');
});
