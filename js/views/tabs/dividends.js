// Dividendos: historial completo, DPA anual, rentabilidad histórica, crecimiento, payout, continuidad, recortes y próximas fechas.
import { fundamentals } from '../../ui/charts.js?v=984486c8';
import { esc, card, pct, num, date, cls, sgnPct, table, source } from '../../ui/dom.js?v=984486c8';
import { isNum, div, cagrN } from '../../calc/finance.js?v=984486c8';
import { exportCSV } from '../../export.js?v=984486c8';

export function render(el, S) {
  const m = S.m, cur = m.tradeCur, d = m.dpsSeries, all = m.divs;
  if (!all.length) { el.innerHTML = card('Dividendos', `<div class="empty">${S.raw.dividends.ok ? `${esc(m.profile.companyName || m.symbol)} no tiene historial de dividendos en el proveedor` : `Tus fuentes gratuitas no ofrecen el historial de dividendos de esta empresa (${esc(S.raw.dividends.error && S.raw.dividends.error.message)}); no significa que no pague`}. Su retribución al accionista, si la hay, se hace vía recompras (ver Estados financieros → Flujos).</div>`); return; }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all.filter((x) => x.date >= today || (x.paymentDate && x.paymentDate >= today));
  const vals = d.map((x) => x.dps);
  const g = d.map((x, i) => (i ? div(x.dps - d[i - 1].dps, d[i - 1].dps) : null));
  const cuts = d.filter((x, i) => i && x.dps < d[i - 1].dps * 0.95).map((x, i) => x.year);
  // Rachas contadas desde el último año CERRADO: si dejó de pagar, la racha es 0 y se avisa de la suspensión
  if (!d.length) { el.innerHTML = card('Dividendos', `<div class="empty">Ha empezado a pagar dividendo este año (${all.length} pago${all.length > 1 ? 's' : ''}); aún no hay ningún año completo para calcular rachas ni crecimiento.</div>`); return; }
  const yearsSet = new Set(d.map((x) => +x.year)); const lastClosed = new Date().getFullYear() - 1;
  const maxY = lastClosed; const suspendedSince = yearsSet.has(lastClosed) ? null : Math.max(...yearsSet) + 1;
  let streak = 0; for (let y = maxY; yearsSet.has(y); y--) streak++;
  // Años seguidos SUBIÉNDOLO: consecutivos y con subida real (un año plano o un hueco rompe la racha)
  let inc = 0; for (let i = d.length - 1; i > 0 && +d[i].year === +d[i - 1].year + 1 && d[i].dps > d[i - 1].dps * 1.001 && !suspendedSince; i--) inc++;
  const gaps = []; for (let y = Math.min(...yearsSet); y <= maxY; y++) if (!yearsSet.has(y)) gaps.push(y);
  // Con beneficio o FCF ≤ 0 la cobertura no es un porcentaje: se marca como no cubierta (uncov)
  const pYears = m.years.slice(-10).map((y) => ({ year: y.year, ni: y.netIncome > 0 ? div(y.dividendsPaid, y.netIncome) : null, fcf: y.fcf > 0 ? div(y.dividendsPaid, y.fcf) : null, uncovNi: y.dividendsPaid > 0 && !(y.netIncome > 0), uncovFcf: y.dividendsPaid > 0 && !(y.fcf > 0) }));
  const lastP = pYears[pYears.length - 1] || {};
  // rentabilidad por dividendo histórica: DPA del año / cierre medio del año
  const px = m.priceData || [];
  const avgPx = {}; for (const p of px) { const y = p.date.slice(0, 4); (avgPx[y] = avgPx[y] || []).push(p.close); }
  const yld = d.map((x) => (avgPx[x.year] ? x.dps / (avgPx[x.year].reduce((a, b) => a + b, 0) / avgPx[x.year].length) : null));
  const freq = all[all.length - 1].frequency;
  el.innerHTML = `<div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><span>Dividendo últimos 12 meses</span><b>${num(m.dpsTTM, 3)} ${esc(cur)}</b></div><div class="kpi"><span>Rentabilidad actual</span><b>${pct(m.dpsTTM / m.price, 2)}</b></div>
      <div class="kpi"><span>CAGR 3 años</span><b>${pct(cagrN(vals, 3))}</b></div><div class="kpi"><span>CAGR 5 años</span><b>${pct(cagrN(vals, 5))}</b></div><div class="kpi"><span>CAGR 10 años</span><b>${pct(cagrN(vals, 10))}</b></div>
      <div class="kpi"><span>Payout sobre beneficio</span><b>${lastP.uncovNi ? 'con pérdidas' : pct(lastP.ni, 0)}</b></div><div class="kpi"><span>Payout sobre FCF</span><b>${lastP.uncovFcf ? 'FCF negativo' : pct(lastP.fcf, 0)}</b></div>
      <div class="kpi"><span>Años seguidos pagando</span><b>${streak}</b></div><div class="kpi"><span>Años seguidos subiéndolo</span><b>${inc}</b></div><div class="kpi"><span>Frecuencia</span><b>${esc(freq || '—')}</b></div>
    </div>
    <div class="grid g2">
      ${card('Próximas fechas', upcoming.length ? table('upd', [{ k: 'declarationDate', label: 'Anuncio', f: date, align: 'left' }, { k: 'date', label: 'Ex-dividendo', f: date }, { k: 'recordDate', label: 'Registro', f: date }, { k: 'paymentDate', label: 'Pago', f: date }, { k: 'dividend', label: 'Importe', f: (v) => num(v, 4) }], upcoming) : '<p class="note">No hay fechas anunciadas pendientes. Las fechas se publican cuando el consejo aprueba el dividendo.</p>')}
      ${card('Continuidad, recortes y suspensiones', `<div class="alert-row"><span class="pill ${cuts.length ? 'media' : 'baja'}">${cuts.length ? 'Recortes' : 'OK'}</span><div><p>${cuts.length ? `Años con dividendo anual inferior al anterior: ${cuts.join(', ')}.` : 'Sin recortes del dividendo anual en el historial disponible.'}</p></div></div>
        <div class="alert-row"><span class="pill ${gaps.length ? 'alta' : 'baja'}">${gaps.length ? 'Suspensión' : 'OK'}</span><div><p>${gaps.length ? `${suspendedSince ? `No paga dividendo desde ${suspendedSince}. ` : ''}Años sin dividendo: ${gaps.join(', ')}.` : `Pagos ininterrumpidos desde ${Math.min(...yearsSet)}.`}</p></div></div>
        <div class="alert-row"><span class="pill ${lastP.uncovFcf || (isNum(lastP.fcf) && lastP.fcf > 0.9) ? 'alta' : 'baja'}">Cobertura</span><div><p>${lastP.uncovFcf ? 'Paga dividendo con flujo de caja libre negativo: lo financia con caja o deuda. Insostenible si persiste.' : isNum(lastP.fcf) ? `El dividendo consume el ${pct(lastP.fcf, 0)} del flujo de caja libre ${lastP.fcf > 0.9 ? ': poco margen para mantenerlo si la caja cae.' : '.'}` : 'Sin datos de FCF.'}</p></div></div>
        <p class="note">El año en curso se excluye del cálculo anual por estar incompleto. Importes ajustados por splits.</p>`)}
      ${card('Dividendo por acción anual', '<div class="chart"><canvas id="dv1"></canvas></div>')}
      ${card('Rentabilidad por dividendo histórica', '<div class="chart"><canvas id="dv2"></canvas></div><p class="note">DPA del año / precio medio de cierre del año.</p>')}
      ${card('Payout sobre beneficio y sobre FCF', '<div class="chart"><canvas id="dv3"></canvas></div>')}
      ${card('Historial completo de pagos', `<div style="max-height:360px;overflow:auto">${table('dvh', [{ k: 'date', label: 'Ex-dividendo', f: date, align: 'left' }, { k: 'paymentDate', label: 'Pago', f: date }, { k: 'adjDividend', label: 'Ajustado', f: (v) => num(v, 4) }, { k: 'dividend', label: 'Declarado', f: (v) => num(v, 4) }], all.slice().reverse(), { dense: true })}</div><p class="note"><button class="btn sm" id="dvcsv">Exportar CSV</button></p>${source(m.prov.dividends)}`)}
    </div>`;
  fundamentals('dv1', d.map((x) => x.year), [{ label: 'DPA', data: vals }, { label: 'Crecimiento', data: g, type: 'line', axis: 'y2' }], { fmt: 'n', fmt2: 'pct' });
  fundamentals('dv2', d.map((x) => x.year), [{ label: 'Rentabilidad por dividendo', data: yld, type: 'line' }], { fmt: 'pct' });
  fundamentals('dv3', pYears.map((x) => x.year), [{ label: 'Payout s/ beneficio', data: pYears.map((x) => x.ni) }, { label: 'Payout s/ FCF', data: pYears.map((x) => x.fcf) }], { fmt: 'pct' });
  el.querySelector('#dvcsv').onclick = () => exportCSV(`${m.symbol}_dividendos`, [['Ex-dividendo', 'Pago', 'Registro', 'Ajustado', 'Declarado'], ...all.map((x) => [x.date, x.paymentDate || '', x.recordDate || '', x.adjDividend ?? '', x.dividend ?? ''])]);
}
