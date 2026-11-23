// 16.ª revisión (auditoría final de Gemini): conclusiones que se sacaban sin datos y veredictos sin confirmación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveYear, maxDrawdown, piotroski } from '../js/calc/finance.js';
import { ratioAvg, ev } from '../js/calc/valuation.js';
import { RATIOS } from '../js/calc/ratios.js';
import { dividendModel } from '../js/calc/intrinsic.js';
import { decide } from '../js/calc/decision.js';
import { buildReport } from '../js/calc/report.js';
import { rankMethod } from '../js/calc/methods.js';

const mem = {}; globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
const R = (id) => RATIOS.find((r) => r.id === id);

test('FINANCE-16-02: con pérdidas antes de impuestos no hay tipo impositivo', () => {
  const y = deriveYear({ year: '2025', i: { ebit: 100, incomeBeforeTax: -50, incomeTaxExpense: -10, netIncome: -40 }, b: { totalStockholdersEquity: 100, totalDebt: 50, cashAndCashEquivalents: 10 }, c: {} });
  assert.equal(y.taxRate, null);
});
test('FINANCE-16-01: sin precios válidos no hay caída máxima (no 0 %)', () => {
  assert.equal(maxDrawdown(Array(201).fill(null)), null);
  assert.ok(maxDrawdown([100, 50, 80]) < -0.49);
});
test('PIOTROSKI-16-01: ROA y rotación con activos de inicio de año', () => {
  // Activos de cierre iguales, pero de inicio distintos: el ROA del último año mejora solo con el denominador correcto
  const a = { netIncome: 10, ocf: 15, assets: 200, longTermDebt: 10, currentRatio: 2, shares: 100, grossMargin: 0.5, revenue: 100 };
  const b = { netIncome: 10, ocf: 12, assets: 100, longTermDebt: 10, currentRatio: 1, shares: 100, grossMargin: 0.4, revenue: 90 };
  const c = { assets: 200 };
  // ROA a = 10/100 = 10 % > ROA b = 10/200 = 5 % (con activos de cierre sería 5 % < 10 %)
  assert.ok(piotroski(a, b, c) >= 7);
});
test('VALUATION-16-01: la media de 5 años exige 5 datos', () => {
  assert.equal(ratioAvg([{ pe: 20 }], 'pe', 5), null);
  assert.equal(ratioAvg([1, 2, 3, 4, 5].map((v) => ({ pe: v * 10 })), 'pe', 5), 30);
  assert.equal(ev(100, null), null);
});
test('RATIOS-16-01: inventario desconocido no infla la prueba ácida', () => {
  const m = { T: { currentAssets: 100, currentLiabilities: 50 }, last: {}, rTTM: {}, years: [] };
  assert.equal(R('qr').cur(m), null);
});
test('DIV-16-01: dividendo desconocido no es «No reparte»', () => {
  assert.match(R('dy').interp(null, null, { dpsTTM: null }), /Sin dato/);
  assert.match(R('dy').interp(null, null, { dpsTTM: 0 }), /No reparte/);
});
test('DIV-16-02 / DDM-16-03: paga dividendo sin historial ≠ «no paga»; crecimiento 2 % marcado', () => {
  const r = dividendModel({ dpsTTM: 0.5, dpsSeries: [], T: {} }, 0.08);
  assert.doesNotMatch(r.reason, /no paga/);
  const r2 = dividendModel({ dpsTTM: 0.5, dpsSeries: [{ year: '2024', dps: 0.5 }], T: { dividendsPaid: 50, netIncome: 100 } }, 0.08);
  assert.equal(r2.growthAssumed, true);
});
test('DECISION-16-01: el potencial avisa si no incluye el dividendo', () => {
  const m = { price: 100, tradeCur: 'USD', profile: { sector: 'Technology' }, scores: {}, growth: {}, T: {}, last: {}, dpsTTM: null };
  const D = decide(m, { cats: [] }, { composite: { value: 150, low: 120, high: 180, mos: 1 / 3, contrasted: true }, reliability: { level: 'media', reasons: [] } }, []);
  assert.equal(D.potential.dyUnknown, true);
});
test('REPORT-16-01/02: sin datos no se afirma crecimiento orgánico ni se puntúa el largo plazo con 50', () => {
  const years = [1, 2, 3, 4].map((i) => ({ year: String(2020 + i), revenue: 100 * i }));
  const m = { years, T: {}, last: years[3], growth: {}, profile: {}, price: 10, tradeCur: 'USD', scores: {}, market: {}, ratiosHist: [], kmHist: [], X: (v) => v, rTTM: {}, stats: {}, dpsTTM: null, ttmIsReal: false, periodLabel: 'ejercicio 2024' };
  const sc = { total: 60, coverage: 0.9, cats: [{ key: 'calidad', label: 'Calidad', score: 80 }] };
  const rep = buildReport(m, sc, { composite: {}, reliability: {}, mult: [] }, [], { verdict: 'x', quality: { score: 80 } });
  const txt = JSON.stringify(rep);
  assert.doesNotMatch(txt, /mayoritariamente orgánico/);
  assert.match(txt, /sin datos suficientes|Solo hay nota/);
});
test('Pantallas: deuda a corto, crecimiento, foso, alertas, insiders y comparador sin ceros inventados', () => {
  const f = (p) => readFileSync(new URL('../js/' + p, import.meta.url), 'utf8');
  assert.doesNotMatch(f('views/tabs/debt.js'), /\(std \|\| 0\) \+ \(ltd \|\| 0\)/);
  assert.match(f('views/tabs/growth.js'), /faltan datos \(adquisiciones, deuda o acciones\)/);
  assert.match(f('views/tabs/moat.js'), /n >= 4 \?/);
  assert.match(f('views/tabs/overview.js'), /hacen falta al menos dos ejercicios/);
  assert.match(f('views/tabs/analysts.js'), /sin importe en alguna/);
  assert.match(f('views/compare.js'), /PER 12 meses/);
  assert.match(f('calc/alerts.js'), /v\.length >= 3/);
});

// Empresa con todo cumplido salvo lo que se pruebe
function bS() {
  const years = [0, 1, 2, 3, 4].map((i) => ({ year: String(2021 + i), revenue: 100 + 10 * i, netIncome: 20 + i, eps: 2 + i * 0.1, rc: 0.2, grossMargin: 0.5, operatingMargin: 0.3, fcf: 20, fcfConversion: 1, netDebtToEbitda: 1, netDebt: 10, ebitdaNegWithDebt: false }));
  const last = years[4];
  return { m: { symbol: 'BUF', price: 100, years, last, T: last, X: (v) => v, growth: { eps5: 0.05, shares5: 0 }, profile: { sector: 'Consumer' }, market: {} }, val: { composite: { value: 150, mos: 1 / 3 }, reliability: { level: 'media' } } };
}
test('BUFFETT-16-01: sin confirmar el foso, o con un criterio sin dato, no hay «Entraría»', async () => {
  const { manualStore } = await import('../js/calc/methods.js');
  let [x] = rankMethod('buffett', [{ sym: 'BUF', S: bS() }]);
  assert.equal(x.res.verdict, 'vigilar'); assert.match(x.res.horizon, /foso/);
  manualStore.set('BUF', 'foso', true);
  [x] = rankMethod('buffett', [{ sym: 'BUF', S: bS() }]);
  assert.equal(x.res.verdict, 'entra');
  const S = bS(); S.m.last = { ...S.m.last, netDebtToEbitda: null, netDebt: null }; S.m.T = S.m.last; S.m.years[4] = S.m.last;
  [x] = rankMethod('buffett', [{ sym: 'BUF', S }]);
  assert.notEqual(x.res.verdict, 'entra');
});
