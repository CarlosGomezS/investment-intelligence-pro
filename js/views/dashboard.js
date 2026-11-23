// Panel principal: mercados, alertas activadas, seguimiento, próximos resultados y accesos rápidos.
import { data } from '../providers/index.js?v=05f60eff';
import { store } from '../store.js?v=05f60eff';
import { esc, card, num, sgnPct, cls, date, pct } from '../ui/dom.js?v=05f60eff';
import { logoHTML } from '../app.js?v=05f60eff';
import { checkAlerts } from './watchlist.js?v=05f60eff';

const MARKETS = [['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['^STOXX50E', 'Euro Stoxx 50'], ['^IBEX', 'IBEX 35']];
const IDEAS = [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['V', 'Visa'], ['KO', 'Coca-Cola'], ['JNJ', 'Johnson & Johnson'], ['ASML', 'ASML'], ['NVO', 'Novo Nordisk'], ['SAN.MC', 'Banco Santander'], ['ITX.MC', 'Inditex']];

export async function render(view) {
  const S = store.get(), fav = Object.values(S.lists).flat();
  const uniq = [...new Map(fav.map((x) => [x.symbol, x])).values()];
  view.innerHTML = `<section class="hero" style="margin-bottom:14px"><h1>Analiza cualquier empresa cotizada a fondo</h1><p>Estados financieros completos, 24 ratios con su historia, valoración intrínseca por DCF, múltiplos y dividendos, competidores, alertas contables y un informe final razonado. Cada cifra muestra su fuente y su fecha.</p><p style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn pri sm" href="#/metodos">Métodos Buffett, Graham, Lynch…</a><a class="btn sm" href="#/calendario">Calendario de resultados</a><a class="btn sm" href="#/comprobar">Autocomprobación con datos reales</a></p>
      <div class="chips" style="margin-top:12px">${IDEAS.map(([s, n]) => `<a class="chip" href="#/c/${encodeURIComponent(s)}/resumen">${esc(n)} <span class="mono mute">${esc(s)}</span></a>`).join('')}</div></section>
    <div class="kpis" id="mk" style="margin-bottom:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${MARKETS.map(([s, n]) => `<div class="kpi"><span>${n}</span><b id="mk_${s.replace(/\W/g, '')}">…</b></div>`).join('')}</div>
    <div id="alerts"></div>
    <div class="grid g2">
      ${card('Tu seguimiento', uniq.length ? uniq.slice(0, 12).map((i) => `<div class="wl-item" data-s="${esc(i.symbol)}">${logoHTML(i.symbol)}<a href="#/c/${encodeURIComponent(i.symbol)}/resumen"><b>${esc(i.symbol)}</b> <span class="mute">${esc(i.name || '')}</span></a><span class="q mono">…</span><span></span></div>`).join('') : '<p class="note">Aún no sigues ninguna empresa. Búscala arriba y pulsa «Seguir».</p>', { actions: '<a class="btn sm" href="#/watchlist">Gestionar</a>' })}
      ${card('Próximos resultados de tu seguimiento', '<div id="cal"><p class="note">…</p></div>', { actions: '<a class="btn sm" href="#/calendario">Calendario</a>' })}
      ${card('Consultadas recientemente', S.history.length ? S.history.slice(0, 8).map((h) => `<div class="wl-item">${logoHTML(h.symbol)}<a href="#/c/${encodeURIComponent(h.symbol)}/resumen"><b>${esc(h.symbol)}</b> <span class="mute">${esc(h.name || '')}</span></a><span></span><span></span></div>`).join('') : '<p class="note">Sin historial.</p>')}
      ${card('Últimos análisis guardados', store.analyses().length ? store.analyses().slice(0, 8).map((a) => `<div class="wl-item">${logoHTML(a.symbol)}<a href="#/c/${encodeURIComponent(a.symbol)}/informe"><b>${esc(a.symbol)}</b> <span class="mute">${esc(a.conclusion)}</span></a><span class="${cls(a.mos)}">${pct(a.mos, 0)}</span><b>${a.score ?? '—'}</b></div>`).join('') : '<p class="note">Guarda un análisis desde la ficha de una empresa.</p>')}
    </div>`;
  for (const [s] of MARKETS) data.index(s, new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10)).then((r) => { const d = r.data; if (d.length < 2) throw 0; const a = d[d.length - 1].close, b = d[d.length - 2].close; view.querySelector('#mk_' + s.replace(/\W/g, '')).innerHTML = `${num(a, 0)} <small class="${cls(a - b)}">${sgnPct(a / b - 1, 2)}</small>`; }).catch(() => { const e = view.querySelector('#mk_' + s.replace(/\W/g, '')); if (e) e.innerHTML = '<small class="mute">no disponible en tu plan</small>'; });
  view.querySelectorAll('.wl-item[data-s]').forEach(async (row) => { try { const q = (await data.quote(row.dataset.s)).data; row.querySelector('.q').innerHTML = `${num(q.price)} <span class="${cls(q.changePercentage)}">${sgnPct(q.changePercentage / 100)}</span>`; } catch { row.querySelector('.q').textContent = '—'; } });
  if (uniq.length) {
    try {
      const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
      const r = await data.earningsCalendar(from, to); const set = new Set(uniq.map((x) => x.symbol));
      const ev = (r.data || []).filter((e) => set.has(e.symbol)).sort((a, b) => a.date.localeCompare(b.date));
      view.querySelector('#cal').innerHTML = ev.length ? ev.map((e) => `<div class="wl-item">${logoHTML(e.symbol)}<a href="#/c/${encodeURIComponent(e.symbol)}/noticias"><b>${esc(e.symbol)}</b></a><span>${date(e.date)}</span><span class="note">BPA est. ${num(e.epsEstimated)}</span></div>`).join('') : '<p class="note">Ninguna de tus empresas presenta resultados en los próximos 45 días.</p>';
    } catch (e) { view.querySelector('#cal').innerHTML = `<p class="note">Calendario no disponible: ${esc(e.message)}</p>`; }
  } else view.querySelector('#cal').innerHTML = '<p class="note">Sigue empresas para ver aquí sus fechas de resultados.</p>';
  const al = (await checkAlerts()).filter((x) => (x.hits && x.hits.length) || x.stale); // también las que hay que revisar
  if (al.length) view.querySelector('#alerts').innerHTML = card('Alertas activadas', al.map((x) => `<div class="wl-item">${logoHTML(x.sym)}<a href="#/c/${encodeURIComponent(x.sym)}/valoracion"><b>${esc(x.sym)}</b> <span class="mute">${esc(x.name || '')}</span></a>${x.hits.length ? `<span class="pill alta">${esc(x.hits.join(' · '))}</span>` : `<span class="pill media">Revisar: ${esc(x.stale)}</span>`}<span></span></div>`).join('')) + '<div style="height:14px"></div>';
}
