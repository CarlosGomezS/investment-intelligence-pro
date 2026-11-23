// Décima revisión: auditoría económica (familias de valoración, WACC sin coste de deuda, años mínimos,
// universo de Piotroski, TTM incompleto) y flecos (PER en autocomprobación, beta supuesta, secretos de Cloudflare).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/calc/model.js';
import { composite } from '../js/calc/intrinsic.js';
import { wacc } from '../js/calc/valuation.js';
import { METHODS, rankMethod } from '../js/calc/methods.js';
import { metricsFor } from '../js/calc/scoring.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { ok: true, data: v }]));

test('PER a 5 y a 10 años no bastan: son la misma familia', () => {
  const m = { price: 100 };
  const c = composite(m, null, [{ method: 'PER medio 5 años', value: 100 }, { method: 'PER medio 10 años', value: 110 }], null);
  assert.equal(c.value, null);
  assert.match(c.reason, /insuficientemente contrastada/);
});

test('DCF + múltiplos = contrastada; múltiplos propios + de competidores = calculada pero no contrastada', () => {
  const m = { price: 100 };
  const a = composite(m, { perShare: 120 }, [{ method: 'PER medio 5 años', value: 100 }], null);
  assert.ok(a.value > 0); assert.equal(a.contrasted, true);
  const b = composite(m, null, [{ method: 'PER medio 5 años', value: 100 }, { method: 'PER mediano de competidores', value: 90 }], null);
  assert.ok(b.value > 0); assert.equal(b.contrasted, false);
});

test('WACC sin coste de deuda: se marca como supuesto', () => {
  const w = wacc({ rf: 0.04, beta: 1, erp: 0.05, costDebtPre: null, taxRate: 0.25, equityValue: 50, debtValue: 50 });
  assert.equal(w.kdAssumed, true);
  const w2 = wacc({ rf: 0.04, beta: 1, erp: 0.05, costDebtPre: 0.06, taxRate: 0.25, equityValue: 50, debtValue: 50 });
  assert.equal(w2.kdAssumed, false);
});

test('Piotroski: con una sola empresa no basta ser «la más barata»', () => {
  const S = { m: { scores: { piotroskiScore: 9 }, marketCap: 200, X: (v) => v, years: [{ equity: 100 }], last: { equity: 100 }, T: {}, price: 10, profile: { sector: 'Technology' } } };
  const [x] = rankMethod('piotroski', [{ sym: 'X', S }]);
  assert.notEqual(x.res.verdict, 'entra'); // P/VC 2 con universo de 1
});

test('2 años con FCF positivo no puntúan como 10 años de estabilidad', () => {
  const m = buildModel(raw);
  const short = { ...m, years: m.years.slice(-2) };
  const r = metricsFor(short, { alerts: [], prices: [] }).find((x) => x.name.startsWith('Años con FCF positivo'));
  assert.equal(r.score, null);
  assert.match(r.display, /mínimo 5/);
});

test('TTM sin flujos de caja: no se mezclan periodos', () => {
  const r2 = { ...raw, incomeTTM: { ok: true, data: { ...fx.income[0], date: 'TTM' } }, cashflowTTM: { ok: false } };
  const m = buildModel(r2);
  assert.equal(m.ttmPartial, true);
  assert.equal(m.ttmIsReal, false);
  assert.equal(m.T, m.last);
});

test('la moneda de cotización sale de la cotización cuando el precio viene de ella', () => {
  const r2 = { ...raw, profile: { ok: true, data: { ...fx.profile, currency: 'GBP' } }, quote: { ok: true, data: { ...(fx.quote || {}), price: 500, currency: 'GBp' } } };
  assert.equal(buildModel(r2).tradeCur, 'GBp');
});

test('flujo de publicación: falla si solo hay uno de los dos secretos de Cloudflare', () => {
  const y = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(y, /Falta CLOUDFLARE_ACCOUNT_ID/);
  assert.match(y, /Falta CLOUDFLARE_API_TOKEN/);
});

import { decide } from '../js/calc/decision.js';
test('decisión en cuatro ejes: excelente pero cara → seguimiento con precio máximo de compra', () => {
  const m = { price: 105, tradeCur: 'EUR', profile: { companyName: 'X', sector: 'Technology' }, scores: { altmanZScore: 6 }, growth: { shares5: -0.01 }, T: { fcf: 10 }, last: {}, dpsTTM: 0 };
  const sc = { cats: [{ key: 'calidad', score: 85 }, { key: 'rentabilidad', score: 90 }, { key: 'moat', score: 80 }, { key: 'caja', score: 85 }, { key: 'solidez', score: 80 }] };
  const val = { composite: { value: 117, low: 100, high: 130, mos: (117 - 105) / 117, contrasted: true }, reliability: { level: 'media', reasons: [] }, dcf: null };
  const D = decide(m, sc, val, []);
  assert.equal(D.quality.label, 'Excelente');
  assert.ok(Math.abs(D.valuation.maxBuy - 117 * 0.7) < 1e-9); // fiabilidad media: 30 % de margen
  assert.equal(D.valuation.label, 'Razonable (sin margen suficiente)');
  assert.match(D.action, /esperar a/);
  assert.equal(D.risk.label, 'Bajo');
});
test('decisión: sin valoración fiable no hay precio de compra', () => {
  const m = { price: 10, tradeCur: 'USD', profile: {}, scores: {}, growth: {}, T: {}, last: {} };
  const D = decide(m, { cats: [] }, { composite: { value: null, reason: 'x' }, reliability: { level: 'no valorable', reasons: ['x'] } }, []);
  assert.equal(D.valuation.maxBuy, null); assert.equal(D.potential, null);
});
