import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliability, coverageTier } from '../js/calc/reliability.js';

const base = (o = {}) => ({ profile: { sector: 'Technology' }, years: Array.from({ length: 8 }, (_, i) => ({ revenue: 1 + i })), market: {}, repCur: 'USD', ...o });
const val = (c = {}) => ({ composite: { value: 100, low: 90, high: 110, n: 4, ...c }, defaults: { growth: { origin: 'supuesto · mediana' } }, dcf: { tvShare: 0.6 } });

test('fiabilidad alta con datos completos', () => { assert.equal(reliability(base(), val(), { coverage: 0.95 }).level, 'alta'); });
test('sin tipo de cambio o sin valor: no valorable', () => {
  assert.equal(reliability(base({ fxMissing: true }), val(), { coverage: 0.95 }).level, 'no valorable');
  assert.equal(reliability(base(), val({ value: null }), { coverage: 0.95 }).level, 'no valorable');
});
test('banco con pocos años y métodos dispares: baja', () => {
  const r = reliability(base({ profile: { sector: 'Financial Services' }, years: [{ revenue: 1 }, { revenue: 2 }] }), val({ low: 50, high: 200 }), { coverage: 0.6 });
  assert.ok(['baja', 'muy baja'].includes(r.level)); assert.ok(r.reasons.length >= 3);
});
test('niveles de cobertura', () => {
  assert.equal(coverageTier(0.95).label, 'evaluación completa'); assert.equal(coverageTier(0.5).label, 'fiabilidad limitada'); assert.equal(coverageTier(0.3).ok, false);
});

test('método a 0 frente a otro positivo resta; supuestos editados no restan', () => {
  const r = reliability(base(), val({ low: 0, high: 200 }), { coverage: 0.95 });
  assert.ok(r.reasons.some((x) => /valor 0/.test(x)));
  const eur = base({ repCur: 'EUR' });
  const v = val(); v.defaults.rf = { value: 0.045 }; v.inputs = { rf: 0.028 }; // el usuario puso el bono alemán
  assert.ok(!reliability(eur, v, { coverage: 0.95 }).reasons.some((x) => /bono de EE/.test(x)));
});
