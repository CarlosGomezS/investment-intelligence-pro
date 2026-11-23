import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/calc/model.js';
import { dcfDefaults, runDcf, multiples, dividendModel, composite } from '../js/calc/intrinsic.js';
import { METHODS, rankMethod } from '../js/calc/methods.js';
import { alligator, smma, fractals } from '../js/calc/alligator.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { ok: true, data: v }]));
function S0(r) {
  const m = buildModel(r); const d = dcfDefaults(m);
  const inputs = { fcf0: d.fcfBase.value, growth: d.growth.value, years: d.years.value, terminalGrowth: d.terminalGrowth.value, rf: d.rf.value, beta: d.beta.value, erp: d.erp.value, wacc: m.market.wacc && m.market.wacc.wacc, netDebt: d.netDebt.value, shares: d.shares.value };
  const dcfRes = runDcf(m, inputs), mult = multiples(m, null), ddm = dividendModel(m, null);
  return { m, val: { composite: composite(m, dcfRes, mult, ddm) } };
}

test('cada método devuelve nota, veredicto y comprobaciones con datos reales', () => {
  const r = [{ sym: 'AAPL', S: S0(raw) }];
  for (const id of Object.keys(METHODS)) {
    const [x] = rankMethod(id, r);
    assert.ok(x.res.score >= 0 && x.res.score <= 100, id);
    assert.ok(['entra', 'vigilar', 'no'].includes(x.res.verdict), id);
    assert.ok(x.res.checks.length >= 2, id);
    for (const c of x.res.checks) assert.ok(c.v && c.rule, id + ': ' + c.t);
  }
});

test('Graham: PER y P/VC caros no pasan', () => {
  const [x] = rankMethod('graham', [{ sym: 'AAPL', S: S0(raw) }]);
  const pe = x.res.checks.find((c) => c.t === 'PER moderado');
  assert.equal(pe.ok, false); // Apple cotiza muy por encima de 15 veces beneficios
});

test('cocodrilo: tendencia alcista limpia = come al alza; stop bajo el precio', () => {
  const bars = []; let p = 100;
  for (let i = 0; i < 120; i++) { p *= 1.004; const w = i % 7 === 3 ? 0.97 : 1; bars.push({ date: `d${i}`, high: p * 1.01, low: p * 0.99 * w, close: p }); }
  const a = alligator(bars);
  assert.ok(a.state.startsWith('come al alza'), a.state);
  assert.ok(a.lips > a.teeth && a.teeth > a.jaw);
  assert.ok(a.stop < a.close);
  assert.equal(smma([1, 2, 3, 4], 2)[1], 1.5);
  assert.equal(fractals([{ high: 1, low: 5 }, { high: 2, low: 4 }, { high: 5, low: 1 }, { high: 2, low: 4 }, { high: 1, low: 5 }]).up.length, 1);
});
