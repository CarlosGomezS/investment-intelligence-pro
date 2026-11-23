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
