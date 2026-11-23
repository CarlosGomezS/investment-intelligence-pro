// Ajustes: claves de todas las fuentes gratuitas (solo en este navegador), backend proxy, límites, caché y copia de seguridad.
import { config, KEYS, exportKeysCode, importKeysCode } from '../config.js?v=e06fb4a0';
import { clearCache, usage, PROVIDERS } from '../providers/http.js?v=e06fb4a0';
import { fmp } from '../providers/fmp.js?v=e06fb4a0';
import { alphavantage } from '../providers/alphavantage.js?v=e06fb4a0';
import { finnhub } from '../providers/finnhub.js?v=e06fb4a0';
import { twelvedata } from '../providers/twelvedata.js?v=e06fb4a0';
import { roic } from '../providers/roic.js?v=e06fb4a0';
import { store } from '../store.js?v=e06fb4a0';
import { esc, card, toast } from '../ui/dom.js?v=e06fb4a0';

const SRC = [
  { id: 'fmp', label: 'Financial Modeling Prep', link: 'https://site.financialmodelingprep.com/developer/docs/pricing', free: '250/día · EE. UU.', role: 'Principal: estados, ratios históricos, estimaciones, DCF, insiders, screener.', test: () => fmp.quote('AAPL') },
  { id: 'finnhub', label: 'Finnhub', link: 'https://finnhub.io/register', free: '60/min, sin tope diario · EE. UU.', role: 'Cotizaciones, perfil, ratios actuales, competidores, recomendaciones, noticias y calendario sin gastar cuota de FMP.', test: () => finnhub.quote('AAPL') },
  { id: 'td', label: 'Twelve Data', link: 'https://twelvedata.com/register', free: '800/día, 8/min · EE. UU. y divisas', role: 'Histórico de precios (20 años), cotizaciones y tipos de cambio.', test: () => twelvedata.quote('AAPL') },
  { id: 'roic', label: 'ROIC.AI', link: 'https://www.roic.ai/api', free: '5/min · mundial · 2 años', role: 'Respaldo mundial: perfil, precios y estados de empresas de fuera de EE. UU.', test: () => roic.profile('AAPL') },
  { id: 'av', label: 'Alpha Vantage', link: 'https://www.alphavantage.co/support/#api-key', free: '25/día', role: 'Último respaldo: estados, dividendos, resultados y noticias.', test: () => alphavantage.quote('IBM') },
];

export function render(view, _p, _q, firstRun) {
  const c = config.get(), u = usage();
  const GH = (typeof window !== 'undefined' && window.__IIP_KEYS) || {};
  const NAMES = { fmpKey: 'FMP', finnhubKey: 'Finnhub', tdKey: 'Twelve Data', roicKey: 'ROIC.AI', avKey: 'Alpha Vantage' };
  const nGH = Object.keys(NAMES).filter((k) => GH[k]).length;
  view.innerHTML = `${firstRun ? `<section class="hero" style="margin-bottom:14px"><h1>Configura tus fuentes de datos</h1><p>Cuantas más claves gratuitas añadas, más empresas cubres y menos te afectan los límites diarios: la app reparte las consultas entre todas y usa cada una solo para lo que mejor hace. Basta con una para empezar. Se guardan solo en este navegador.</p></section>` : '<h1 style="font-size:22px;margin-bottom:14px">Ajustes</h1>'}
  <div class="grid g2">
    ${card('Fuentes de datos gratuitas', `<form id="kf" class="stack-y">
      <div class="note" style="padding:8px 10px;border-radius:8px;border:1px solid var(--line);${nGH ? 'color:var(--pos)' : 'color:var(--warn)'}">${nGH ? `✓ Claves de GitHub activas: ${nGH} de 5 (${Object.keys(GH).filter((k) => GH[k] && k !== 'proxyUrl').map((k) => NAMES[k] || k).join(', ')}). No hace falta escribirlas aquí: la app ya las usa.` : 'Esta página no ha recibido claves de GitHub. Recarga la página; si sigue así, revisa que los secretos se llamen FMP_KEY, FINNHUB_KEY, TD_KEY, ROIC_KEY y AV_KEY y que la última publicación (Actions) terminó en verde.'}</div>
      ${SRC.map((s) => `<div><label class="f"><span><b style="color:var(--ink)">${s.label}</b> · ${s.free} · <a href="${s.link}" target="_blank" rel="noopener">conseguir clave</a></span><input class="in" id="k_${s.id}" type="password" autocomplete="off" value="${esc(c[KEYS[s.id]] || '')}" placeholder="API key"></label><p class="note" style="margin:3px 0 0">${GH[KEYS[s.id]] ? '<b style="color:var(--pos)">✓ Cargada desde GitHub (secretos)</b> · ' : ''}${s.role}</p></div>`).join('')}
      <div><label class="f"><span><b style="color:var(--ink)">Backend proxy (Cloudflare Worker)</b> · gratis · activa SEC EDGAR y ESEF</span><input class="in" id="px" value="${esc(c.proxyUrl)}" placeholder="https://iip-proxy.tu-usuario.workers.dev"></label>
      <p class="note" style="margin:3px 0 0">Con el Worker se añaden dos fuentes oficiales sin límite diario: <b>SEC EDGAR</b> (estados de todas las empresas registradas en EE. UU., incluidas extranjeras como ASML, TSMC o Santander) y <b>filings.xbrl.org</b> (cuentas anuales ESEF de cotizadas europeas). Además guarda las claves en el servidor y cachea las respuestas. Instrucciones en el README del repositorio.</p></div>
      <p class="note" style="margin:0">filings.xbrl.org se intenta también sin Worker; si tu navegador lo bloquea, se necesita el Worker.</p>
      <div class="row"><button class="btn pri">Guardar</button><button type="button" class="btn" id="test">Probar todas</button></div><div id="tr"></div></form>`)}
    <div class="stack-y">
      ${card('Uso de hoy y límites', `<form id="lf"><div class="tablewrap"><table class="dense"><thead><tr><th class="l">Fuente</th><th>Usadas hoy</th><th>Límite diario</th></tr></thead><tbody>
        ${Object.keys(PROVIDERS).map((p) => `<tr><td class="l">${PROVIDERS[p].name}${PROVIDERS[p].perMin ? ` <span class="note">(${PROVIDERS[p].perMin}/min)</span>` : ''}</td><td>${u[p] || 0}</td><td><input class="in" style="width:90px;height:28px" type="number" id="l_${p}" value="${c.limits[p] || ''}" placeholder="sin tope"></td></tr>`).join('')}
        </tbody></table></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"><label class="f">Caché de fundamentales (horas)<input class="in" id="chf" type="number" value="${c.cacheHours.fundamentals}"></label><label class="f">Caché de cotizaciones (horas)<input class="in" id="chq" type="number" step="0.05" value="${c.cacheHours.quote}"></label></div>
        <div class="row" style="margin-top:10px"><button class="btn">Guardar límites</button><button type="button" class="btn" id="cc">Vaciar caché</button></div></form>
        <p class="note">Cuando una fuente con tope diario supera el 70 % de su cuota, pasa al final de la cola y solo se usa si ninguna otra tiene el dato. Al agotarla, la app sirve lo que tenga en caché.</p>`)}
      ${card('Qué fuente se usa para cada dato', `<table class="dense"><tbody>
        <tr><td class="l">Búsqueda</td><td class="l">Finnhub + Twelve Data + SEC → FMP → ROIC.AI / Alpha Vantage</td></tr>
        <tr><td class="l">Cotización</td><td class="l">Finnhub → Twelve Data → FMP → Alpha Vantage → ROIC.AI</td></tr>
        <tr><td class="l">Histórico de precios</td><td class="l">Twelve Data → FMP → ROIC.AI → Alpha Vantage</td></tr>
        <tr><td class="l">Estados financieros anuales</td><td class="l">FMP → SEC EDGAR → ESEF → ROIC.AI → Alpha Vantage</td></tr>
        <tr><td class="l">Ratios actuales</td><td class="l">FMP → Finnhub</td></tr>
        <tr><td class="l">Competidores, recomendaciones</td><td class="l">FMP → Finnhub</td></tr>
        <tr><td class="l">Noticias, resultados</td><td class="l">FMP → Finnhub → Alpha Vantage</td></tr>
        <tr><td class="l">Calendario de resultados</td><td class="l">Finnhub → FMP</td></tr>
        <tr><td class="l">Documentos regulatorios</td><td class="l">FMP → SEC EDGAR</td></tr></tbody></table>`)}
      ${card('Copia de seguridad de las claves', `<p class="note" style="margin-top:0">Las claves se guardan en tres sitios de este dispositivo y se recuperan solas. Aun así, guarda este código en tus notas o en un mensaje a ti mismo: si cambias de móvil o reinstalas la app, lo pegas aquí y vuelven todas.</p>
        <div class="row"><button class="btn" id="kcopy">Copiar código de mis claves</button></div>
        <label class="f" style="margin-top:10px">Pegar código para restaurar<textarea class="in" id="kcode" rows="2" placeholder="IIP1:…"></textarea></label>
        <div class="row" style="margin-top:8px"><button class="btn pri" id="kimp">Restaurar claves</button></div>`)}
      ${card('Tus datos (favoritos, listas, análisis, supuestos)', `<p class="note" style="margin-top:0">Se guardan en este navegador. Exporta una copia para pasarlos a otro dispositivo.</p><div class="row"><button class="btn" id="ex">Exportar copia (JSON)</button><label class="btn">Importar copia<input type="file" id="im" accept="application/json" hidden></label></div>`)}
    </div>
  </div>`;
  const saveKeys = () => config.set({ ...Object.fromEntries(SRC.map((s) => [KEYS[s.id], view.querySelector('#k_' + s.id).value.trim()])), proxyUrl: view.querySelector('#px').value.trim() });
  view.querySelector('#kf').onsubmit = (e) => { e.preventDefault(); saveKeys(); toast('Guardado'); window.dispatchEvent(new CustomEvent('iip:usage')); if (firstRun && config.hasData()) location.hash = '#/'; };
  view.querySelector('#test').onclick = async () => {
    saveKeys();
    const out = view.querySelector('#tr'); out.innerHTML = '<p class="note">Probando…</p>';
    const res = await Promise.all(SRC.map(async (s) => {
      if (!config.canUse(s.id)) return `<span class="mute">–</span> ${s.label}: sin clave`;
      try { const r = await s.test(); return `<span class="pos">✓</span> ${s.label}: OK${r.data && r.data.price ? ` (${r.data.price})` : ''}`; } catch (err) { return `<span class="neg">✕</span> ${s.label}: ${esc(err.message)}`; }
    }));
    if (config.get().proxyUrl) {
      const { sec } = await import('../providers/sec.js?v=e06fb4a0');
      try { const r = await sec.search('Apple'); res.push(`<span class="pos">✓</span> SEC EDGAR: OK (${r.data.length} resultados)`); } catch (err) { res.push(`<span class="neg">✕</span> SEC EDGAR: ${esc(err.message)}`); }
    }
    out.innerHTML = `<p class="note">${res.join('<br>')}</p>`;
  };
  view.querySelector('#lf').onsubmit = (e) => {
    e.preventDefault();
    const limits = Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, +view.querySelector('#l_' + p).value || 0]));
    config.set({ limits, cacheHours: { ...c.cacheHours, fundamentals: +view.querySelector('#chf').value, quote: +view.querySelector('#chq').value } });
    toast('Límites guardados'); window.dispatchEvent(new CustomEvent('iip:usage'));
  };
  view.querySelector('#kcopy').onclick = async () => { const code = exportKeysCode(); try { await navigator.clipboard.writeText(code); toast('Código copiado: guárdalo en tus notas'); } catch { view.querySelector('#kcode').value = code; toast('Copia el código del recuadro'); } };
  view.querySelector('#kimp').onclick = () => { try { importKeysCode(view.querySelector('#kcode').value); toast('Claves restauradas'); render(view); } catch (e) { toast(e.message); } };
  view.querySelector('#cc').onclick = async () => { await clearCache(); toast('Caché vaciada'); };
  view.querySelector('#ex').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportAll()], { type: 'application/json' })); a.download = 'investment-intelligence-pro.json'; a.click(); };
  view.querySelector('#im').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { store.importAll(await f.text()); toast('Datos importados'); } catch { toast('Archivo no válido'); } };
}
