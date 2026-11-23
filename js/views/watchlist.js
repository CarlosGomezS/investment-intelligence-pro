// Seguimiento: listas (favoritos y personalizadas), alertas de valoración, historial y análisis guardados.
import { data } from '../providers/index.js?v=1369edf7';
import { store } from '../store.js?v=1369edf7';
import { esc, card, num, pct, sgnPct, cls, datetime, toast } from '../ui/dom.js?v=1369edf7';
import { logoHTML } from '../app.js?v=1369edf7';
import { exportCSV } from '../export.js?v=1369edf7';
import { isNum } from '../calc/finance.js?v=1369edf7';

export async function checkAlerts() {
  const A = store.alerts(), out = [];
  await Promise.all(Object.entries(A).map(async ([sym, a]) => {
    try {
      const q = (await data.quote(sym)).data; if (!q) return;
      const p = q.price, hits = [];
      // Si el precio se ha multiplicado o dividido por 2 o más desde que guardaste la alerta, probablemente hubo un split:
      // los niveles guardados ya no valen y no se dispara nada
      // Precio ×2 o ÷2 desde que guardaste la alerta: se comprueba si hubo un split DE VERDAD (lista del proveedor).
      // Solo si lo hubo se anulan los niveles guardados; si no, es un movimiento real y las alertas se evalúan.
      // (el PER no cambia con un split: una alerta solo de PER no hace falta revisarla)
      const onlyPe = isNum(a.pe) && !isNum(a.below) && !isNum(a.above) && !isNum(a.mos);
      if (!onlyPe && isNum(a.ref) && a.ref > 0 && (p / a.ref < 0.5 || p / a.ref > 2) && a.at) {
        let split = null, checked = false; try { const r = await data.splits(sym); split = (r.data || []).find((s) => Date.parse(s.date) > a.at); checked = !sym.includes('.') || (r.data || []).length > 0; /* lista vacía de una bolsa no estadounidense: FMP puede no cubrirla */ } catch {}
        if (split) { out.push({ sym, name: a.name, price: p, hits: [], stale: `hubo un split (${split.numerator}:${split.denominator}, ${split.date}) después de guardar la alerta: sus niveles ya no valen, vuelve a guardarla`, a }); return; }
        // No se pudo comprobar (fuente sin cobertura o sin cuota): no se dispara nada a ciegas
        if (!checked) { out.push({ sym, name: a.name, price: p, hits: [], stale: 'el precio ha cambiado más de la mitad desde que guardaste la alerta y no se ha podido comprobar si hubo un split: revísala en la ficha', a }); return; }
      }
      if (isNum(a.below) && p <= a.below) hits.push(`precio ${num(p)} ≤ ${num(a.below)}`);
      if (isNum(a.above) && p >= a.above) hits.push(`precio ${num(p)} ≥ ${num(a.above)}`);
      // Margen de seguridad frente al valor calculado al guardar la alerta (se indica su fecha; si tiene más de 90 días, no salta)
      const age = a.at ? (Date.now() - a.at) / 864e5 : Infinity; // sin fecha = antigua
      let stale = null;
      if (isNum(a.mos) && isNum(a.intrinsic) && a.intrinsic > 0 && age <= 90 && (a.intrinsic - p) / a.intrinsic >= a.mos) hits.push(`margen de seguridad ${pct((a.intrinsic - p) / a.intrinsic, 0)} ≥ ${pct(a.mos, 0)} (valor calculado el ${new Date(a.at).toLocaleDateString('es-ES')})`);
      if (isNum(a.mos) && isNum(a.intrinsic) && age > 90) stale = 'el valor intrínseco guardado es antiguo: abre la ficha y vuelve a guardar la alerta';
      // PER: la cotización de Finnhub/Twelve Data no lo trae; se toma de los ratios actuales
      let pe = q.pe;
      if (isNum(a.pe) && !isNum(pe)) { try { const rt = (await data.ratiosTTM(sym)).data || {}; pe = rt.priceToEarningsRatioTTM; } catch {} }
      if (isNum(a.pe) && isNum(pe) && pe > 0 && pe <= a.pe) hits.push(`PER ${num(pe, 1)} ≤ ${num(a.pe, 1)}`);
      out.push({ sym, name: a.name, price: p, hits, stale, a });
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
  view.querySelector('#al').innerHTML = al.length ? card('Alertas de valoración', al.map((x) => `<div class="wl-item">${logoHTML(x.sym)}<a href="#/c/${encodeURIComponent(x.sym)}/riesgos"><b>${esc(x.sym)}</b> <span class="mute">${esc(x.name || '')}</span></a><span>${x.error ? '<span class="note">sin cotización</span>' : x.hits.length ? `<span class="pill alta">${esc(x.hits.join(' · '))}</span>` : '<span class="note">sin activar</span>'}${x.stale ? `<br><small class="warn">${esc(x.stale)}</small>` : ''}</span><span class="mono">${num(x.price)}</span></div>`).join('')) + '<div style="height:14px"></div>' : '';
}
