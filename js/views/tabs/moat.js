// Ventajas competitivas (moat): indicadores cuantitativos que dejan huella en las cuentas
// + evaluación cualitativa del usuario (factores que ningún proveedor mide), guardada y usada en el scoring.
import { data } from '../../providers/index.js?v=0a5702cc';
import { fundamentals } from '../../ui/charts.js?v=0a5702cc';
import { esc, card, pct, big, num, unavailable, source, toast } from '../../ui/dom.js?v=0a5702cc';
import { isNum, div, mean, stdev, cagrN } from '../../calc/finance.js?v=0a5702cc';
import { store } from '../../store.js?v=0a5702cc';
import { extra } from '../company.js?v=0a5702cc';

const FACTORS = [
  ['precios', 'Poder de fijación de precios', 'Puede subir precios sin perder clientes (márgenes brutos altos y estables lo sugieren).'],
  ['cambio', 'Costes de cambio', 'Al cliente le cuesta tiempo, dinero o riesgo irse a un competidor.'],
  ['red', 'Efectos de red', 'El producto vale más cuantos más usuarios tiene.'],
  ['escala', 'Economías de escala', 'Su tamaño le da costes unitarios que los rivales no pueden igualar.'],
  ['tecnologia', 'Ventajas tecnológicas', 'Tecnología, procesos o know-how difíciles de copiar.'],
  ['patentes', 'Patentes y licencias', 'Protección legal o regulatoria de sus productos.'],
  ['marca', 'Marca', 'Los clientes pagan más o eligen por la marca.'],
  ['barreras', 'Barreras de entrada', 'Capital, regulación o red de distribución que frenan nuevos competidores.'],
  ['proveedores', 'Baja dependencia de proveedores', '2 = proveedores diversificados; 0 = depende de uno o pocos.'],
  ['clientes', 'Baja concentración de clientes', '2 = base atomizada; 0 = pocos clientes concentran las ventas.'],
];

function concentration(seg) {
  // FMP devuelve [{fiscalYear, data:{Segmento: importe}}] o [{fecha:{...}}]
  const last = Array.isArray(seg) && seg.length ? seg[0] : null; if (!last) return null;
  const obj = last.data || Object.values(last)[0];
  if (!obj || typeof obj !== 'object') return null;
  const e = Object.entries(obj).filter(([, v]) => isNum(v) && v > 0); const tot = e.reduce((a, [, v]) => a + v, 0);
  if (!tot) return null;
  const shares = e.map(([k, v]) => [k, v / tot]).sort((a, b) => b[1] - a[1]);
  return { year: last.fiscalYear || last.date || Object.keys(last)[0], top: shares[0], hhi: shares.reduce((a, [, s]) => a + s * s, 0), shares };
}

export async function render(el, S, ctx) {
  const m = S.m, Y = m.years, s = (f) => Y.map((y) => y[f]);
  const w = m.market.wacc ? m.market.wacc.wacc : null;
  const roic = s('roic'), gm = s('grossMargin'), om = s('operatingMargin');
  const roicAbove = roic.slice(-10).filter(isNum), above = roicAbove.filter((r) => isNum(w) && r > w).length;
  const rnd = mean(Y.slice(-3).map((y) => div(y.rnd, y.revenue)));
  const opLev = (() => { const r = cagrN(s('revenue'), 5), o = cagrN(s('operatingIncome'), 5); return isNum(r) && isNum(o) ? o - r : null; })();
  const [prodR, geoR] = await Promise.allSettled([extra(S, 'segP', () => data.productSegments(m.symbol)), extra(S, 'segG', () => data.geoSegments(m.symbol))]);
  const prod = prodR.status === 'fulfilled' ? concentration(prodR.value.data) : null, geo = geoR.status === 'fulfilled' ? concentration(geoR.value.data) : null;
  const Q = [
    ['Rentabilidad sostenida', isNum(w) ? `ROIC por encima del WACC (${pct(w)}) en ${above} de ${roicAbove.length} años; media 5a ${pct(m.stats.roicAvg5)}.` : 'Sin WACC.', isNum(w) && roicAbove.length ? above / roicAbove.length >= 0.8 : null],
    ['Poder de precios', `Margen bruto medio 5a ${pct(m.stats.gmAvg5)} con desviación de ${pct(stdev(gm.slice(-10)))} en 10 años.`, isNum(m.stats.gmAvg5) ? m.stats.gmAvg5 > 0.4 && (stdev(gm.slice(-10)) ?? 1) < 0.04 : null],
    ['Apalancamiento operativo / escala', `El beneficio operativo crece ${isNum(opLev) ? (opLev >= 0 ? pct(opLev) + ' más' : pct(-opLev) + ' menos') : '—'} al año que las ventas (5a). Ingresos de ${big(m.last.revenue, m.repCur)}.`, isNum(opLev) ? opLev > 0 : null],
    ['Intensidad tecnológica', `I+D equivale al ${pct(rnd)} de las ventas (media 3a).`, isNum(rnd) ? rnd > 0.05 : null],
    ['Estabilidad del margen operativo', `Desviación del margen operativo en 10 años: ${pct(stdev(om.slice(-10)))}.`, isNum(stdev(om.slice(-10))) ? stdev(om.slice(-10)) < 0.04 : null],
    ['Diversificación por producto', prod ? `Mayor segmento «${esc(prod.top[0])}» = ${pct(prod.top[1], 0)} de las ventas (${esc(String(prod.year))}).` : 'El proveedor no ofrece segmentación por producto con tu plan.', prod ? prod.top[1] < 0.6 : null],
    ['Diversificación geográfica', geo ? `Mayor región «${esc(geo.top[0])}» = ${pct(geo.top[1], 0)} de las ventas.` : 'Sin segmentación geográfica disponible.', geo ? geo.top[1] < 0.6 : null],
  ];
  const ok = Q.filter((q) => q[2] === true).length, n = Q.filter((q) => q[2] !== null).length;
  const user = store.moat(m.symbol), items = user.items || {};
  const uvals = Object.values(items).filter(isNum), uscore = uvals.length >= 4 ? (uvals.reduce((a, b) => a + b, 0) / (uvals.length * 2)) * 100 : null;
  const verdict = n ? (ok / n >= 0.7 ? 'Los datos son coherentes con una ventaja competitiva amplia y sostenida.' : ok / n >= 0.45 ? 'Ventaja competitiva estrecha o parcial: algunos indicadores la respaldan y otros no.' : 'Los datos no muestran una ventaja competitiva clara.') : 'Sin datos suficientes.';
  const threats = [];
  if (Q[0][2] === false) threats.push('Su rentabilidad no supera de forma estable el coste del capital: la competencia ya erosiona los márgenes.');
  if (Q[1][2] === false) threats.push('Margen bruto bajo o volátil: vulnerable a guerras de precios o a subidas de costes.');
  if (prod && prod.top[1] >= 0.6) threats.push(`Dependencia de «${prod.top[0]}»: un cambio tecnológico o regulatorio en ese producto afectaría a la mayoría de las ventas.`);
  if (geo && geo.top[1] >= 0.6) threats.push(`Concentración geográfica en «${geo.top[0]}»: expuesta a su ciclo económico, divisa y regulación.`);
  if (isNum(rnd) && rnd > 0.12) threats.push('Su ventaja depende de innovar: un error de producto o un salto tecnológico de un rival puede anularla.');
  if (items.clientes === 0) threats.push('Concentración de clientes: perder uno grande tendría un impacto material.');
  if (items.proveedores === 0) threats.push('Dependencia de proveedores clave: riesgo de suministro y de poder de negociación.');
  threats.push('Riesgos transversales: regulación antimonopolio, cambio en los hábitos de los clientes y entrada de competidores con más capital.');

  el.innerHTML = `<div class="grid g2">
    ${card('Lo que dicen los números', `<p style="margin-top:0"><b>${esc(verdict)}</b> <span class="note">${ok} de ${n} indicadores favorables.</span></p>${Q.map(([t, d, v]) => `<div class="alert-row"><span class="pill ${v === true ? 'baja' : v === false ? 'media' : ''}" style="${v === true ? 'color:var(--pos)' : ''}">${v === true ? 'Sí' : v === false ? 'No' : 's/d'}</span><div><b>${esc(t)}</b><p>${d}</p></div></div>`).join('')}${source(prodR.value, geoR.value)}`)}
    ${card('¿Qué podría destruir la ventaja?', `<ul style="margin:0;padding-left:18px">${threats.map((t) => `<li style="margin:6px 0">${esc(t)}</li>`).join('')}</ul>`)}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('ROIC frente al coste del capital', '<div class="chart"><canvas id="mo1"></canvas></div>')}
    ${prod ? card('Ventas por segmento de producto', `<div class="chart"><canvas id="mo2"></canvas></div>`) : card('Márgenes a largo plazo', '<div class="chart"><canvas id="mo2"></canvas></div>')}
  </div>
  <div style="margin-top:14px">${card('Tu evaluación cualitativa', `<p class="note" style="margin-top:0">Costes de cambio, efectos de red, patentes o concentración de clientes no aparecen en los estados financieros. Puntúa cada factor (0 = no, 1 = parcial, 2 = fuerte) tras leer el informe anual. Se guarda en tu navegador y, con al menos 4 factores, entra en el scoring como «Evaluación cualitativa del usuario».</p>
    <form id="moatF"><div class="tablewrap"><table><tbody>${FACTORS.map(([k, l, h]) => `<tr><td class="l"><b>${l}</b><br><span class="note">${h}</span></td><td><div class="seg" data-k="${k}">${[0, 1, 2].map((v) => `<button type="button" data-v="${v}" class="${items[k] === v ? 'on' : ''}">${v}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>
    <label class="f" style="margin-top:10px">Notas y fuentes<textarea class="in" id="moatN" placeholder="Ej.: el 10-K indica que su mayor cliente supone el 18 % de las ventas…">${esc(user.notes || '')}</textarea></label>
    <div class="row" style="margin-top:10px"><button class="btn pri">Guardar evaluación</button><span class="note">Puntuación cualitativa: <b>${uscore == null ? 'sin completar' : Math.round(uscore) + '/100'}</b></span></div></form>`)}</div>`;
  fundamentals('mo1', Y.map((y) => y.year), [{ label: 'ROIC', data: roic }, ...(isNum(w) ? [{ label: 'WACC actual', data: Y.map(() => w), type: 'line', dash: [5, 4] }] : [])], { fmt: 'pct' });
  if (prod) fundamentals('mo2', prod.shares.slice(0, 8).map(([k]) => k.slice(0, 18)), [{ label: 'Peso en ventas', data: prod.shares.slice(0, 8).map(([, v]) => v) }], { fmt: 'pct' });
  else fundamentals('mo2', Y.map((y) => y.year), [{ label: 'Margen bruto', data: gm, type: 'line' }, { label: 'Margen operativo', data: om, type: 'line' }], { fmt: 'pct' });
  const draft = { ...items };
  el.querySelectorAll('#moatF .seg').forEach((sg) => (sg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; draft[sg.dataset.k] = +b.dataset.v; sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }));
  el.querySelector('#moatF').onsubmit = (e) => { e.preventDefault(); store.setMoat(m.symbol, { items: draft, notes: el.querySelector('#moatN').value, at: Date.now() }); ctx.recompute(); toast('Evaluación guardada; el scoring se ha actualizado'); render(el, S, ctx); };
}
export { unavailable, num };
