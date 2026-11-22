// Ajustes: claves de API (solo en este navegador), backend proxy opcional, límites, caché y copia de seguridad.
import { config } from '../config.js';
import { clearCache, usage } from '../providers/http.js';
import { fmp } from '../providers/fmp.js';
import { alphavantage } from '../providers/alphavantage.js';
import { store } from '../store.js';
import { esc, card, toast } from '../ui/dom.js';

export function render(view, _p, _q, firstRun) {
  const c = config.get(), u = usage();
  view.innerHTML = `${firstRun ? `<section class="hero" style="margin-bottom:14px"><h1>Configura tus fuentes de datos</h1><p>La aplicación consulta datos reales de proveedores financieros. Necesitas al menos una clave gratuita. Se guarda solo en este navegador y nunca se sube al repositorio.</p></section>` : '<h1 style="font-size:22px;margin-bottom:14px">Ajustes</h1>'}
  <div class="grid g2">
    ${card('Proveedores de datos', `<form id="kf" class="stack-y">
      <label class="f">Clave de Financial Modeling Prep (principal)<input class="in" id="fk" type="password" autocomplete="off" value="${esc(c.fmpKey)}" placeholder="Pega tu API key"></label>
      <p class="note" style="margin:4px 0 0">Gratis en <a href="https://site.financialmodelingprep.com/developer/docs/pricing" target="_blank" rel="noopener">financialmodelingprep.com</a> (250 peticiones/día; el plan gratuito cubre sobre todo empresas de EE. UU. y años recientes; trimestrales, noticias, intradía e institucionales suelen requerir plan de pago).</p>
      <label class="f">Clave de Alpha Vantage (respaldo)<input class="in" id="ak" type="password" autocomplete="off" value="${esc(c.avKey)}" placeholder="Opcional"></label>
      <p class="note" style="margin:4px 0 0">Gratis en <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener">alphavantage.co</a> (25 peticiones/día). Se usa automáticamente cuando FMP no tiene un dato: perfil, estados, cotización, dividendos, resultados y noticias.</p>
      <label class="f">URL del backend proxy (modo seguro, opcional)<input class="in" id="px" value="${esc(c.proxyUrl)}" placeholder="https://iip-proxy.tu-usuario.workers.dev"></label>
      <p class="note" style="margin:4px 0 0">Si despliegas el Cloudflare Worker incluido en <code>worker/</code>, las claves viven en el servidor y no hace falta escribirlas aquí.</p>
      <div class="row"><button class="btn pri">Guardar</button><button type="button" class="btn" id="test">Probar conexión</button></div><div id="tr"></div></form>`)}
    <div class="stack-y">
      ${card('Límites y caché', `<form id="lf" class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <label class="f">Límite diario FMP<input class="in" id="lfm" type="number" value="${c.fmpDailyLimit}"></label><label class="f">Límite diario Alpha Vantage<input class="in" id="lav" type="number" value="${c.avDailyLimit}"></label>
        <label class="f">Caché de fundamentales (horas)<input class="in" id="chf" type="number" value="${c.cacheHours.fundamentals}"></label><label class="f">Caché de cotizaciones (horas)<input class="in" id="chq" type="number" step="0.05" value="${c.cacheHours.quote}"></label>
        <div class="row"><button class="btn">Guardar límites</button><button type="button" class="btn" id="cc">Vaciar caché</button></div></form>
        <p class="note">Hoy has usado ${u.fmp || 0} peticiones de FMP y ${u.av || 0} de Alpha Vantage. Al llegar al límite la app sirve los datos en caché y avisa.</p>`)}
      ${card('Tus datos (favoritos, listas, análisis, supuestos)', `<p class="note" style="margin-top:0">Se guardan en este navegador. Exporta una copia para pasarlos a otro dispositivo.</p><div class="row"><button class="btn" id="ex">Exportar copia (JSON)</button><label class="btn">Importar copia<input type="file" id="im" accept="application/json" hidden></label></div>`)}
    </div>
  </div>`;
  view.querySelector('#kf').onsubmit = (e) => { e.preventDefault(); config.set({ fmpKey: view.querySelector('#fk').value.trim(), avKey: view.querySelector('#ak').value.trim(), proxyUrl: view.querySelector('#px').value.trim() }); toast('Guardado'); if (firstRun && config.hasData()) location.hash = '#/'; };
  view.querySelector('#test').onclick = async () => {
    config.set({ fmpKey: view.querySelector('#fk').value.trim(), avKey: view.querySelector('#ak').value.trim(), proxyUrl: view.querySelector('#px').value.trim() });
    const out = view.querySelector('#tr'); out.innerHTML = '<p class="note">Probando…</p>';
    const res = [];
    for (const p of [fmp, alphavantage]) {
      const cfg = config.get(); if (!cfg.proxyUrl && !(p.id === 'fmp' ? cfg.fmpKey : cfg.avKey)) { res.push(`${p.name}: sin clave`); continue; }
      try { const r = await p.quote('AAPL'); res.push(`<span class="pos">✓</span> ${p.name}: OK (AAPL ${r.data.price})`); } catch (err) { res.push(`<span class="neg">✕</span> ${p.name}: ${esc(err.message)}`); }
    }
    out.innerHTML = `<p class="note">${res.join('<br>')}</p>`;
  };
  view.querySelector('#lf').onsubmit = (e) => { e.preventDefault(); const ch = { ...c.cacheHours, fundamentals: +view.querySelector('#chf').value, quote: +view.querySelector('#chq').value }; config.set({ fmpDailyLimit: +view.querySelector('#lfm').value, avDailyLimit: +view.querySelector('#lav').value, cacheHours: ch }); toast('Límites guardados'); };
  view.querySelector('#cc').onclick = async () => { await clearCache(); toast('Caché vaciada'); };
  view.querySelector('#ex').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportAll()], { type: 'application/json' })); a.download = 'investment-intelligence-pro.json'; a.click(); };
  view.querySelector('#im').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { store.importAll(await f.text()); toast('Datos importados'); } catch { toast('Archivo no válido'); } };
}
