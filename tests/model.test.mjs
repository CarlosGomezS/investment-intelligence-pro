// Prueba de integración con datos reales de Apple (FMP, noviembre 2026) recortados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../js/calc/model.js';
import { evaluateRatios } from '../js/calc/ratios.js';
import { detectAlerts } from '../js/calc/alerts.js';
import { score } from '../js/calc/scoring.js';
import { dcfDefaults, runDcf, multiples, dividendModel, composite } from '../js/calc/intrinsic.js';
import { buildReport } from '../js/calc/report.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/aapl.json', import.meta.url)));
const ok = (data) => ({ ok: true, data, source: 'Financial Modeling Prep', fetchedAt: 0 });
const raw = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, ok(v)]));
raw.estimates = { ok: false, error: { code: 'premium', message: 'plan' } };

test('modelo de empresa con datos reales', () => {
  const m = buildModel(raw);
  assert.equal(m.symbol, 'AAPL');
  assert.equal(m.years.length, 2);
  assert.equal(m.last.year, '2026');
  assert.ok(Math.abs(m.last.fcf - 136056000000) < 1);
  assert.ok(m.market.wacc && m.market.wacc.wacc > 0.05 && m.market.wacc.wacc < 0.12, 'WACC razonable');
  assert.ok(m.prov.estimates.error === 'premium', 'el dato premium queda registrado como no disponible');

  const ratios = evaluateRatios(m);
  assert.equal(ratios.length, 24);
  const pe = ratios.find((r) => r.id === 'pe');
  assert.ok(pe.value > 30 && pe.value < 45);

  const alerts = detectAlerts(m);
  assert.ok(Array.isArray(alerts));

  const d = dcfDefaults(m);
  const inp = { fcf0: d.fcfBase.value, growth: d.growth.value, years: 10, terminalGrowth: 0.025, wacc: d.wacc.value, netDebt: d.netDebt.value, shares: d.shares.value };
  const r = runDcf(m, inp);
  assert.ok(r.perShare > 0 && r.sens.grid.length === 5 && r.scen.length === 3);

  const mult = multiples(m, null);
  const ddm = dividendModel(m, m.market.wacc.ke);
  const comp = composite(m, r, mult, ddm);
  const sc = score(m, { alerts, mos: comp.mos, prices: [] });
  assert.ok(sc.total >= 0 && sc.total <= 100);
  assert.equal(sc.cats.length, 9);
  const rep = buildReport(m, sc, { dcf: r, composite: comp, ddm }, alerts);
  assert.equal(rep.questions.length, 13);
  assert.ok(rep.conclusion.length > 10);
});

test('split posterior al último ejercicio: BPA y PER ajustados (caso Booking 2026)', () => {
  const r2 = JSON.parse(JSON.stringify(raw));
  const q = r2.quote.data[0] || r2.quote.data; const p = r2.profile.data[0] || r2.profile.data;
  q.price = q.price / 25; p.price = q.price; // misma capitalización, 25 veces más acciones
  delete q.sharesOutstanding; delete p.sharesOutstanding;
  const base = buildModel(raw), m = buildModel(r2);
  assert.ok(m.splitsAdj.some((s) => s.recent && s.factor === 25));
  assert.ok(Math.abs(m.last.eps * 25 / base.last.eps - 1) < 0.01);
  assert.ok(Math.abs((m.price / m.T.eps) / (base.price / base.T.eps) - 1) < 0.02); // mismo PER
});
