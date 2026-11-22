// Valoración intrínseca: DCF editable con WACC por CAPM, sensibilidad, escenarios, múltiplos, DDM y resumen.
import { esc, card, pct, big, num, cls, sgnPct, origin, toast } from '../../ui/dom.js?v=27218ae7';
import { isNum } from '../../calc/finance.js?v=27218ae7';
import { store } from '../../store.js?v=27218ae7';
import { loadPeers } from './peers.js?v=27218ae7';
import { exportXLSX } from '../../export.js?v=27218ae7';

const P = (v, d = 2) => (isNum(v) ? (v * 100).toFixed(d) : '');

export async function render(el, S, ctx) {
  if (!S.peers) { try { await loadPeers(S); ctx.recompute(); } catch {} }
  const { m, val } = S, d = val.defaults, I = val.inputs, R = val.dcf, cur = m.tradeCur, comp = val.composite;
  const methods = [
    ...(R && isNum(R.perShare) ? [{ n: 'DCF (caso base)', v: R.perShare, o: 'Supuestos editables abajo' }] : []),
    ...(R && R.scen ? R.scen.filter((s) => s.id !== 'base' && s.result && !s.result.error).map((s) => ({ n: `DCF ${s.label.toLowerCase()}`, v: s.result.perShare, o: 'Escenario' })) : []),
    ...val.mult.filter((x) => isNum(x.value) && x.value > 0).map((x) => ({ n: x.method, v: x.value, o: x.origin })),
    ...(val.ddm.applicable && isNum(val.ddm.value) ? [{ n: 'Descuento de dividendos (DDM)', v: val.ddm.value, o: 'Gordon' }] : []),
    ...(isNum(m.priceTarget.targetConsensus) ? [{ n: 'Precio objetivo medio analistas', v: m.priceTarget.targetConsensus, o: 'analistas', ext: true }] : []),
    ...(isNum(m.fmpDcf.dcf) ? [{ n: 'DCF propio de FMP (referencia externa)', v: m.fmpDcf.dcf, o: 'proveedor', ext: true }] : []),
  ];
  const maxV = Math.max(m.price, ...methods.map((x) => x.v)) * 1.08;
  const bar = (x) => `<div style="display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr) 110px;gap:10px;align-items:center;padding:5px 0;font-size:13px"><span>${esc(x.n)}${x.ext ? ' <span class="org est">Externo</span>' : ''}</span><div style="position:relative;height:16px;background:var(--panel2);border-radius:4px"><i style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(1, (x.v / maxV) * 100)}%;background:${x.v >= m.price ? 'var(--pos)' : 'var(--neg)'};opacity:.75;border-radius:4px"></i><i style="position:absolute;top:-3px;bottom:-3px;left:${(m.price / maxV) * 100}%;width:2px;background:var(--ink)"></i></div><b style="text-align:right">${num(x.v)} <small class="mute">${sgnPct(x.v / m.price - 1, 0)}</small></b></div>`;

  const inp = (id, label, value, o, step = '0.1', suf = '%') => `<label class="f"><span>${label} ${origin(o)}</span><span class="row" style="flex-wrap:nowrap"><input class="in" id="${id}" type="number" step="${step}" value="${value}" inputmode="decimal"><span class="mute">${suf}</span></span></label>`;
  const w = I.wacc, ke = I.ke, E = m.marketCap || 0, D = m.X(m.T.debt) || 0;
  const fin = /financ|bank|banco|insur|asegur|reit|real estate/i.test(`${m.profile.sector || ''} ${m.profile.industry || ''}`);
  el.innerHTML = `${fin ? '<div class="empty" style="margin-bottom:14px"><b>Ojo: empresa financiera o inmobiliaria.</b> En bancos, aseguradoras y REIT el DCF de flujo de caja libre y el EV/EBITDA no son apropiados (la deuda es su materia prima). Para ellas pesan más el PER, el precio/valor contable frente al ROE y el dividendo.</div>' : ''}
  <div class="grid g3">
    ${card('Resumen de valoración', `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Precio actual</span><b>${num(m.price)} ${esc(cur)}</b></div><div class="kpi"><span>Valor intrínseco central</span><b>${num(comp.value)} ${esc(cur)}</b></div>
      <div class="kpi"><span>Margen de seguridad</span><b class="${cls(comp.mos)}">${pct(comp.mos, 0)}</b></div><div class="kpi"><span>Potencial de revalorización</span><b class="${cls(comp.up)}">${sgnPct(comp.up, 0)}</b></div></div>
      <p class="note">Valor central = mediana de ${comp.n} estimaciones propias (DCF base con doble peso, múltiplos históricos y de competidores${val.ddm.applicable ? ', DDM' : ''}). No incluye objetivos de analistas ni el DCF de FMP, que se muestran solo como referencia.</p>`, { cls: '' })}
    <div class="span2">${card('Mapa de valoraciones por método', `${methods.map(bar).join('')}<p class="note">Línea vertical: precio actual (${num(m.price)} ${esc(cur)}). Verde = por encima del precio.</p>`)}</div>
  </div>

  <div class="grid g2" style="margin-top:14px">
    ${card('DCF · supuestos', `<form id="dcfF" class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <label class="f"><span>FCF base (${esc(m.repCur === cur ? cur : cur + ', convertido')}) ${origin(d.fcfBase.origin)}</span><input class="in" id="fcf0" type="number" value="${isNum(I.fcf0) ? Math.round(I.fcf0) : ''}"><span class="note">TTM: ${big(d.fcfBase.value)} · media 3a: ${big(d.fcfBase.alt)} <a href="#" id="useAvg">usar media</a></span></label>
      ${inp('growth', 'Crecimiento anual años 1-5', P(I.growth, 1), d.growth.origin)}
      <label class="f"><span>Horizonte de proyección ${origin('supuesto')}</span><select class="in" id="years"><option value="5" ${I.years === 5 ? 'selected' : ''}>5 años</option><option value="10" ${I.years === 10 ? 'selected' : ''}>10 años (años 6-10 convergen al terminal)</option></select></label>
      ${inp('tg', 'Crecimiento terminal', P(I.terminalGrowth, 1), d.terminalGrowth.origin)}
      ${inp('rf', 'Tasa libre de riesgo', P(I.rf), d.rf.origin, '0.01')}
      ${inp('beta', 'Beta', isNum(I.beta) ? I.beta.toFixed(2) : '', d.beta.origin, '0.01', '')}
      ${inp('erp', 'Prima de riesgo del mercado', P(I.erp), d.erp.origin, '0.01')}
      ${inp('kd', 'Coste de la deuda (antes de impuestos)', P(I.costDebt), d.costDebt.origin, '0.01')}
      ${inp('wo', 'WACC manual (vacío = calculado)', isNum(I.waccOverride) ? P(I.waccOverride) : '', 'supuesto', '0.01')}
      <div class="f" style="align-self:end"><div class="row"><button class="btn pri" type="submit">Recalcular</button><button class="btn" type="button" id="reset">Restaurar</button></div></div>
    </form>
    ${d.growth.parts && d.growth.parts.length ? `<p class="note">Crecimiento sugerido = mediana de: ${d.growth.parts.map(([k, v]) => `${esc(k)} ${pct(v)}`).join(' · ')}, acotada a 0-20 %.</p>` : ''}
    <div class="kpis" style="margin-top:10px;grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span>Coste del capital propio (CAPM)</span><b>${pct(ke, 2)}</b><small>rf + β × prima</small></div>
      <div class="kpi"><span>Peso capital / deuda</span><b>${pct(E / (E + D || 1), 0)} / ${pct(D / (E + D || 1), 0)}</b><small>a valor de mercado</small></div>
      <div class="kpi"><span>WACC aplicado</span><b>${pct(w, 2)}</b><small>${isNum(I.waccOverride) ? 'manual' : 'calculado'}</small></div></div>`)}
    ${card('DCF · resultado', R && R.error ? `<div class="empty">${esc(R.error)}</div>` : `<div class="tablewrap"><table class="dense" id="dcfT"><thead><tr><th class="l">Año</th><th>Crecimiento</th><th>FCF proyectado</th><th>Factor desc.</th><th>Valor presente</th></tr></thead><tbody>
      ${R.rows.map((r) => `<tr><td class="l">${new Date().getFullYear() + r.t}</td><td>${pct(r.g)}</td><td>${big(r.fcf)}</td><td>${num(r.df, 3)}</td><td>${big(r.pv)}</td></tr>`).join('')}</tbody></table></div>
      <div class="kpis" style="margin-top:10px;grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><span>Suma VP de los FCF</span><b>${big(R.pvSum, cur)}</b></div><div class="kpi"><span>Valor terminal (VP)</span><b>${big(R.pvTv, cur)}</b><small>${pct(R.tvShare, 0)} del total</small></div>
        <div class="kpi"><span>Valor de empresa (EV)</span><b>${big(R.ev, cur)}</b></div><div class="kpi"><span>− Deuda neta</span><b>${big(I.netDebt, cur)}</b></div>
        <div class="kpi"><span>Valor del capital</span><b>${big(R.equity, cur)}</b></div><div class="kpi"><span>Valor intrínseco por acción</span><b class="${cls(R.up)}">${num(R.perShare)} ${esc(cur)}</b><small>${sgnPct(R.up, 0)} vs precio · margen ${pct(R.mos, 0)}</small></div></div>
      ${R.tvShare > 0.8 ? '<p class="note warn">Más del 80 % del valor depende del valor terminal: el resultado es muy sensible a los supuestos de largo plazo.</p>' : ''}`)}
  </div>

  ${R && !R.error ? `<div class="grid g2" style="margin-top:14px">
    ${card('Sensibilidad del valor por acción', `<div class="tablewrap"><table class="sens"><thead><tr><th class="l">WACC \\ g terminal</th>${R.sens.gs.map((g) => `<th>${pct(g)}</th>`).join('')}</tr></thead><tbody>${R.sens.grid.map((row, i) => `<tr><th class="l">${pct(R.sens.ws[i], 2)}</th>${row.map((v, j) => `<td class="${i === 2 && j === 2 ? 'c ' : ''}${isNum(v) && v >= m.price ? 'pos' : 'neg'}">${num(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="note">Verde: por encima del precio actual. Celda marcada: caso base.</p>`)}
    ${card('Escenarios', `<div class="tablewrap"><table><thead><tr><th class="l">Escenario</th><th>Crec. 1-5</th><th>WACC</th><th>g terminal</th><th>Valor/acción</th><th>vs precio</th></tr></thead><tbody>${R.scen.map((s) => `<tr><td class="l"><b>${s.label}</b></td><td>${pct(s.growth)}</td><td>${pct(s.discount, 2)}</td><td>${pct(s.terminalGrowth)}</td><td><b>${s.result && !s.result.error ? num(s.result.perShare) : '—'}</b></td><td class="${cls(s.result && s.result.perShare - m.price)}">${s.result && !s.result.error ? sgnPct(s.result.perShare / m.price - 1, 0) : '—'}</td></tr>`).join('')}</tbody></table></div><p class="note">Pesimista: mitad de crecimiento, WACC +1 p.p., terminal −0,5 p.p. Optimista: crecimiento ×1,5, WACC −1 p.p., terminal +0,5 p.p.</p>`)}
  </div>` : ''}

  <div class="grid g2" style="margin-top:14px">
    ${card('Valoración por múltiplos', `<div class="tablewrap"><table><thead><tr><th class="l">Método</th><th>Múltiplo</th><th>Precio implícito</th><th>vs precio</th><th class="l">Origen</th></tr></thead><tbody>${val.mult.map((r) => `<tr><td class="l">${esc(r.method)}</td><td>${isNum(r.multiple) ? num(r.multiple, 1) + '×' : '—'}</td><td><b>${num(r.value)}</b></td><td class="${cls(r.up)}">${sgnPct(r.up, 0)}</td><td class="l">${origin(r.origin)}</td></tr>`).join('')}</tbody></table></div><p class="note">Múltiplo medio × métrica TTM. Para EV se resta la deuda neta y se divide entre las acciones. Se excluyen múltiplos negativos o superiores a 500.</p>`)}
    ${card('Descuento de dividendos (DDM, Gordon)', !S.raw.dividends.ok ? '<div class="empty">Tus fuentes no ofrecen el historial de dividendos de esta empresa, así que el DDM no se puede calcular.</div>' : !val.ddm.reason || val.ddm.applicable ? `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Dividendo últimos 12 meses</span><b>${num(m.dpsTTM)} ${esc(cur)}</b></div><div class="kpi"><span>CAGR dividendo 5a</span><b>${pct(val.ddm.g5)}</b></div>
      <div class="kpi"><span>Crecimiento aplicado</span><b>${pct(val.ddm.growth)}</b><small>min(CAGR 5a; ke − 1 p.p.; 8 %)</small></div><div class="kpi"><span>Coste del capital (ke)</span><b>${pct(val.ddm.ke, 2)}</b></div>
      <div class="kpi"><span>Valor DDM</span><b>${num(val.ddm.value)} ${esc(cur)}</b></div><div class="kpi"><span>vs precio</span><b class="${cls(val.ddm.up)}">${sgnPct(val.ddm.up, 0)}</b></div></div>${val.ddm.error ? `<p class="note">${esc(val.ddm.error)}</p>` : ''}` : `<div class="empty">${esc(val.ddm.reason)}</div>`)}
  </div>
  <p class="note noprint" style="margin-top:12px"><button class="btn sm" id="vx">Exportar valoración a Excel</button> Los supuestos que cambies se guardan para esta empresa en tu navegador.</p>`;

  const f = el.querySelector('#dcfF');
  const num_ = (id) => { const v = el.querySelector('#' + id).value; return v === '' ? null : Number(v); };
  f.onsubmit = (e) => {
    e.preventDefault();
    const a = { fcf0: num_('fcf0'), growth: num_('growth') / 100, years: Number(el.querySelector('#years').value), terminalGrowth: num_('tg') / 100, rf: num_('rf') / 100, beta: num_('beta'), erp: num_('erp') / 100, costDebt: isNum(num_('kd')) ? num_('kd') / 100 : null, waccOverride: isNum(num_('wo')) ? num_('wo') / 100 : null };
    store.setAssumptions(m.symbol, a); ctx.recompute(); render(el, S, ctx); toast('Valoración recalculada');
  };
  el.querySelector('#years').onchange = () => f.requestSubmit();
  el.querySelector('#reset').onclick = () => { store.setAssumptions(m.symbol, null); ctx.recompute(); render(el, S, ctx); };
  el.querySelector('#useAvg').onclick = (e) => { e.preventDefault(); if (isNum(d.fcfBase.alt)) { el.querySelector('#fcf0').value = Math.round(d.fcfBase.alt); f.requestSubmit(); } };
  el.querySelector('#vx').onclick = () => exportXLSX(`${m.symbol}_valoracion`, {
    Resumen: [['Concepto', 'Valor'], ['Precio', m.price], ['Valor intrínseco central', comp.value], ['Margen de seguridad', comp.mos], ...methods.map((x) => [x.n, x.v])],
    DCF: R && !R.error ? [['Supuesto', 'Valor'], ['FCF base', I.fcf0], ['Crecimiento 1-5', I.growth], ['Años', I.years], ['g terminal', I.terminalGrowth], ['WACC', I.wacc], ['Deuda neta', I.netDebt], ['Acciones', I.shares], [], ['Año', 'Crecimiento', 'FCF', 'Factor', 'VP'], ...R.rows.map((r) => [r.t, r.g, r.fcf, r.df, r.pv]), [], ['VP terminal', R.pvTv], ['EV', R.ev], ['Capital', R.equity], ['Por acción', R.perShare]] : [['Sin DCF']],
    Sensibilidad: R && !R.error ? [['WACC \\ g', ...R.sens.gs], ...R.sens.grid.map((row, i) => [R.sens.ws[i], ...row])] : [['—']],
  });
}
