// Alertas y riesgos: anomalías detectadas en las cuentas, riesgo de mercado y alertas de valoración del usuario.
import { esc, card, pct, num, toast } from '../../ui/dom.js?v=e06fb4a0';
import { isNum, maxDrawdown, volatility } from '../../calc/finance.js?v=e06fb4a0';
import { store } from '../../store.js?v=e06fb4a0';
import { solvency } from './debt.js?v=e06fb4a0';

export function render(el, S) {
  const { m, alerts } = S;
  const areas = [...new Set(alerts.map((a) => a.area))];
  const closes = (m.priceData || []).map((p) => p.close);
  const sv = solvency(m);
  const al = store.alerts()[m.symbol] || {};
  const cnt = (s) => alerts.filter((a) => a.sev === s).length;
  el.innerHTML = `<div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><span>Alertas graves</span><b class="neg">${cnt('alta')}</b></div><div class="kpi"><span>Alertas medias</span><b class="warn">${cnt('media')}</b></div><div class="kpi"><span>Avisos</span><b>${cnt('baja')}</b></div>
      <div class="kpi"><span>Puntuación de solvencia</span><b>${sv.score ?? '—'}/100</b></div><div class="kpi"><span>Volatilidad anual (1a)</span><b>${pct(volatility(closes.slice(-252)))}</b></div><div class="kpi"><span>Máx. caída (5a)</span><b class="neg">${pct(maxDrawdown(closes.slice(-1260)))}</b></div>
    </div>
    <div class="grid g2">
      <div>${card(`Anomalías detectadas (${alerts.length})`, alerts.length ? areas.map((ar) => `<h4 style="margin:12px 0 2px;font-size:12px;color:var(--mute)">${esc(ar)}</h4>` + alerts.filter((a) => a.area === ar).map((a) => `<div class="alert-row"><span class="pill ${a.sev}">${a.sev}</span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div></div>`).join('')).join('') : '<div class="empty">Sin anomalías en los estados del último ejercicio frente a los anteriores.</div>')}
      <p class="note">Reglas comprobadas: caída de ingresos (&gt;10 %), deterioro de márgenes (&gt;3 p.p. vs media 3a), FCF negativo o −25 %, deuda +30 % por encima de las ventas, dilución &gt;3 %/año o &gt;2 %/año en 5a, ROIC −5 p.p., inventarios y cuentas a cobrar creciendo 15 p.p. más que las ventas, caja operativa &lt;80 % del beneficio, fondo de comercio +25 %, cambio del tipo impositivo &gt;15 p.p., liquidez &lt;1 sin caja suficiente, cobertura de intereses &lt;2, deuda neta/EBITDA &gt;3,5 y pérdidas. <a href="#/metodologia">Metodología</a>.</p></div>
      ${card('Alerta de valoración para esta empresa', `<p class="note" style="margin-top:0">Se comprueba cada vez que abres el Panel o Seguimiento (la aplicación funciona en tu navegador, no envía notificaciones con la app cerrada).</p>
        <form id="alF" class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <label class="f">Avisar si el precio baja de (${esc(m.tradeCur)})<input class="in" id="alP" type="number" step="0.01" value="${al.below ?? ''}"></label>
          <label class="f">Avisar si sube por encima de<input class="in" id="alU" type="number" step="0.01" value="${al.above ?? ''}"></label>
          <label class="f">Avisar si el margen de seguridad supera (%)<input class="in" id="alM" type="number" step="1" value="${isNum(al.mos) ? al.mos * 100 : ''}"></label>
          <label class="f">Avisar si el PER baja de<input class="in" id="alE" type="number" step="0.1" value="${al.pe ?? ''}"></label>
          <div class="row"><button class="btn pri">Guardar alerta</button><button type="button" class="btn" id="alX">Eliminar</button></div></form>
        <p class="note">Ahora: precio ${num(m.price)} · margen de seguridad ${pct(S.val.composite.mos, 0)} · PER ${num(m.pe, 1)}. El margen de seguridad usa el último valor intrínseco calculado para esta empresa.</p>`)}
    </div>`;
  const v = (id) => { const x = el.querySelector('#' + id).value; return x === '' ? null : Number(x); };
  el.querySelector('#alF').onsubmit = (e) => { e.preventDefault(); store.setAlert(m.symbol, { below: v('alP'), above: v('alU'), mos: isNum(v('alM')) ? v('alM') / 100 : null, pe: v('alE'), intrinsic: S.val.composite.value, name: m.profile.companyName, at: Date.now() }); toast('Alerta guardada'); };
  el.querySelector('#alX').onclick = () => { store.setAlert(m.symbol, null); render(el, S); toast('Alerta eliminada'); };
}
