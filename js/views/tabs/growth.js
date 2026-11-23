// Crecimiento y calidad del negocio: CAGR por horizontes, márgenes, ROIC, productividad del capital,
// crecimiento orgánico vs. adquisiciones, deuda, dilución, estabilidad y generación de caja.
import { fundamentals } from '../../ui/charts.js?v=e1106417';
import { esc, card, pct, big, num, cls, sgnPct, table } from '../../ui/dom.js?v=e1106417';
import { isNum, div, cagrN, stdev, yoy, sum } from '../../calc/finance.js?v=e1106417';

export function render(el, S) {
  const m = S.m, Y = m.years, cur = m.repCur;
  const s = (f) => Y.map((y) => y[f]);
  const H = [1, 3, 5, 10];
  const rows = [['Ingresos', 'revenue'], ['Beneficio neto', 'netIncome'], ['BPA diluido', 'eps'], ['Flujo de caja libre', 'fcf'], ['EBITDA', 'ebitda'], ['Acciones en circulación', 'shares'], ['Deuda total', 'debt'], ['Patrimonio neto', 'equity']]
    .map(([l, f]) => ({ l, ...Object.fromEntries(H.map((h) => [h, cagrN(s(f), h)])) }));
  const labels = Y.map((y) => y.year);
  const first = Y[Math.max(0, Y.length - 6)], last = Y[Y.length - 1];
  const win = Y.slice(-6);
  const acq = sum(win.slice(1).map((y) => y.acquisitions)), revInc = isNum(last.revenue) && isNum(first.revenue) ? last.revenue - first.revenue : null;
  const gwInc = isNum(last.goodwill) && isNum(first.goodwill) ? last.goodwill - first.goodwill : null;
  const debtInc = isNum(last.debt) && isNum(first.debt) ? last.debt - first.debt : null;
  const shG = cagrN(s('shares'), Math.min(5, Y.length - 1));
  const buy = sum(win.slice(1).map((y) => y.buybacks)), iss = sum(win.slice(1).map((y) => y.issuance)), sbc = sum(win.slice(1).map((y) => y.sbc));
  const assetTurn = Y.map((y) => div(y.revenue, y.assets));
  const revStd = stdev(yoy(s('revenue')).slice(-10).filter(isNum));
  const fcfPos = Y.slice(-10).filter((y) => isNum(y.fcf));
  const checks = [
    { ok: !(isNum(acq) && isNum(revInc) && revInc > 0 && acq > 0.5 * revInc), t: isNum(acq) && acq > 0 ? `Adquisiciones de ${big(acq, cur)} en ${win.length - 1} años frente a un aumento de ventas de ${big(revInc, cur)} (${isNum(revInc) && revInc > 0 ? pct(acq / revInc, 0) : '—'}).` : 'Sin adquisiciones relevantes en el periodo según el estado de flujos.' },
    { ok: !(isNum(gwInc) && isNum(revInc) && gwInc > 0.3 * Math.max(revInc, 1)), t: `Fondo de comercio: ${big(first.goodwill, cur)} → ${big(last.goodwill, cur)}.` },
    { ok: !(isNum(debtInc) && isNum(revInc) && debtInc > Math.max(revInc, 0)), t: `Deuda: ${big(first.debt, cur)} → ${big(last.debt, cur)} (ventas ${big(first.revenue, cur)} → ${big(last.revenue, cur)}).` },
    { ok: !(isNum(shG) && shG > 0.01), t: `Acciones: ${sgnPct(shG)} anual. Recompras ${big(buy, cur)}, emisiones ${big(iss, cur)}, pagos en acciones ${big(sbc, cur)} en el periodo.` },
  ];
  const real = checks.filter((c) => c.ok).length;
  el.innerHTML = `
  ${card('¿Crece de verdad o crece con deuda, compras o acciones?', `<p style="margin-top:0"><b>${real === 4 ? 'Crecimiento de calidad, mayoritariamente orgánico y sin apoyarse en deuda ni dilución.' : real >= 3 ? 'Crecimiento mayoritariamente sano, con algún punto a vigilar.' : 'Buena parte del crecimiento depende de deuda, adquisiciones o emisión de acciones.'}</b> <span class="note">Periodo ${esc(first.year)}–${esc(last.year)}.</span></p>
    ${checks.map((c) => `<div class="alert-row"><span class="pill ${c.ok ? 'baja' : 'media'}" style="${c.ok ? 'color:var(--pos)' : ''}">${c.ok ? 'OK' : 'Ojo'}</span><div><p style="margin:0">${esc(c.t)}</p></div></div>`).join('')}`)}
  <div class="grid g2" style="margin-top:14px">
    ${card('Tasas de crecimiento anual compuesto (CAGR)', table('cagrT', [{ k: 'l', label: 'Magnitud', align: 'left' }, ...H.map((h) => ({ k: String(h), label: h + (h === 1 ? ' año' : ' años'), f: (v) => `<span class="${cls(v)}">${pct(v)}</span>` }))], rows) + '<p class="note">«—»: no hay suficientes años o el valor inicial/final no es positivo (el CAGR no se puede calcular).</p>')}
    ${card('Estabilidad y generación de caja', `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Volatilidad del crecimiento de ventas</span><b>${pct(revStd)}</b></div>
      <div class="kpi"><span>Años con caída de ventas</span><b>${yoy(s('revenue')).slice(-10).filter((v) => isNum(v) && v < 0).length} de ${Math.min(10, Y.length - 1)}</b></div>
      <div class="kpi"><span>Años con FCF positivo</span><b>${fcfPos.filter((y) => y.fcf > 0).length} de ${fcfPos.length}</b></div>
      <div class="kpi"><span>FCF acumulado ${esc(win[0].year)}–${esc(last.year)}</span><b>${big(sum(win.map((y) => y.fcf)), cur)}</b></div>
      <div class="kpi"><span>Conversión FCF/beneficio (media 5a)</span><b>${num(div(sum(win.map((y) => y.fcf)), sum(win.map((y) => y.netIncome))), 2)}×</b></div>
      <div class="kpi"><span>Rotación de activos (último)</span><b>${num(assetTurn[assetTurn.length - 1], 2)}×</b></div></div>`)}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Ingresos, beneficio y FCF', '<div class="chart"><canvas id="g1"></canvas></div>')}
    ${card('Evolución de márgenes', '<div class="chart"><canvas id="g2"></canvas></div>')}
    ${card('ROIC, ROE y productividad del capital', '<div class="chart"><canvas id="g3"></canvas></div><p class="note">Rotación de activos = ventas / activos totales (eje derecho).</p>')}
    ${card('Dilución: acciones en circulación', '<div class="chart"><canvas id="g4"></canvas></div>')}
  </div>`;
  fundamentals('g1', labels, [{ label: 'Ingresos', data: s('revenue') }, { label: 'Beneficio neto', data: s('netIncome') }, { label: 'FCF', data: s('fcf') }]);
  fundamentals('g2', labels, [{ label: 'Margen bruto', data: s('grossMargin'), type: 'line' }, { label: 'Margen operativo', data: s('operatingMargin'), type: 'line' }, { label: 'Margen neto', data: s('netMargin'), type: 'line' }, { label: 'Margen FCF', data: s('fcfMargin'), type: 'line' }], { fmt: 'pct' });
  fundamentals('g3', labels, [{ label: 'ROIC', data: s('roic'), type: 'line' }, { label: 'ROE', data: s('roe').map((v) => (isNum(v) && Math.abs(v) < 3 ? v : null)), type: 'line' }, { label: 'Rotación de activos', data: assetTurn, type: 'line', axis: 'y2', dash: [4, 3] }], { fmt: 'pct', fmt2: 'n' });
  fundamentals('g4', labels, [{ label: 'Acciones diluidas', data: s('shares') }], { fmt: 'big' });
}
