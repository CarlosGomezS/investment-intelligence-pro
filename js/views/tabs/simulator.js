// Simulador: rentabilidad histórica con/sin reinversión de dividendos frente al S&P 500 y proyección a 5-10 años.
import { data } from '../../providers/index.js?v=05f60eff';
import { fundamentals } from '../../ui/charts.js?v=05f60eff';
import { esc, card, num, pct, big, cls, sgnPct, origin, unavailable, source } from '../../ui/dom.js?v=05f60eff';
import { isNum, mean } from '../../calc/finance.js?v=05f60eff';
import { historical, forward } from '../../calc/simulate.js?v=05f60eff';
import { extra } from '../company.js?v=05f60eff';

export async function render(el, S) {
  const m = S.m, cur = m.tradeCur;
  el.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const [adj, idx] = await Promise.allSettled([extra(S, 'adj', () => data.pricesAdjusted(m.symbol, '1990-01-01')), extra(S, 'idx^GSPC', () => data.index('^GSPC', '1980-01-01'))]);
  const raw = m.priceData;
  const A = adj.status === 'fulfilled' ? adj.value.data : null, I = idx.status === 'fulfilled' ? idx.value.data : null;
  const hs = [3, 5, 10, 20].map((y) => ({ y, ...historical(A, raw, I, y, 10000) }));
  const eps = m.X(m.T.eps);
  // Sin crecimiento histórico ni de analistas no se inventa un 5 %: el campo queda vacío y lo pone el usuario
  const g0 = m.growth.analystEps ?? m.growth.eps5 ?? null;
  const gOrigin = isNum(m.growth.analystEps) ? 'analistas' : isNum(m.growth.eps5) ? 'real · CAGR 5a' : 'falta: escribe tu supuesto';
  const pe5 = mean(m.ratiosHist.slice(-5).map((r) => r.priceToEarningsRatio).filter((v) => isNum(v) && v > 0 && v < 200));
  // Payout: real si hay dividendos pagados y beneficio; empresa que no paga (dividendo confirmado 0) = 0; si no, vacío
  const payout = isNum(m.T.dividendsPaid) && isNum(m.T.netIncome) && m.T.netIncome > 0 ? Math.min(1, m.T.dividendsPaid / m.T.netIncome) : m.dpsTTM === 0 ? 0 : null;
  const poOrigin = isNum(m.T.dividendsPaid) && isNum(m.T.netIncome) && m.T.netIncome > 0 ? 'real · último ejercicio' : m.dpsTTM === 0 ? 'real · no reparte dividendo' : 'falta: escribe tu supuesto';
  const st = { amount: 10000, years: 10, g: g0, pe: pe5 ?? (m.pe > 0 ? m.pe : 15), payout: isNum(payout) ? Math.max(0, Math.min(1, payout)) : null, drip: true };
  el.innerHTML = `${card('Rentabilidad histórica de 10.000 invertidos', `<div class="tablewrap"><table><thead><tr><th class="l">Horizonte</th><th>Con dividendos reinvertidos</th><th>Anual</th><th>Solo precio</th><th>Anual</th><th>S&P 500 (precio)</th><th>Anual</th></tr></thead><tbody>
      ${hs.map((h) => `<tr><td class="l">${h.y} años${h.from ? ` <span class="note">desde ${esc(h.from)}${h.partial ? ` · solo hay ${num(h.actualYears, 1)} años de historia: rentabilidad anual sobre ese periodo` : ''}${h.dropped && h.dropped.length ? ` · sin historia suficiente: ${esc(h.dropped.join(', '))}` : ''}</span>` : ''}</td><td><b>${h.drip ? big(h.drip.final) : '—'}</b></td><td class="${cls(h.drip && h.drip.cagr)}">${h.drip ? sgnPct(h.drip.cagr) : '—'}</td><td>${h.noDrip ? big(h.noDrip.final) : '—'}</td><td>${h.noDrip ? sgnPct(h.noDrip.cagr) : '—'}</td><td>${h.index ? big(h.index.final) : '—'}</td><td>${h.index ? sgnPct(h.index.cagr) : '—'}</td></tr>`).join('')}
      </tbody></table></div><p class="note">«Con dividendos reinvertidos» usa precios ajustados por dividendos (equivale a reinvertir cada dividendo en la fecha ex-dividendo). Sin comisiones ni impuestos. «—»: no hay histórico suficiente con tu plan de datos.</p>
      ${adj.status === 'rejected' ? unavailable('Precios ajustados por dividendo', adj.reason) : ''}${idx.status === 'rejected' ? unavailable('S&P 500', idx.reason) : ''}${source(adj.value, idx.value)}`)}
    <div class="grid g2" style="margin-top:14px">
      ${card('Proyección a futuro (supuestos editables)', `<form id="sf" class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <label class="f">Importe inicial (${esc(cur)})<input class="in" id="sa" type="number" value="${st.amount}"></label>
        <label class="f">Años<select class="in" id="sy"><option value="5">5</option><option value="10" selected>10</option></select></label>
        <label class="f"><span>Crecimiento anual del BPA (%) ${origin(gOrigin)}</span><input class="in" id="sg" type="number" step="0.5" value="${isNum(st.g) ? (st.g * 100).toFixed(1) : ''}" placeholder="p. ej. 5"></label>
        <label class="f"><span>PER de salida ${origin(isNum(pe5) ? 'real · media 5a' : m.pe > 0 ? 'supuesto · PER actual' : 'supuesto · 15× (edítalo)')}</span><input class="in" id="sp" type="number" step="0.5" value="${st.pe.toFixed(1)}"></label>
        <label class="f"><span>Payout (% del beneficio repartido) ${origin(poOrigin)}</span><input class="in" id="spo" type="number" step="1" value="${isNum(st.payout) ? (st.payout * 100).toFixed(0) : ''}" placeholder="p. ej. 0"></label>
        <label class="f">Reinversión de dividendos<select class="in" id="sd"><option value="1">Sí (DRIP)</option><option value="0">No</option></select></label>
      </form><div id="sres" style="margin-top:12px"></div>`)}
      ${card('Evolución proyectada del valor', '<div class="chart"><canvas id="sc1"></canvas></div><div id="sscen"></div>')}
    </div>`;
  const run = () => {
    const raw = (id) => el.querySelector('#' + id).value.trim();
    if (raw('sg') === '' || raw('spo') === '') { el.querySelector('#sres').innerHTML = '<div class="empty">Falta un dato real para proyectar: escribe tu supuesto de crecimiento del BPA y de payout (no se rellenan solos para no presentar un supuesto como histórico).</div>'; return; }
    const v = (id) => Number(el.querySelector('#' + id).value);
    const p = { price: m.price, eps, epsGrowth: v('sg') / 100, exitPE: v('sp'), payout: v('spo') / 100, years: v('sy'), drip: el.querySelector('#sd').value === '1', amount: v('sa') };
    if (!(p.exitPE > 0) || !(p.years >= 1) || !(p.amount > 0) || p.epsGrowth <= -0.99 || !(p.payout >= 0 && p.payout <= 1)) { el.querySelector('#sres').innerHTML = '<div class="empty">Revisa los supuestos: PER de salida y años mayores que 0, crecimiento mayor que −99 % y payout entre 0 y 100 %.</div>'; return; }
    const r = forward(p);
    if (!r) { el.querySelector('#sres').innerHTML = '<div class="empty">Se necesita un BPA positivo para proyectar.</div>'; return; }
    const gP = Math.max(-0.95, p.epsGrowth - Math.abs(p.epsGrowth) * 0.5), gO = p.epsGrowth + Math.abs(p.epsGrowth) * 0.5; // ordenados también con crecimiento negativo
    const pes = forward({ ...p, epsGrowth: gP, exitPE: p.exitPE * 0.8 }), opt = forward({ ...p, epsGrowth: gO, exitPE: p.exitPE * 1.1 });
    if (!pes || !opt) return;
    el.querySelector('#sres').innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Valor final</span><b>${big(r.final, cur)}</b></div><div class="kpi"><span>Rentabilidad anual</span><b class="${cls(r.cagr)}">${sgnPct(r.cagr)}</b></div><div class="kpi"><span>Multiplicador</span><b>${num(r.multiple, 2)}×</b></div></div>
      <p class="note">BPA actual ${num(eps)} · PER actual ${num(m.price / eps, 1)}× → ${num(p.exitPE, 1)}× al final. El PER converge linealmente. Es una proyección con tus supuestos, no una previsión.</p>`;
    el.querySelector('#sscen').innerHTML = `<table class="dense" style="margin-top:10px"><thead><tr><th class="l">Escenario</th><th>Crec. BPA</th><th>PER salida</th><th>Valor final</th><th>Anual</th></tr></thead><tbody>${[['Pesimista', gP, p.exitPE * 0.8, pes], ['Base', p.epsGrowth, p.exitPE, r], ['Optimista', gO, p.exitPE * 1.1, opt]].map(([l, g, pe, x]) => `<tr><td class="l">${l}</td><td>${pct(g)}</td><td>${num(pe, 1)}×</td><td>${big(x.final)}</td><td class="${cls(x.cagr)}">${sgnPct(x.cagr)}</td></tr>`).join('')}</tbody></table>`;
    fundamentals('sc1', r.rows.map((x) => 'Año ' + x.t), [{ label: 'Pesimista', data: pes.rows.map((x) => x.value), type: 'line', dash: [4, 3] }, { label: 'Base', data: r.rows.map((x) => x.value), type: 'line' }, { label: 'Optimista', data: opt.rows.map((x) => x.value), type: 'line', dash: [4, 3] }]);
  };
  el.querySelector('#sf').oninput = run; run();
}
