// Pruebas de la cuarta revisión externa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveYear, adjustSplits, splitAdjustRowsByDate } from '../js/calc/finance.js';
import { marginOfSafety } from '../js/calc/valuation.js';
import { toStatements } from '../js/providers/xbrl.js';

test('rc no sale positivo con capital empleado negativo', () => {
  const y = deriveYear({ year: '2025', i: { revenue: 100, operatingIncome: -50 }, b: { totalStockholdersEquity: -500, totalDebt: 100, cashAndCashEquivalents: 0, totalAssets: 100, totalCurrentLiabilities: 300 }, c: {} });
  assert.equal(y.rc, null);
});

test('años antiguos sin ajustar mezclados con años ajustados (split posterior): se ajustan', () => {
  // 2019-2020 de SEC sin ajustar; 2021-2025 de FMP ya ajustados al split 10:1 de 2024 (y 4:1 de 2021)
  const ys = [
    { year: '2019', date: '2019-01-27', shares: 610, eps: 6.6, netIncome: 4100 },
    { year: '2020', date: '2020-01-26', shares: 612, eps: 4.5, netIncome: 2800 },
    { year: '2021', date: '2021-01-31', shares: 24800, eps: 0.17, netIncome: 4300 },
    { year: '2022', date: '2022-01-30', shares: 25000, eps: 0.39, netIncome: 9700 },
  ];
  const sp = [{ date: '2021-07-20', numerator: 4, denominator: 1 }, { date: '2024-06-10', numerator: 10, denominator: 1 }];
  const f = adjustSplits(ys, sp);
  assert.equal(f.length, 1); assert.equal(f[0].factor, 40);
  assert.ok(Math.abs(ys[0].shares - 24400) < 1); assert.ok(Math.abs(ys[1].eps - 0.1125) < 1e-9);
});

test('valor 0 = margen de seguridad −100 %, no «sin dato»', () => {
  assert.equal(marginOfSafety(0, 50), -1);
  assert.equal(marginOfSafety(null, 50), null);
});

test('trimestres: solo se ajustan los que vienen sin ajustar', () => {
  const rows = [{ date: '2024-04-28', weightedAverageShsOut: 2500, eps: 6 }, { date: '2024-07-28', weightedAverageShsOut: 24500, eps: 0.67 }];
  const out = splitAdjustRowsByDate(rows, [{ date: '2024-06-10', numerator: 10, denominator: 1 }]);
  assert.equal(out[0].weightedAverageShsOut, 25000); assert.ok(Math.abs(out[0].eps - 0.6) < 1e-9);
  assert.equal(out[1].eps, 0.67);
});

test('XBRL: BPA solo en la moneda principal y deuda sin doble conteo', () => {
  const F = (concept, val, unit, start) => ({ concept: 'us-gaap:' + concept, start, end: '2025-12-31', val, unit, filed: '2026-02-01' });
  const st = toStatements([
    F('Revenues', 1000, 'TWD', '2025-01-01'), F('NetIncomeLoss', 100, 'TWD', '2025-01-01'), F('Assets', 5000, 'TWD'),
    F('EarningsPerShareDiluted', 4, 'TWD/shares', '2025-01-01'), F('EarningsPerShareDiluted', 130, 'USD/shares', '2025-01-01'),
    F('DebtCurrent', 50, 'TWD'), F('LongTermDebt', 300, 'TWD'),
  ], 'X');
  assert.equal(st.income[0].epsDiluted, 4);
  assert.equal(st.balance[0].totalDebt, 300); // 50 corriente + (300 − 50) largo
});
