// Informe final: 13 preguntas, conclusión razonada, argumentos a favor y en contra, exportación a PDF.
import { esc, card, num, pct, sgnPct, cls, datetime, scoreColor, toast } from '../../ui/dom.js?v=c2b29189';
import { store } from '../../store.js?v=c2b29189';
import { gauge } from './overview.js?v=c2b29189';
import { printReport } from '../../export.js?v=c2b29189';

export function render(el, S) {
  const { m, rep, sc, val } = S, c = val.composite;
  const prev = store.analyses(m.symbol).slice(0, 5);
  el.innerHTML = `<div class="row between noprint" style="margin-bottom:12px"><span class="note">Informe generado ${datetime(Date.now())} con datos de ${esc([...new Set(Object.values(m.prov).filter((p) => p.source).map((p) => p.source))].join(', '))}.</span><div class="row"><button class="btn" id="pdf">Exportar a PDF</button><button class="btn pri" id="sv">Guardar en el historial</button></div></div>
  <div class="grid g3">
    ${card('Conclusión', `<div class="gauge">${gauge(rep.total)}<div class="verdict" style="color:${scoreColor(rep.total)}">${esc(rep.conclusion)}</div></div>
      <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:10px"><div class="kpi"><span>Precio</span><b>${num(m.price)} ${esc(m.tradeCur)}</b></div><div class="kpi"><span>Valor intrínseco</span><b>${num(c.value)}</b></div><div class="kpi"><span>Margen de seguridad</span><b class="${cls(c.mos)}">${pct(c.mos, 0)}</b></div><div class="kpi"><span>Calidad (media)</span><b>${rep.quality != null ? Math.round(rep.quality) : '—'}/100</b></div></div>`)}
    ${card('Argumentos a favor', rep.pros.length ? `<ul style="margin:0;padding-left:18px">${rep.pros.map((p) => `<li style="margin:5px 0">${esc(p)}</li>`).join('')}${isNum(c.mos) && c.mos > 0.15 ? `<li>Cotiza un ${pct(c.mos, 0)} por debajo de su valor estimado.</li>` : ''}</ul>` : '<p class="note">Ninguna categoría destaca por encima de 70/100.</p>')}
    ${card('Argumentos en contra', rep.cons.length ? `<ul style="margin:0;padding-left:18px">${rep.cons.map((p) => `<li style="margin:5px 0">${esc(p)}</li>`).join('')}${isNum(c.mos) && c.mos < 0 ? `<li>El precio supera en un ${pct(-c.up, 0)} el valor estimado.</li>` : ''}</ul>` : '<p class="note">Ninguna categoría por debajo de 45/100 ni alertas graves.</p>')}
  </div>
  <div style="margin-top:14px">${card(`¿Merece la pena comprar ${esc(m.profile.companyName || m.symbol)}?`, rep.questions.map((q, i) => `<div class="qa"><h4><span>${i + 1}. ${esc(q.question)}</span>${q.verdict ? `<span style="color:${scoreColor(q.score)}">${esc(q.verdict)}</span>` : ''}</h4><p>${q.text}</p></div>`).join(''))}</div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Puntuación por categoría', sc.cats.map((x) => `<div class="row between" style="padding:4px 0"><span>${esc(x.label)}</span><span style="display:flex;gap:10px;align-items:center;min-width:50%"><span class="bar" style="flex:1"><i style="width:${x.score ?? 0}%;background:${scoreColor(x.score)}"></i></span><b style="width:30px;text-align:right">${x.score ?? '—'}</b></span></div>`).join(''))}
    ${card('Análisis anteriores guardados', prev.length ? `<table class="dense"><thead><tr><th class="l">Fecha</th><th>Precio</th><th>Valor</th><th>Puntuación</th><th class="l">Conclusión</th></tr></thead><tbody>${prev.map((a) => `<tr><td class="l">${datetime(a.at)}</td><td>${num(a.price)}</td><td>${num(a.intrinsic)}</td><td>${a.score ?? '—'}</td><td class="l">${esc(a.conclusion)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Aún no has guardado análisis de esta empresa.</p>')}
  </div>
  <p class="note" style="margin-top:14px"><b>Aviso:</b> esta conclusión es el resultado de reglas cuantitativas aplicadas a datos de terceros y a tus supuestos. No es una recomendación de inversión ni garantiza resultados. Contrasta siempre con los informes oficiales de la compañía.</p>`;
  el.querySelector('#pdf').onclick = printReport;
  el.querySelector('#sv').onclick = () => { store.saveAnalysis({ symbol: m.symbol, name: m.profile.companyName, at: Date.now(), price: m.price, currency: m.tradeCur, score: sc.total, intrinsic: c.value, mos: c.mos, conclusion: rep.conclusion, dcf: val.dcf && val.dcf.perShare, inputs: val.inputs }); toast('Análisis guardado'); render(el, S); };
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export { sgnPct };
