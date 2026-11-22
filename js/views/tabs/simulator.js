// Simulador: rentabilidad histórica con/sin reinversión de dividendos frente al S&P 500 y proyección a 5-10 años.
import { data } from '../../providers/index.js';
import { fundamentals } from '../../ui/charts.js';
import { esc, card, num, pct, big, cls, sgnPct, origin, unavailable, source } from '../../ui/dom.js';
import { isNum, mean } from '../../calc/finance.js';
import { historical, forward } from '../../calc/simulate.js';
import { extra } from '../company.js';

export async function render(el, S) {
  const m = S.m, cur = m.tradeCur;
  el.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const [adj, idx] = await Promise.allSettled([extra(S, 'adj', () => data.pricesAdjusted(m.symbol, '1990-01-01')), extra(S, 'idx^GSPC', () => data.index('^GSPC', '1980-01-01'))]);
  const raw = m.priceData;
  const A = adj.status === 'fulfilled' ? adj.value.data : null, I = idx.status === 'fulfilled' ? idx.value.data : null;
  const hs = [3, 5, 10, 20].map((y) => ({ y, ...historical(A, raw, I, y, 10000) }));
  const eps = m.X(m.T.eps);
  const g0 = m.growth.analystEps ?? m.growth.eps5 ?? 0.05;
  const pe5 = mean(m.ratiosHist.slice(-5).map((r) => r.priceToEarningsRatio).filter((v) => isNum(v) && v > 0 && v < 200));
  const payout = isNum(m.T.dividendsPaid) && isNum(m.T.netIncome) && m.T.netIncome > 0 ? Math.min(1, m.T.dividendsPaid / m.T.netIncome) : 0;
  const st = { amount: 10000, years: 10, g: g0, pe: pe5 ?? m.pe ?? 15, payout, drip: true };
  el.innerHTML = `${card('Rentabilidad histórica de 10.000 invertidos', `<div class="tablewrap"><table><thead><tr><th class="l">Horizonte</th><th>Con dividendos reinvertidos</th><th>Anual</th><th>Solo precio</th><th>Anual</th><th>S&P 500 (precio)</th><th>Anual</th></tr></thead><tbody>
      ${hs.map((h) => `<tr><td class="l">${h.y} años${h.drip ? ` <span class="note">desde ${esc(h.drip.from)}</span>` : ''}</td><td><b>${h.drip ? big(h.drip.final) : '—'}</b></td><td class="${cls(h.drip && h.drip.cagr)}">${h.drip ? sgnPct(h.drip.cagr) : '—'}</td><td>${h.noDrip ? big(h.noDrip.final) : '—'}</td><td>${h.noDrip ? sgnPct(h.noDrip.cagr) : '—'}</td><td>${h.index ? big(h.index.final) : '—'}</td><td>${h.index ? sgnPct(h.index.cagr) : '—'}</td></tr>`).join('')}
      </tbody></table></div><p class="note">«Con dividendos reinvertidos» usa precios ajustados por dividendos (equivale a reinvertir cada dividendo en la fecha ex-dividendo). Sin comisiones ni impuestos. «—»: no hay histórico suficiente con tu plan de datos.</p>
      ${adj.status === 'rejected' ? unavailable('Precios ajustados por dividendo', adj.reason) : ''}${idx.status === 'rejected' ? unavailable('S&P 500', idx.reason) : ''}${source(adj.value, idx.value)}`)}
    <div class="grid g2" style="margin-top:14px">
      ${card('Proyección a futuro (supuestos editables)', `<form id="sf" class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <label class="f">Importe inicial (${esc(cur)})<input class="in" id="sa" type="number" value="${st.amount}"></label>
        <label class="f">Años<select class="in" id="sy"><option value="5">5</option><option value="10" selected>10</option></select></label>
        <label class="f"><span>Crecimiento anual del BPA (%) ${origin(isNum(m.growth.analystEps) ? 'analistas' : 'real · CAGR 5a')}</span><input class="in" id="sg" type="number" step="0.5" value="${(st.g * 100).toFixed(1)}"></label>
        <label class="f"><span>PER de salida ${origin(isNum(pe5) ? 'real · media 5a' : 'supuesto')}</span><input class="in" id="sp" type="number" step="0.5" value="${st.pe.toFixed(1)}"></label>
        <label class="f"><span>Payout (% del beneficio repartido) ${origin('real · último ejercicio')}</span><input class="in" id="spo" type="number" step="1" value="${(st.payout * 100).toFixed(0)}"></label>
        <label class="f">Reinversión de dividendos<select class="in" id="sd"><option value="1">Sí (DRIP)</option><option value="0">No</option></select></label>
      </form><div id="sres" style="margin-top:12px"></div>`)}
      ${card('Evolución proyectada del valor', '<div class="chart"><canvas id="sc1"></canvas></div><div id="sscen"></div>')}
    </div>`;
  const run = () => {
    const v = (id) => Number(el.querySelector('#' + id).value);
    const p = { price: m.price, eps, epsGrowth: v('sg') / 100, exitPE: v('sp'), payout: v('spo') / 100, years: v('sy'), drip: el.querySelector('#sd').value === '1', amount: v('sa') };
    const r = forward(p);
    if (!r) { el.querySelector('#sres').innerHTML = '<div class="empty">Se necesita un BPA positivo para proyectar.</div>'; return; }
    const pes = forward({ ...p, epsGrowth: p.epsGrowth * 0.5, exitPE: p.exitPE * 0.8 }), opt = forward({ ...p, epsGrowth: p.epsGrowth * 1.5, exitPE: p.exitPE * 1.1 });
    el.querySelector('#sres').innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Valor final</span><b>${big(r.final, cur)}</b></div><div class="kpi"><span>Rentabilidad anual</span><b class="${cls(r.cagr)}">${sgnPct(r.cagr)}</b></div><div class="kpi"><span>Multiplicador</span><b>${num(r.multiple, 2)}×</b></div></div>
      <p class="note">BPA actual ${num(eps)} · PER actual ${num(m.price / eps, 1)}× → ${num(p.exitPE, 1)}× al final. El PER converge linealmente. Es una proyección con tus supuestos, no una previsión.</p>`;
    el.querySelector('#sscen').innerHTML = `<table class="dense" style="margin-top:10px"><thead><tr><th class="l">Escenario</th><th>Crec. BPA</th><th>PER salida</th><th>Valor final</th><th>Anual</th></tr></thead><tbody>${[['Pesimista', p.epsGrowth * 0.5, p.exitPE * 0.8, pes], ['Base', p.epsGrowth, p.exitPE, r], ['Optimista', p.epsGrowth * 1.5, p.exitPE * 1.1, opt]].map(([l, g, pe, x]) => `<tr><td class="l">${l}</td><td>${pct(g)}</td><td>${num(pe, 1)}×</td><td>${big(x.final)}</td><td class="${cls(x.cagr)}">${sgnPct(x.cagr)}</td></tr>`).join('')}</tbody></table>`;
    fundamentals('sc1', r.rows.map((x) => 'Año ' + x.t), [{ label: 'Pesimista', data: pes.rows.map((x) => x.value), type: 'line', dash: [4, 3] }, { label: 'Base', data: r.rows.map((x) => x.value), type: 'line' }, { label: 'Optimista', data: opt.rows.map((x) => x.value), type: 'line', dash: [4, 3] }]);
  };
  el.querySelector('#sf').oninput = run; run();
}
