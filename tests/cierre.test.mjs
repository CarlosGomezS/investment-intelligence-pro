// Revisión de cierre: bloqueantes CIERRE-01 (acciones ×100 en Londres) y CIERRE-02 (deuda neta congelada al completar).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/calc/model.js';
import { reconcileBalance } from '../js/providers/merge.js';

test('CIERRE-01: cotización en peniques y perfil en libras no multiplican las acciones por 100', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
  const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { ok: true, data: v }]));
  const sh = buildModel(raw).last.shares;
  const income = fx.income.map((r) => ({ ...r, reportedCurrency: 'GBP' }));
  const m = buildModel({ ...raw, income: { ok: true, data: income }, quote: { ok: true, data: { price: 420, currency: 'GBp' } }, profile: { ok: true, data: { ...fx.profile, country: 'GB', price: 4.2, currency: 'GBP', marketCap: 4.2 * sh, sharesOutstanding: undefined } } });
  assert.ok(Math.abs(m.shares / sh - 1) < 0.01, String(m.shares / sh));
});
test('CIERRE-02: al completar con otra fuente, deuda total y deuda neta propias se recalculan', () => {
  const row = { cashAndCashEquivalents: 1000, shortTermInvestments: null, cashAndShortTermInvestments: null, shortTermDebt: null, longTermDebt: 2000, totalDebt: 2000, debtShortTermAssumedZero: true, netDebt: 1000 };
  Object.assign(row, { shortTermInvestments: 3000, cashAndShortTermInvestments: 4000, shortTermDebt: 500 });
  reconcileBalance(row, ['shortTermInvestments', 'cashAndShortTermInvestments', 'shortTermDebt'], true);
  assert.equal(row.totalDebt, 2500); assert.equal(row.netDebt, -1500); assert.equal(row.debtShortTermAssumedZero, false);
});
test('CIERRE-02b: la deuda neta publicada por la fuente base (FMP) no se toca', () => {
  const row = { totalDebt: 100, netDebt: 60, cashAndCashEquivalents: 40 };
  reconcileBalance(row, ['shortTermInvestments'], false);
  assert.equal(row.netDebt, 60);
});

test('Datos reales (NVDA): en el cocodrilo la entrada nunca supera al valor intrínseco central', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
  const { rankMethod } = await import('../js/calc/methods.js');
  const years = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ year: String(2018 + i), revenue: 100 * 1.2 ** i, netIncome: 30 * 1.2 ** i, eps: 3 * 1.2 ** i, fcf: 30 * 1.2 ** i, rc: 0.4, grossMargin: 0.6, operatingMargin: 0.4, dividendsPaid: 2, buybacks: 20, shares: 10 }));
  const last = years[7];
  const m = { symbol: 'NV', price: 164, tradeCur: 'USD', profile: { sector: 'Technology' }, years, last, T: { fcf: last.fcf, netIncome: last.netIncome }, prices: [], ratiosHist: years.map(() => ({ priceToEarningsRatio: 40 })), kmHist: years.map(() => ({ freeCashFlowYield: 0.02 })), pe: 47, marketCap: 1640, X: (v) => v, growth: { rev5: 0.2, eps5: 0.2, shares5: 0, rev1: 0.2, rev3: 0.2 }, scores: {} };
  const [x] = rankMethod('cocodrilo', [{ sym: 'NV', S: { m, val: { composite: { value: 100, mos: -0.64 }, reliability: { level: 'media' } } } }]);
  assert.ok(x.res.entry <= 100 + 1e-9, String(x.res.entry));
  assert.match(x.res.entryNote, /valor intrínseco/);
});
