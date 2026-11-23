// Pruebas de la quinta revisión externa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustSplits, splitAdjustRowsByDate, buildAnnual } from '../js/calc/finance.js';
import { toStatements } from '../js/providers/xbrl.js';
import { scenarios, dcf } from '../js/calc/valuation.js';
import { historical } from '../js/calc/simulate.js';

test('SEC reexpresada a medias + FMP: salto de 10 (solo el split más reciente)', () => {
  const ys = [{ year: '2021', date: '2021-01-31', shares: 2480, eps: 1.7, netIncome: 4300, src: 'sec' }, { year: '2022', date: '2022-01-30', shares: 25000, eps: 0.39, netIncome: 9700, src: 'base' }];
  const f = adjustSplits(ys, [{ date: '2021-07-20', numerator: 4, denominator: 1 }, { date: '2024-06-10', numerator: 10, denominator: 1 }]);
  assert.equal(f[0].factor, 10);
});

test('dilución real no se borra por un split futuro (misma fuente)', () => {
  const ys = [{ year: '2018', date: '2018-12-31', shares: 100, netIncome: 10 }, { year: '2019', date: '2019-12-31', shares: 200, netIncome: 10 }];
  assert.equal(adjustSplits(ys, [{ date: '2024-06-01', numerator: 2, denominator: 1 }]).length, 0);
});

test('trimestres ya ajustados con algo de dilución no se ajustan dos veces', () => {
  const rows = [{ date: '2024-09-30', weightedAverageShsOut: 950, eps: 1 }, { date: '2025-03-31', weightedAverageShsOut: 1000, eps: 1 }];
  const out = splitAdjustRowsByDate(rows, [{ date: '2024-06-10', numerator: 2, denominator: 1 }]);
  assert.equal(out[0].weightedAverageShsOut, 950);
});

test('balance alineado por fecha aunque la etiqueta del año difiera', () => {
  const y = buildAnnual([{ fiscalYear: '2025', date: '2025-01-31', revenue: 1 }], [{ fiscalYear: '2024', date: '2025-01-31', totalAssets: 5 }], []);
  assert.equal(y.length, 1); assert.equal(y[0].b.totalAssets, 5);
});

test('BPA de Finnhub en minúsculas no se descarta', () => {
  const F = (concept, val, unit, start) => ({ concept: 'us-gaap:' + concept, start, end: '2025-12-31', val, unit, filed: '2026-02-01' });
  const st = toStatements([F('Revenues', 1000, 'USD', '2025-01-01'), F('NetIncomeLoss', 100, 'USD', '2025-01-01'), F('Assets', 5000, 'USD'), F('EarningsPerShareDiluted', 2.5, 'usd/share', '2025-01-01')], 'X');
  assert.equal(st.income[0].epsDiluted, 2.5);
});

test('escenario pesimista acotado y DCF con descuento positivo', () => {
  const s = scenarios({ growth: -0.7, discount: 0.09, terminalGrowth: 0.025 });
  assert.ok(s[0].growth >= -0.95);
  assert.ok(dcf({ fcf0: 10, growth: 0.05, discount: -0.01, terminalGrowth: -0.02, netDebt: 0, shares: 1 }).error);
});

test('simulador: todas las columnas desde la misma fecha', () => {
  const mk = (from, n) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(from) + i * 864e5 * 7).toISOString().slice(0, 10), close: 100 + i }));
  const A = mk('2021-01-01', 260), R = mk('2006-01-01', 1040), I = mk('2006-01-01', 1040);
  const h = historical(A, R, I, 20);
  const d = (x, y) => Math.abs(Date.parse(x) - Date.parse(y)) / 864e5;
  // la serie corta (5 años con dividendos) no recorta las otras a 5 años: se descarta y se avisa
  assert.equal(h.drip, null); assert.ok(h.dropped.includes('con dividendos'));
  assert.ok(d(h.index.from, h.noDrip.from) <= 7); assert.ok(h.noDrip.years > 15);
  const h5 = historical(A, R, I, 5); assert.ok(d(h5.drip.from, h5.noDrip.from) <= 7); // a 5 años las tres coinciden
});

test('dos cierres de enero con la misma etiqueta no se pisan', () => {
  const y = buildAnnual([{ fiscalYear: '2024', date: '2024-01-31', revenue: 1 }, { fiscalYear: '2024', date: '2025-01-31', revenue: 2 }], [], []);
  assert.equal(y.length, 2); assert.equal(y[1].i.revenue, 2);
});
