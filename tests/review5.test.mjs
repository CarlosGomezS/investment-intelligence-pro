// Pruebas de la séptima revisión (regresiones de los parches anteriores).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/calc/model.js';
import { toStatements } from '../js/providers/xbrl.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = () => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(fx))).map(([k, v]) => [k, { ok: true, data: v }]));
const one = (r, k) => (Array.isArray(r[k].data) ? r[k].data[0] : r[k].data);

test('una caída del 30 % en el día no inventa acciones si el perfil no trae precio (Finnhub)', () => {
  const base = buildModel(raw());
  const r = raw(); const p = one(r, 'profile'), q = one(r, 'quote');
  p.sharesOutstanding = base.shares; p.marketCap = q.marketCap; delete p.price; delete q.sharesOutstanding; delete q.marketCap; // como Finnhub: la cotización no trae capitalización
  q.price = q.price * 0.7; // hoy cae un 30 %; la capitalización del perfil es de ayer
  const m = buildModel(r);
  assert.ok(Math.abs(m.shares / base.shares - 1) < 1e-9);
  assert.ok(Math.abs(m.marketCap / base.marketCap - 0.7) < 0.01); // la capitalización refleja la caída
});

test('splits: una lista vacía del proveedor protege de confundir dilución con split', () => {
  const r = raw(); r.splits = { ok: true, data: [] };
  const inc = r.income.data; inc[1].weightedAverageShsOutDil = inc[0].weightedAverageShsOutDil / 2; inc[1].weightedAverageShsOut = inc[0].weightedAverageShsOut / 2;
  const m = buildModel(r);
  assert.equal(m.splitsAdj.filter((s) => !s.recent).length, 0);
});

test('precios sin ajustar solo se ajustan con splits reales', () => {
  const r = raw();
  r.prices = { ok: true, unadjusted: true, data: [{ date: '2026-01-02', close: 100, high: 101, low: 99, open: 100 }, { date: '2026-01-05', close: 50, high: 51, low: 49, open: 50 }] };
  r.splits = { ok: true, data: [] };
  assert.equal(buildModel(r).prices[0].close, 100); // desplome real: se respeta
  r.splits = { ok: true, data: [{ date: '2026-01-05', numerator: 2, denominator: 1 }] };
  assert.equal(buildModel(r).prices[0].close, 50); // split real: se ajusta
});

test('XBRL: arrendamiento financiero no se cuenta dos veces', () => {
  const F = (concept, val, unit, start) => ({ concept: 'us-gaap:' + concept, start, end: '2025-12-31', val, unit, filed: '2026-02-01' });
  const st = toStatements([F('Revenues', 1000, 'USD', '2025-01-01'), F('NetIncomeLoss', 100, 'USD', '2025-01-01'), F('Assets', 5000, 'USD'), F('LongTermDebtAndCapitalLeaseObligations', 400, 'USD'), F('FinanceLeaseLiability', 50, 'USD')], 'X');
  assert.equal(st.balance[0].longTermDebt, 400);
});

test('FMP: capitalización y precio de la cotización van juntos (caída del día sin acciones inventadas)', () => {
  const base = buildModel(raw());
  const r = raw(); const p = one(r, 'profile'), q = one(r, 'quote');
  p.sharesOutstanding = base.shares; delete q.sharesOutstanding;
  q.price *= 0.7; q.marketCap *= 0.7; // la cotización de hoy ya refleja la caída; el perfil sigue con el precio de ayer
  const m = buildModel(r);
  assert.ok(Math.abs(m.shares / base.shares - 1) < 1e-9);
});

import { historical } from '../js/calc/simulate.js';
test('simulador: 100 días no recortan 5 años y no se anualiza con menos de un año', () => {
  const mk = (from, n, step) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(from) + i * 864e5 * step).toISOString().slice(0, 10), close: 100 + i }));
  const today = Date.now(), d = (y) => new Date(today - y * 365.25 * 864e5).toISOString().slice(0, 10);
  const A = mk(d(5), 260, 7), R = mk(d(0.3), 100, 1);
  const h = historical(A, R, [], 10);
  assert.ok(h.drip && h.drip.years > 4); assert.equal(h.noDrip, null);
  const h1 = historical(null, R, [], 1); assert.equal(h1.noDrip.cagr, null);
});
