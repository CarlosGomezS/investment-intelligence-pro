// Scoring 0-100: puntuación por categoría y métrica, fórmulas, umbrales, datos faltantes y ponderaciones configurables.
import { esc, card, scoreColor, toast } from '../../ui/dom.js?v=7feadaa0';
import { DEFAULT_WEIGHTS, CATEGORY_LABELS } from '../../calc/scoring.js?v=7feadaa0';
import { store } from '../../store.js?v=7feadaa0';
import { gauge } from './overview.js?v=7feadaa0';

export function render(el, S, ctx) {
  const { sc } = S, W = { ...(store.weights() || DEFAULT_WEIGHTS) };
  const wsum = Object.values(W).reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="grid g3">
    ${card('Puntuación total', `<div class="gauge">${gauge(sc.total)}<p class="note">Media ponderada de ${sc.cats.filter((c) => c.score != null).length} categorías con datos. Cobertura: ${Math.round(sc.coverage * 100)} % de las métricas.</p></div>`)}
    <div class="span2">${card('Ponderaciones (aplican a todas las empresas)', `<form id="wF">${Object.keys(CATEGORY_LABELS).map((k) => `<div class="slider"><label for="w_${k}">${CATEGORY_LABELS[k]}</label><input type="range" id="w_${k}" min="0" max="40" value="${W[k]}"><b id="v_${k}">${W[k]}</b></div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn pri">Aplicar</button><button type="button" class="btn" id="wR">Valores por defecto</button><span class="note" id="wS">Suma: ${wsum} (se normaliza; no hace falta que sume 100)</span></div></form>`)}</div>
  </div>
  <div class="grid g3" style="margin-top:14px">${sc.cats.map((c) => card(`${esc(c.label)} <span style="color:${scoreColor(c.score)};float:right">${c.score ?? '—'}</span>`, `<div class="bar" style="margin-bottom:10px"><i style="width:${c.score ?? 0}%;background:${scoreColor(c.score)}"></i></div>
      <table class="dense"><tbody>${c.metrics.map((x) => `<tr><td class="l">${esc(x.name)}<br><span class="note">${esc(x.formula)} · umbrales ${x.pts.map(([v, p]) => `${fmtPt(v)}→${p}`).join(', ')}</span></td><td>${esc(x.display)}</td><td style="color:${scoreColor(x.score)}"><b>${x.score ?? 's/d'}</b></td></tr>`).join('')}</tbody></table>
      <p class="note">Peso ${c.weight} · ${c.missing.length ? 'Sin dato: ' + c.missing.map(esc).join(', ') : 'todas las métricas disponibles'}</p>`)).join('')}</div>
  <div style="margin-top:14px">${card('Cómo se calcula y limitaciones', `<ul class="method" style="margin:0;padding-left:18px">
    <li>Cada métrica se puntúa de 0 a 100 por interpolación lineal entre los umbrales indicados (por debajo del primero: su puntuación; por encima del último: la del último).</li>
    <li>La puntuación de una categoría es la media simple de sus métricas con dato. Si una métrica falta, no cuenta como cero: se excluye y se muestra arriba.</li>
    <li>El total es la media ponderada de las categorías con dato; las categorías sin ningún dato se excluyen y el resto se repondera.</li>
    <li>Los umbrales son genéricos para empresas no financieras. En bancos, aseguradoras, REIT o utilities algunas métricas (deuda, margen bruto, FCF) no son comparables.</li>
    <li>«Ventajas competitivas» usa indicadores cuantitativos (exceso de ROIC sobre WACC y estabilidad de márgenes) más tu evaluación cualitativa del módulo Moat si la completas.</li>
    <li>La valoración usa el margen de seguridad del valor intrínseco central, que depende de tus supuestos del DCF.</li></ul>`)}</div>`;
  const F = el.querySelector('#wF');
  F.oninput = (e) => { if (e.target.type === 'range') { el.querySelector('#v_' + e.target.id.slice(2)).textContent = e.target.value; } };
  F.onsubmit = (e) => { e.preventDefault(); const nw = Object.fromEntries(Object.keys(CATEGORY_LABELS).map((k) => [k, +el.querySelector('#w_' + k).value])); store.setWeights(nw); ctx.recompute(); render(el, S, ctx); toast('Ponderaciones aplicadas'); };
  el.querySelector('#wR').onclick = () => { store.setWeights(null); ctx.recompute(); render(el, S, ctx); };
}
const fmtPt = (v) => (Math.abs(v) < 1.5 && v !== 0 && !Number.isInteger(v) ? (v * 100).toFixed(0) + '%' : String(v));
