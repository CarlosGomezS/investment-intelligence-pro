// 11.ª revisión: método «cocodrilo paciente» y pendientes de decisión, valoración e informe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite } from '../js/calc/intrinsic.js';
import { decide } from '../js/calc/decision.js';
import { rankMethod } from '../js/calc/methods.js';

// Empresa sintética con n ejercicios: crecimiento estable, alta rentabilidad, recompras y precios de 1 año
function mk(n, { lastRevDrop = 0, priceDrop = 0, pe = 20 } = {}) {
  const years = [];
  for (let i = 0; i < n; i++) {
    const rev = 100 * 1.08 ** i * (i === n - 1 ? 1 + lastRevDrop : 1);
    years.push({ year: String(2016 + i), revenue: rev, netIncome: rev * 0.2, eps: rev * 0.2 / 10, fcf: rev * 0.2, rc: 0.25, grossMargin: 0.5, operatingMargin: 0.3, dividendsPaid: rev * 0.05, buybacks: rev * 0.1, shares: 10 });
  }
  const prices = []; for (let i = 0; i < 252; i++) prices.push({ date: `d${i}`, close: 100 * (i === 251 ? 1 - priceDrop : 1) });
  const price = prices[251].close;
  const ratiosHist = years.slice(-5).map(() => ({ priceToEarningsRatio: 25 }));
  const kmHist = years.slice(-5).map(() => ({ freeCashFlowYield: 0.04 }));
  const last = years[n - 1];
  return { m: { symbol: 'TST', price, tradeCur: 'USD', profile: { sector: 'Technology', companyName: 'Test' }, years, last, T: { fcf: last.fcf, netIncome: last.netIncome }, prices, ratiosHist, kmHist, pe, marketCap: price * 10, X: (v) => v, growth: { rev5: n >= 6 ? 0.08 : null, eps5: n >= 6 ? 0.08 : null, shares5: n >= 6 ? 0 : null, rev1: 0.08, rev3: 0.08 }, scores: {} }, val: { composite: { value: 150, mos: 0.3 }, reliability: { level: 'media' } } };
}

test('cocodrilo: con 5 ejercicios exactos mide a 4 años en vez de suspender', () => {
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S: mk(5) }]);
  const c = x.res.checks.find((k) => k.t === 'Negocio previsible');
  assert.equal(c.ok, true); assert.match(c.v, /4a: solo hay 5 ejercicios/);
});

test('cocodrilo: caída fuerte con ventas hundidas no entra ni suma bono de pánico', () => {
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S: mk(8, { lastRevDrop: -0.2, priceDrop: 0.4, pe: 12 }) }]);
  const tmp = x.res.checks.find((k) => k.t === 'Indicios de problema temporal');
  assert.equal(tmp.ok, false);
  assert.notEqual(x.res.verdict, 'entra');
  assert.ok(x.res.manualKeys.includes('temporal'));
});

test('cocodrilo: sin caída no se pregunta si el problema es temporal', () => {
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S: mk(8) }]);
  assert.deepEqual(x.res.manualKeys, ['entiendo']);
});

test('cocodrilo: un PER histórico de 100× no hace «razonable» un PER de 75×', () => {
  const S = mk(8, { pe: 75 }); S.m.ratiosHist = S.m.ratiosHist.map(() => ({ priceToEarningsRatio: 100 }));
  const [x] = rankMethod('cocodrilo', [{ sym: 'TST', S }]);
  assert.equal(x.res.checks.find((k) => k.t === 'Precio razonable').ok, false);
});

test('valor central: cuatro múltiplos propios no anulan al DCF', () => {
  const c = composite({ price: 100 }, { perShare: 200 }, ['PER medio 5 años', 'PER medio 10 años', 'EV/EBITDA medio 5 años', 'EV/FCF medio 5 años'].map((method) => ({ method, value: 100 })), null);
  // familias: DCF 200 (doble) y múltiplos propios 100 → mediana de [200, 200, 100] = 200
  assert.equal(c.value, 200);
});

const base = (o = {}) => ({ price: 100, tradeCur: 'USD', profile: { companyName: 'X', sector: 'Technology' }, scores: {}, growth: {}, T: {}, last: {}, ...o });
const scG = { cats: ['calidad', 'rentabilidad', 'moat', 'caja'].map((key) => ({ key, score: 85 })) };
test('decisión: sin precio no hay «Barata»', () => {
  const D = decide(base({ price: null }), scG, { composite: { value: 120, mos: null }, reliability: { level: 'alta', reasons: [] } }, []);
  assert.notEqual(D.valuation.label, 'Barata');
});
test('decisión: financieras nunca salen como candidatas con riesgo bajo', () => {
  const D = decide(base({ profile: { companyName: 'B', sector: 'Financial Services', industry: 'Banks' } }), scG, { composite: { value: 200, mos: 0.5, contrasted: true }, reliability: { level: 'alta', reasons: [] } }, []);
  assert.notEqual(D.risk.label, 'Bajo'); assert.match(D.verdict, /no sabe medir/);
});
test('decisión: capital valorado en 0 se descarta aunque el negocio sea bueno', () => {
  const D = decide(base(), scG, { composite: { value: 0, mos: -1, contrasted: true }, reliability: { level: 'media', reasons: [] } }, []);
  assert.match(D.verdict, /deuda supera/);
});
