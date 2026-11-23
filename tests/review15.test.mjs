// 15.ª revisión (de arriba a abajo): partes que faltan no cuentan como cero; ruta, almacenamiento y cookie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toStatements } from '../js/providers/xbrl.js';

const F = (concept, val, unit = 'USD', start) => ({ concept: 'us-gaap:' + concept, start, end: '2025-12-31', val, unit, filed: '2026-02-01' });
const base = [F('Revenues', 100, 'USD', '2025-01-01'), F('Assets', 100)];

test('XBRL-15-01: solo deuda a corto conocida → deuda total sin dato', () => {
  const st = toStatements([...base, F('DebtCurrent', 30)], 'X');
  assert.equal(st.balance[0].totalDebt, null); assert.equal(st.balance[0].netDebt, null);
});
test('XBRL-15-01b: solo deuda a largo → se acepta y queda marcado', () => {
  const st = toStatements([...base, F('LongTermDebtNoncurrent', 80), F('CashAndCashEquivalentsAtCarryingValue', 10)], 'X');
  assert.equal(st.balance[0].totalDebt, 80); assert.equal(st.balance[0].debtShortTermAssumedZero, true);
});
test('XBRL-15-02: sin inversiones a corto no hay «caja + inversiones»; la deuda neta resta solo la caja', () => {
  const st = toStatements([...base, F('DebtCurrent', 10), F('LongTermDebtNoncurrent', 20), F('CashAndCashEquivalentsAtCarryingValue', 5)], 'X');
  assert.equal(st.balance[0].cashAndShortTermInvestments, null); assert.equal(st.balance[0].netDebt, 25);
});
test('XBRL-15-03: SG&A con una sola parte queda sin dato', () => {
  const st = toStatements([...base, F('SellingAndMarketingExpense', 10, 'USD', '2025-01-01')], 'X');
  assert.equal(st.income[0].sellingGeneralAndAdministrativeExpenses ?? null, null);
});
test('ROIC-15-01/02 y Finnhub: sin partes inventadas ni ROI como ROIC', () => {
  const r = readFileSync(new URL('../js/providers/roic.js', import.meta.url), 'utf8');
  assert.doesNotMatch(r, /\(std \|\| 0\) \+ \(ltd \|\| 0\)/); assert.doesNotMatch(r, /cash \+ \(sti \|\| 0\)/);
  const f = readFileSync(new URL('../js/providers/finnhub.js', import.meta.url), 'utf8');
  assert.match(f, /returnOnInvestedCapitalTTM: null/);
});
test('CFG: la cookie ya no guarda claves (viajaría a GitHub en cada visita)', () => {
  const c = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.match(c, /const slim = \{ theme: o\.theme \}/);
});
test('STORE-15-01: un archivo importado con secciones rotas no rompe la app', async () => {
  const mem = {}; globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  globalThis.window = globalThis; globalThis.CustomEvent ??= class { constructor(t) { this.type = t; } }; globalThis.dispatchEvent ??= () => true;
  const { store } = await import('../js/store.js');
  store.importAll('{"lists":null,"history":"x"}');
  assert.equal(store.inList('Favoritos', 'AAPL'), false);
  assert.throws(() => store.importAll('[1,2]'));
});
test('APP-15-01: la ruta decodifica con protección', () => {
  const a = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(a, /try \{ parts = path\.split/);
});
