// Seguimiento: listas (favoritos y personalizadas), alertas de valoración, historial y análisis guardados.
import { data } from '../providers/index.js?v=f598cc18';
import { store } from '../store.js?v=f598cc18';
import { esc, card, num, pct, sgnPct, cls, datetime, toast } from '../ui/dom.js?v=f598cc18';
import { logoHTML } from '../app.js?v=f598cc18';
import { exportCSV } from '../export.js?v=f598cc18';
import { isNum } from '../calc/finance.js?v=f598cc18';

export async function checkAlerts() {
  const A = store.alerts(), out = [];
  await Promise.all(Object.entries(A).map(async ([sym, a]) => {
    try {
      const q = (await data.quote(sym)).data; if (!q) return;
      const p = q.price, hits = [];
      if (isNum(a.below) && p <= a.below) hits.push(`precio ${num(p)} ≤ ${num(a.below)}`);
      if (isNum(a.above) && p >= a.above) hits.push(`precio ${num(p)} ≥ ${num(a.above)}`);
      if (isNum(a.mos) && isNum(a.intrinsic) && (a.intrinsic - p) / a.intrinsic >= a.mos) hits.push(`margen de seguridad ${pct((a.intrinsic - p) / a.intrinsic, 0)} ≥ ${pct(a.mos, 0)}`);
      if (isNum(a.pe) && isNum(q.pe) && q.pe > 0 && q.pe <= a.pe) hits.push(`PER ${num(q.pe, 1)} ≤ ${num(a.pe, 1)}`);
      out.push({ sym, name: a.name, price: p, hits, a });
    } catch { out.push({ sym, name: a.name, error: true, a }); }
  }));
  return out;
}

export async function render(view) {
  const lists = store.lists();
  view.innerHTML = `<div class="row between" style="margin-bottom:14px"><h1 style="font-size:22px">Seguimiento</h1><div class="row"><input class="in" id="nl" placeholder="Nueva lista…" style="width:180px"><button class="btn" id="nlb">Crear lista</button></div></div>
    <div id="al"></div>
    <div class="grid g2" id="ls">${Object.entries(lists).map(([n, items]) => card(`${esc(n)} <span class="mute">(${items.length})</span>`, items.length ? items.map((i) => `<div class="wl-item" data-s="${esc(i.symbol)}">${logoHTML(i.symbol)}<a href="#/c/${encodeURIComponent(i.symbol)}/resumen"><b>${esc(i.symbol)}</b> <span class="mute">${esc(i.name || '')}</span></a><span class="q mono">…</span><button class="btn sm" data-rm="${esc(n)}|${esc(i.symbol)}" aria-label="Quitar">✕</button></div>`).join('') : '<p class="note">Vacía. Añade empresas desde su ficha.</p>', { actions: `<div class="row">${items.length > 1 ? `<a class="btn sm" href="#/comparar?s=${items.slice(0, 5).map((i) => encodeURIComponent(i.symbol)).join(',')}">Comparar</a>` : ''}${n !== 'Favoritos' ? `<button class="btn sm" data-dl="${esc(n)}">Borrar lista</button>` : ''}</div>` })).join('')}</div>
    <div class="grid g2" style="margin-top:14px">
      ${card('Historial de empresas consultadas', store.get().history.length ? store.get().history.map((h) => `<div class="wl-item">${logoHTML(h.symbol)}<a href="#/c/${encodeURIComponent(h.symbol)}/resumen"><b>${esc(h.symbol)}</b> <span class="mute">${esc(h.name || '')}</span></a><span class="note">${datetime(h.at)}</span><span></span></div>`).join('') : '<p class="note">Sin consultas todavía.</p>', { actions: '<button class="btn sm" id="ch">Borrar</button>' })}
      ${card('Historial de análisis guardados', store.analyses().length ? `<div class="tablewrap"><table class="dense" id="anT"><thead><tr><th class="l">Fecha</th><th class="l">Empresa</th><th>Precio</th><th>Valor intr.</th><th>Margen</th><th>Puntos</th><th class="l">Conclusión</th></tr></thead><tbody>${store.analyses().map((a) => `<tr><td class="l">${datetime(a.at)}</td><td class="l"><a href="#/c/${encodeURIComponent(a.symbol)}/informe">${esc(a.symbol)}</a></td><td>${num(a.price)}</td><td>${num(a.intrinsic)}</td><td class="${cls(a.mos)}">${pct(a.mos, 0)}</td><td>${a.score ?? '—'}</td><td class="l">${esc(a.conclusion)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Guarda análisis desde la ficha de una empresa para ver cómo cambian con el tiempo.</p>', { actions: '<button class="btn sm" id="anx">CSV</button>' })}
    </div>`;
  view.querySelectorAll('.wl-item[data-s]').forEach(async (row) => {
    try { const q = (await data.quote(row.dataset.s)).data; row.querySelector('.q').innerHTML = `${num(q.price)} <span class="${cls(q.changePercentage)}">${sgnPct(q.changePercentage / 100)}</span>`; } catch { row.querySelector('.q').textContent = '—'; }
  });
  view.onclick = (e) => {
    const rm = e.target.closest('[data-rm]'); if (rm) { const [l, s] = rm.dataset.rm.split('|'); store.toggle(l, { symbol: s }); render(view); return; }
    const dl = e.target.closest('[data-dl]'); if (dl) { store.deleteList(dl.dataset.dl); render(view); return; }
    if (e.target.id === 'nlb') { const n = view.querySelector('#nl').value.trim(); if (n) { store.createList(n); toast('Lista creada'); render(view); } }
    if (e.target.id === 'ch') { store.clearHistory(); render(view); }
    if (e.target.id === 'anx') exportCSV('analisis_guardados', [['Fecha', 'Símbolo', 'Precio', 'Valor intrínseco', 'Margen', 'Puntuación', 'Conclusión'], ...store.analyses().map((a) => [new Date(a.at).toISOString(), a.symbol, a.price, a.intrinsic ?? '', a.mos ?? '', a.score ?? '', a.conclusion])]);
  };
  const al = await checkAlerts();
  view.querySelector('#al').innerHTML = al.length ? card('Alertas de valoración', al.map((x) => `<div class="wl-item">${logoHTML(x.sym)}<a href="#/c/${encodeURIComponent(x.sym)}/riesgos"><b>${esc(x.sym)}</b> <span class="mute">${esc(x.name || '')}</span></a><span>${x.error ? '<span class="note">sin cotización</span>' : x.hits.length ? `<span class="pill alta">${esc(x.hits.join(' · '))}</span>` : '<span class="note">sin activar</span>'}</span><span class="mono">${num(x.price)}</span></div>`).join('')) + '<div style="height:14px"></div>' : '';
}
