import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cagr, cagrN, yoy, ttm, lin, maxDrawdown, deriveYear, buildAnnual, median, splitAdjustRows, splitFactor } from '../js/calc/finance.js';
import { dcf, wacc, ddm, impliedByEV, marginOfSafety, sensitivity, suggestGrowth } from '../js/calc/valuation.js';
import { forward } from '../js/calc/simulate.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('CAGR', () => {
  close(cagr(100, 200, 5), 2 ** (1 / 5) - 1);
  assert.equal(cagr(-1, 100, 3), null);
  assert.equal(cagr(100, 0, 3), null);
  close(cagrN([100, 110, 121], 2), 0.1);
  assert.equal(cagrN([1, 2], 5), null);
});

test('variación interanual y TTM', () => {
  const y = yoy([100, 120, 90]);
  assert.equal(y[0], null); close(y[1], 0.2); close(y[2], -0.25);
  assert.equal(ttm([{ r: 1 }, { r: 2 }, { r: 3 }], 'r'), null);
  assert.equal(ttm([{ r: 1 }, { r: 2 }, { r: 3 }, { r: 4 }, { r: 5 }], 'r'), 14);
});

test('interpolación de puntuaciones', () => {
  assert.equal(lin(5, [[0, 0], [10, 100]]), 50);
  assert.equal(lin(-5, [[0, 0], [10, 100]]), 0);
  assert.equal(lin(50, [[0, 0], [10, 100]]), 100);
  assert.equal(lin(null, [[0, 0], [10, 100]]), null);
  assert.equal(lin(1, [[0, 100], [2, 0]]), 50);
});

test('máxima caída', () => { close(maxDrawdown([100, 120, 60, 130]), -0.5); });

test('mediana', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null); });

test('WACC por CAPM', () => {
  const w = wacc({ rf: 0.04, beta: 1.2, erp: 0.05, costDebtPre: 0.05, taxRate: 0.25, equityValue: 800, debtValue: 200 });
  close(w.ke, 0.1); close(w.kd, 0.0375); close(w.wacc, 0.8 * 0.1 + 0.2 * 0.0375);
});

test('DCF de 5 años coincide con el cálculo manual', () => {
  const r = dcf({ fcf0: 100, growth: 0.1, years: 5, terminalGrowth: 0.02, discount: 0.08, netDebt: 50, shares: 10 });
  let pv = 0, f = 100; for (let t = 1; t <= 5; t++) { f *= 1.1; pv += f / 1.08 ** t; }
  const tv = (f * 1.02) / 0.06, pvtv = tv / 1.08 ** 5;
  close(r.pvSum, pv); close(r.tv, tv); close(r.ev, pv + pvtv); close(r.perShare, (pv + pvtv - 50) / 10);
});

test('DCF de 10 años converge al crecimiento terminal', () => {
  const r = dcf({ fcf0: 100, growth: 0.12, years: 10, terminalGrowth: 0.02, discount: 0.09, netDebt: 0, shares: 1 });
  close(r.rows[4].g, 0.12); close(r.rows[9].g, 0.02); assert.ok(r.rows[7].g < 0.12 && r.rows[7].g > 0.02);
});

test('DCF rechaza WACC ≤ g terminal', () => { assert.ok(dcf({ fcf0: 1, growth: 0.05, discount: 0.02, terminalGrowth: 0.03, shares: 1 }).error); });

test('sensibilidad: más WACC => menos valor', () => {
  const g = sensitivity({ fcf0: 100, growth: 0.05, years: 5, netDebt: 0, shares: 1 }, [0.07, 0.09], [0.02]);
  assert.ok(g[0][0] > g[1][0]);
});

test('DDM de Gordon', () => { close(ddm({ dps: 2, growth: 0.03, ke: 0.08 }).value, 2.06 / 0.05); assert.ok(ddm({ dps: 2, growth: 0.09, ke: 0.08 }).error); });

test('múltiplos EV y margen de seguridad', () => {
  close(impliedByEV(100, 10, 200, 8), 100); close(marginOfSafety(100, 80), 0.2); assert.equal(impliedByEV(-1, 10, 0, 1), null);
});

test('crecimiento sugerido acotado y con origen', () => {
  const s = suggestGrowth({ fcfCagr5: 0.4, revCagr5: 0.3, analystRevGrowth: 0.25 });
  assert.equal(s.value, 0.25); assert.equal(s.parts.length, 3); // limitada por la previsión de analistas
  assert.equal(suggestGrowth({}).value, null);
});

test('derivados anuales', () => {
  const [y] = buildAnnual(
    [{ date: '2025-12-31', fiscalYear: '2025', revenue: 1000, grossProfit: 400, operatingIncome: 200, ebit: 200, ebitda: 250, netIncome: 150, incomeBeforeTax: 190, incomeTaxExpense: 40, interestExpense: 10, epsDiluted: 1.5, weightedAverageShsOutDil: 100 }],
    [{ date: '2025-12-31', fiscalYear: '2025', totalStockholdersEquity: 500, totalDebt: 300, cashAndShortTermInvestments: 100, totalAssets: 1200, totalCurrentAssets: 400, totalCurrentLiabilities: 200 }],
    [{ date: '2025-12-31', fiscalYear: '2025', operatingCashFlow: 220, capitalExpenditure: -60, freeCashFlow: 160 }],
  ).map((r) => deriveYear(r));
  close(y.grossMargin, 0.4); close(y.roe, 0.3); close(y.netDebt, 200); close(y.netDebtToEbitda, 0.8); close(y.interestCoverage, 20);
  close(y.roic, (200 * (1 - 40 / 190)) / 700); close(y.fcfConversion, 160 / 150); close(y.currentRatio, 2);
});

test('simulación prospectiva con DRIP supera a sin DRIP', () => {
  const a = forward({ price: 100, eps: 5, epsGrowth: 0.08, exitPE: 20, payout: 0.4, years: 10, drip: true });
  const b = forward({ price: 100, eps: 5, epsGrowth: 0.08, exitPE: 20, payout: 0.4, years: 10, drip: false });
  assert.ok(a.final > b.final); assert.ok(a.cagr > 0);
});

import { priceChanges, betaFrom, piotroski, altman, closeAt } from '../js/calc/finance.js';
test('cálculos propios: variaciones, beta, Piotroski y Altman', () => {
  const px = []; const d = new Date('2020-01-01');
  for (let i = 0; i < 1600; i++) { const t = new Date(d); t.setDate(d.getDate() + i); px.push({ date: t.toISOString().slice(0, 10), close: 100 * 1.0005 ** i }); }
  const ch = priceChanges(px);
  assert.ok(ch['1Y'] > 19 && ch['1Y'] < 21);
  assert.equal(closeAt(px, '2020-01-05').date, '2020-01-05');
  const idx = px.map((p, i) => ({ date: p.date, close: 100 * (1 + 0.05 * Math.sin(i / 20)) }));
  const st = idx.map((p) => ({ date: p.date, close: p.close ** 2 }));
  const b = betaFrom(st, idx); assert.ok(b > 1.5 && b < 2.5, String(b));
  const a = { netIncome: 10, ocf: 15, roa: 0.1, longTermDebt: 10, assets: 100, currentRatio: 1.5, shares: 100, grossMargin: 0.5, revenue: 80 };
  const p0 = { netIncome: 8, ocf: 9, roa: 0.08, longTermDebt: 20, assets: 100, currentRatio: 1.2, shares: 101, grossMargin: 0.45, revenue: 70 };
  const pp = { assets: 100 }; // ejercicio previo: activos de inicio de año de p0 (denominadores del artículo original)
  assert.equal(piotroski(a, p0, pp), 9);
  assert.equal(piotroski(a, p0), null); // sin el ejercicio previo, ROA y rotación de p0 quedan sin dato
  const z = altman({ assets: 100, currentAssets: 50, currentLiabilities: 30, retainedEarnings: 20, ebit: 15, liabilities: 50, revenue: 120 }, 200);
  assert.ok(Math.abs(z - (1.2 * 0.2 + 1.4 * 0.2 + 3.3 * 0.15 + 0.6 * 4 + 1.2)) < 1e-9);
});

import { adjustSplits } from '../js/calc/finance.js';
test('ajuste por split 10×1', () => {
  const Y = [{ year: '2023', shares: 2.5e9, eps: 12, netIncome: 30e9 }, { year: '2024', shares: 24.8e9, eps: 1.3, netIncome: 32e9 }];
  const s = adjustSplits(Y);
  assert.equal(s.length, 1); assert.equal(s[0].factor, 10);
  assert.equal(Y[0].shares, 25e9); assert.ok(Math.abs(Y[0].eps - 1.2) < 1e-9);
  const Z = [{ year: '2023', shares: 100, eps: 1, netIncome: 100 }, { year: '2024', shares: 200, eps: 1, netIncome: 200 }]; // fusión que duplica beneficio: no es split
  assert.equal(adjustSplits(Z).length, 0);
});

test('estados ajustados a splits: acciones y BPA comparables, importes intactos', () => {
  const adj = [{ year: '2024', factor: 10 }, { year: '2021', factor: 4 }];
  assert.equal(splitFactor(adj, 2020), 40); assert.equal(splitFactor(adj, 2022), 10); assert.equal(splitFactor(adj, 2024), 1);
  const rows = splitAdjustRows([{ fiscalYear: '2020', weightedAverageShsOut: 600, eps: 4, revenue: 100 }, { fiscalYear: '2025', weightedAverageShsOut: 24000, eps: 3, revenue: 900 }], adj);
  assert.equal(rows[0].weightedAverageShsOut, 24000); assert.equal(rows[0].eps, 0.1); assert.equal(rows[0].revenue, 100);
  assert.equal(rows[1].eps, 3);
});

test('patrimonio negativo por recompras: ROIC y ROE no aplican, se usa ROCE', () => {
  const y = deriveYear({ year: '2025', i: { revenue: 26000, operatingIncome: 8500, incomeBeforeTax: 6832, incomeTaxExpense: 1428 }, b: { totalStockholdersEquity: -5578, totalDebt: 17000, cashAndCashEquivalents: 15467, totalAssets: 30000, totalCurrentLiabilities: 18000 }, c: {} });
  assert.equal(y.roic, null); assert.equal(y.roe, null); assert.ok(y.negCapital);
  assert.ok(Math.abs(y.rc - 8500 / 12000) < 1e-9);
  assert.equal(y.netIncome, 6832 - 1428);
});

test('crecimiento del DCF no extrapola rebotes (BKNG tras 2020)', () => {
  const s = suggestGrowth({ fcfCagr5: 0.45, revCagr5: 0.317, analystRevGrowth: 0.10, rev1: 0.134, rev10: 0.113 });
  assert.equal(s.value, 0.134); assert.equal(s.capped, 0.134);
});
