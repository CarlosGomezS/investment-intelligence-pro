// Calendario de resultados y de dividendos, filtrable por tu seguimiento.
import { data } from '../providers/index.js?v=a0623ec2';
import { store } from '../store.js?v=a0623ec2';
import { esc, card, num, big, date, unavailable, source } from '../ui/dom.js?v=a0623ec2';
import { logoHTML } from '../app.js?v=a0623ec2';

const st = { kind: 'earnings', days: 14, mine: true, q: '' };

export async function render(view) {
  view.innerHTML = `<div class="row between" style="margin-bottom:14px"><h1 style="font-size:22px">Calendario</h1>
    <div class="row"><div class="seg" id="k"><button data-k="earnings">Resultados</button><button data-k="dividends">Dividendos</button></div>
    <div class="seg" id="d"><button data-d="7">7 días</button><button data-d="14">14 días</button><button data-d="30">30 días</button></div>
    <label class="note"><input type="checkbox" id="mine" ${st.mine ? 'checked' : ''}> Solo mi seguimiento</label><input class="in" id="f" placeholder="Filtrar ticker…" style="width:140px" value="${esc(st.q)}"></div></div><div id="cal"></div>`;
  view.querySelectorAll('#k button').forEach((b) => b.classList.toggle('on', b.dataset.k === st.kind));
  view.querySelectorAll('#d button').forEach((b) => b.classList.toggle('on', +b.dataset.d === st.days));
  view.querySelector('#k').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.kind = b.dataset.k; render(view); } };
  view.querySelector('#d').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.days = +b.dataset.d; render(view); } };
  view.querySelector('#mine').onchange = (e) => { st.mine = e.target.checked; render(view); };
  view.querySelector('#f').onchange = (e) => { st.q = e.target.value.trim().toUpperCase(); render(view); };
  const box = view.querySelector('#cal'); box.innerHTML = '<div class="skel"><div></div></div>';
  const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + st.days * 864e5).toISOString().slice(0, 10);
  const mine = new Set(Object.values(store.lists()).flat().map((x) => x.symbol));
  try {
    const r = st.kind === 'earnings' ? await data.earningsCalendar(from, to) : await data.dividendsCalendar(from, to);
    let ev = (r.data || []).filter((e) => (!st.mine || mine.has(e.symbol)) && (!st.q || e.symbol.includes(st.q)));
    if (!st.mine && !st.q) ev = ev.filter((e) => !String(e.symbol).includes('.') || /\.(MC|DE|PA|AS|L|MI|SW)$/.test(e.symbol));
    ev.sort((a, b) => a.date.localeCompare(b.date));
    const days = [...new Set(ev.map((e) => e.date))];
    if (st.mine && !mine.size) { box.innerHTML = '<div class="empty">No sigues ninguna empresa: desmarca «Solo mi seguimiento» o añade empresas.</div>'; return; }
    box.innerHTML = days.length ? days.slice(0, 40).map((d) => card(date(d), `<div class="tablewrap"><table class="dense"><tbody>${ev.filter((e) => e.date === d).slice(0, 80).map((e) => st.kind === 'earnings'
      ? `<tr><td class="l"><a href="#/c/${encodeURIComponent(e.symbol)}/resumen" style="display:flex;gap:8px;align-items:center">${logoHTML(e.symbol, 20)}<b>${esc(e.symbol)}</b></a></td><td>BPA est. ${num(e.epsEstimated)}</td><td>Ventas est. ${big(e.revenueEstimated)}</td><td>${e.epsActual != null ? 'BPA real ' + num(e.epsActual) : ''}</td></tr>`
      : `<tr><td class="l"><a href="#/c/${encodeURIComponent(e.symbol)}/dividendos" style="display:flex;gap:8px;align-items:center">${logoHTML(e.symbol, 20)}<b>${esc(e.symbol)}</b></a></td><td>Ex-dividendo</td><td>${num(e.dividend ?? e.adjDividend, 4)}</td><td>Pago ${date(e.paymentDate)}</td></tr>`).join('')}</tbody></table></div>`) + '<div style="height:10px"></div>').join('') + source(r) : '<div class="empty">Sin eventos en el periodo.</div>';
  } catch (e) { box.innerHTML = unavailable('Calendario', e); }
}
