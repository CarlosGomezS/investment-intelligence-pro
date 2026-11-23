// 12.ª revisión: valor central dentro de su rango, cocodrilo con 5 ejercicios y pérdidas, financieras sin precio de compra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite } from '../js/calc/intrinsic.js';
import { decide } from '../js/calc/decision.js';
import { rankMethod } from '../js/calc/methods.js';

test('valor central: siempre dentro de su rango y la otra familia cuenta', () => {
  const mult = (v) => ['PER medio 5 años', 'PER medio 10 años', 'EV/EBITDA medio 5 años', 'EV/FCF medio 5 años'].map((method) => ({ method, value: v }));
  const a = composite({ price: 100 }, { perShare: 200 }, mult(10), null), b = composite({ price: 100 }, { perShare: 200 }, mult(10000), null);
  assert.notEqual(a.value, b.value);
  for (const c of [a, b]) assert.ok(c.low <= c.value && c.value <= c.high);
  assert.equal(a.low, 10); assert.equal(a.high, 200); // la fiabilidad ve la discrepancia entre familias
  const d = composite({ price: 100 }, { perShare: 100 }, [{ method: 'PER medio 5 años', value: 80 }, { method: 'PER mediano de competidores', value: 120 }], { applicable: true, value: 90 });
  assert.ok(d.low <= d.value && d.value <= d.high);
});

function mk(n, { loss = false } = {}) {
  const years = [];
  for (let i = 0; i < n; i++) { const rev = 100 * 1.1 ** i; const ni = loss && i === n - 1 ? -5 : rev * 0.2; years.push({ year: String(2019 + i), revenue: rev, netIncome: ni, eps: ni / 10, fcf: rev * 0.2, rc: 0.25, grossMargin: 0.5, operatingMargin: 0.3, dividendsPaid: rev * 0.05, buybacks: rev * 0.1, shares: 10 * 0.99 ** i }); }
  const prices = Array.from({ length: 252 }, (_, i) => ({ date: `d${i}`, close: 100 }));
  const last = years[n - 1];
  return { m: { symbol: 'TST', price: 100, tradeCur: 'USD', profile: { sector: 'Technology' }, years, last, T: { fcf: last.fcf, netIncome: last.netIncome }, prices, ratiosHist: years.map(() => ({ priceToEarningsRatio: 25 })), kmHist: years.map(() => ({ freeCashFlowYield: 0.04 })), pe: 15, marketCap: 500, X: (v) => v, growth: { rev1: 0.1, rev3: 0.1 }, scores: {} }, val: { composite: { value: 150, mos: 0.3 }, reliability: { level: 'media' } } };
}

test('cocodrilo: con 5 ejercicios la directiva se mide a 4 años y la empresa puede entrar', () => {
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S: mk(5) }]);
  assert.equal(x.res.checks.find((k) => k.t === 'Directiva que cuida al accionista').ok, true);
  assert.equal(x.res.verdict, 'entra');
});

test('cocodrilo: pérdidas en el último ejercicio suspenden «negocio previsible» (no «sin dato»)', () => {
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S: mk(5, { loss: true }) }]);
  assert.equal(x.res.checks.find((k) => k.t === 'Negocio previsible').ok, false);
});

test('decisión: un banco no muestra «Barata», precio de compra ni potencial', () => {
  const m = { price: 50, tradeCur: 'EUR', profile: { sector: 'Financial Services', industry: 'Banks—Diversified' }, scores: {}, growth: {}, T: {}, last: {} };
  const D = decide(m, { cats: [] }, { composite: { value: 100, mos: 0.5, contrasted: true }, reliability: { level: 'media', reasons: [] } }, []);
  assert.equal(D.valuation.label, 'No aplicable al sector');
  assert.equal(D.valuation.maxBuy, null); assert.equal(D.potential, null);
});
