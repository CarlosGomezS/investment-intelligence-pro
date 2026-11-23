// Pruebas de la sexta revisión externa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjustSplits } from '../js/calc/finance.js';
import { buildModel } from '../js/calc/model.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = () => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(fx))).map(([k, v]) => [k, { ok: true, data: v }]));
const one = (r, k) => (Array.isArray(r[k].data) ? r[k].data[0] : r[k].data);

test('doble clase: acciones de una sola clase no parten la capitalización por la mitad', () => {
  const r = raw(); const p = one(r, 'profile'); const q = one(r, 'quote');
  const base = buildModel(raw());
  p.sharesOutstanding = base.shares / 2; delete q.sharesOutstanding; // el perfil trae solo una clase
  const m = buildModel(r);
  assert.ok(Math.abs(m.marketCap / base.marketCap - 1) < 0.05); assert.ok(m.sharesNote);
});

test('SEC pura: el split de 2024 reexpresado aparece entre 2021 y 2022 y se detecta', () => {
  const ys = [{ year: '2021', date: '2021-09-25', shares: 100, netIncome: 50, src: 'sec' }, { year: '2022', date: '2022-09-24', shares: 1000, netIncome: 55, src: 'sec' }];
  const f = adjustSplits(ys, [{ date: '2024-06-10', numerator: 10, denominator: 1 }]);
  assert.equal(f.length, 1); assert.equal(f[0].factor, 10);
});

test('dividendo suspendido: el último dividendo del perfil no se usa si hay historial', () => {
  const r = raw(); one(r, 'profile').lastDividend = 1.2;
  r.dividends.data = [{ date: '2020-03-01', dividend: 0.3, adjDividend: 0.3 }];
  assert.equal(buildModel(r).dpsTTM, 0);
});

test('balance del último año sin llegar: se usa el anterior, no deuda 0', () => {
  const r = raw(); r.balance.data = r.balance.data.map((b) => ({ ...b, date: '2025-09-27', fiscalYear: '2025' })); // solo hay balance del año anterior
  const m = buildModel(r);
  assert.ok(m.balanceFrom); assert.ok(Number.isFinite(m.last.netDebt));
});
