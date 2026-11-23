// Punto de entrada: enrutador por hash, buscador global con autocompletado, tema y contador de uso.
import { $, $$, esc, num, sgnPct, cls, toast } from './ui/dom.js?v=f598cc18';
import { data, setHint } from './providers/index.js?v=f598cc18';
import { usage } from './providers/http.js?v=f598cc18';
import { config, restoreConfig } from './config.js?v=f598cc18';
import { store } from './store.js?v=f598cc18';
import { destroyAll } from './ui/charts.js?v=f598cc18';

const routes = {
  dashboard: () => import('./views/dashboard.js?v=f598cc18'),
  c: () => import('./views/company.js?v=f598cc18'),
  watchlist: () => import('./views/watchlist.js?v=f598cc18'),
  screener: () => import('./views/screener.js?v=f598cc18'),
  comparar: () => import('./views/compare.js?v=f598cc18'),
  calendario: () => import('./views/calendar.js?v=f598cc18'),
  metodologia: () => import('./views/methodology.js?v=f598cc18'),
  ajustes: () => import('./views/settings.js?v=f598cc18'),
};

export function go(path) { location.hash = '#/' + path; }

async function route() {
  closeSugg();
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const name = parts[0] || 'dashboard';
  const view = $('#view');
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (name === 'c' ? '' : name)));
  if (!routes[name]) { view.innerHTML = '<div class="empty">Página no encontrada. <a href="#/">Volver al panel</a></div>'; return; }
  if (!config.hasData() && name !== 'ajustes' && name !== 'metodologia') { (await routes.ajustes()).render(view, [], new URLSearchParams(), true); return; }
  const mod = await routes[name]();
  const sameCompany = name === 'c' && view.dataset.sym === parts[1];
  if (!sameCompany) { destroyAll(); window.scrollTo(0, 0); }
  view.dataset.sym = name === 'c' ? parts[1] : '';
  if (name !== 'c' || !sameCompany) view.dataset.loaded = '';
  try { await mod.render(view, parts.slice(1), new URLSearchParams(query || '')); }
  catch (e) { console.error(e); view.innerHTML = `<div class="empty">Error al mostrar la página: ${esc(e.message)}</div>`; }
}

// ---------- Buscador ----------
const EXCH_COUNTRY = { NASDAQ: 'EE. UU.', NYSE: 'EE. UU.', AMEX: 'EE. UU.', BME: 'España', MCE: 'España', XETRA: 'Alemania', FRA: 'Alemania', EURONEXT: 'Euronext', PAR: 'Francia', AMS: 'Países Bajos', LSE: 'Reino Unido', MIL: 'Italia', SIX: 'Suiza', TSX: 'Canadá', JPX: 'Japón', HKSE: 'Hong Kong', SHH: 'China', SHZ: 'China', KSC: 'Corea', TAI: 'Taiwán', ASX: 'Australia', NSE: 'India', STO: 'Suecia', CPH: 'Dinamarca', OSL: 'Noruega', HEL: 'Finlandia', LIS: 'Portugal', BRU: 'Bélgica', OTC: 'OTC' };
const SUFFIX = { MC: 'España', DE: 'Alemania', PA: 'Francia', AS: 'Países Bajos', L: 'Reino Unido', MI: 'Italia', SW: 'Suiza', TO: 'Canadá', T: 'Japón', HK: 'Hong Kong', SS: 'China', SZ: 'China', KS: 'Corea', TW: 'Taiwán', AX: 'Australia', NS: 'India', ST: 'Suecia', CO: 'Dinamarca', OL: 'Noruega', HE: 'Finlandia', LS: 'Portugal', BR: 'Bélgica' };
export const countryOf = (r) => SUFFIX[(r.symbol || '').split('.')[1]] || EXCH_COUNTRY[r.exchange] || r.exchange || '';
export const logoHTML = (sym, size = 28) => `<span class="logo" style="width:${size}px;height:${size}px"><img src="${data.logo(sym)}" alt="" loading="lazy" onerror="this.remove()"></span>`;

const q = $('#q'), sugg = $('#sugg');
let timer = null, seq = 0, items = [], sel = -1;

function rank(list, term) {
  const t = term.toUpperCase();
  const major = /^(NASDAQ|NYSE|AMEX|BME|XETRA|EURONEXT|LSE|PAR|AMS|MIL|SIX|TSX|JPX|HKSE)$/;
  return list.map((r) => {
    let s = 0; const sym = (r.symbol || '').toUpperCase(), nm = (r.name || '').toUpperCase();
    if (sym === t) s += 100; else if (sym.startsWith(t)) s += 40;
    if (nm.startsWith(t)) s += 50; else if (nm.includes(t)) s += 20;
    if (major.test(r.exchange || '')) s += 25;
    if (!sym.includes('.')) s += 5;
    return { r, s };
  }).sort((a, b) => b.s - a.s).map((x) => x.r);
}

function renderSugg(list, title) {
  items = list; sel = -1;
  if (!list.length) { sugg.innerHTML = `<li class="hd">${esc(title || 'Sin resultados')}</li>`; sugg.hidden = false; return; }
  sugg.innerHTML = (title ? `<li class="hd">${esc(title)}</li>` : '') + list.map((r, i) => `<li role="option" data-i="${i}" id="s${i}">${logoHTML(r.symbol)}<div><div class="nm">${esc(r.name || r.symbol)}</div><small>${esc([r.exchangeFullName || r.exchange, countryOf(r), r.currency].filter(Boolean).join(' · '))}</small></div><div class="tk">${esc(r.symbol)}<small class="qp" data-s="${esc(r.symbol)}"></small></div></li>`).join('');
  sugg.hidden = false; q.parentElement.setAttribute('aria-expanded', 'true');
}
function closeSugg() { sugg.hidden = true; q.parentElement.setAttribute('aria-expanded', 'false'); }
function choose(r) { if (r.name) setHint(r.symbol, { name: r.name, country: r.country }); closeSugg(); q.value = ''; q.blur(); store.pushHistory(r); go(`c/${encodeURIComponent(r.symbol)}/resumen`); }

async function doSearch(term) {
  const my = ++seq;
  try {
    const r = await data.search(term);
    if (my !== seq) return;
    const list = rank(r.data, term).slice(0, 10);
    renderSugg(list);
    // cotización de los 3 primeros resultados (cacheada unos minutos)
    for (const it of list.slice(0, 3)) data.quote(it.symbol).then((x) => { const el = sugg.querySelector(`.qp[data-s="${CSS.escape(it.symbol)}"]`); if (el && x.data) el.innerHTML = `<br>${num(x.data.price, 2)} <span class="${cls(x.data.changePercentage)}">${sgnPct(x.data.changePercentage / 100)}</span>`; }).catch(() => {});
  } catch (e) { if (my === seq) renderSugg([], e.message); }
}

q.addEventListener('input', () => {
  const t = q.value.trim(); clearTimeout(timer);
  if (t.length < 2) { showHistory(); return; }
  timer = setTimeout(() => doSearch(t), 280);
});
q.addEventListener('focus', () => { if (q.value.trim().length < 2) showHistory(); });
q.addEventListener('keydown', (e) => {
  if (sugg.hidden) return;
  const n = items.length;
  if (e.key === 'ArrowDown') { sel = (sel + 1) % n; e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = (sel - 1 + n) % n; e.preventDefault(); } else if (e.key === 'Enter') { e.preventDefault(); if (items[sel >= 0 ? sel : 0]) choose(items[sel >= 0 ? sel : 0]); else if (q.value.trim()) choose({ symbol: q.value.trim().toUpperCase() }); return; } else if (e.key === 'Escape') { closeSugg(); return; } else return;
  $$('#sugg li[role=option]').forEach((li, i) => li.setAttribute('aria-selected', i === sel));
  const cur = $(`#s${sel}`); if (cur) { cur.scrollIntoView({ block: 'nearest' }); q.setAttribute('aria-activedescendant', cur.id); }
});
sugg.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(items[+li.dataset.i]); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) closeSugg(); });
document.addEventListener('keydown', (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
function showHistory() { const h = store.get().history.slice(0, 8); if (h.length) renderSugg(h, 'Consultadas recientemente'); else closeSugg(); }

// ---------- Tema y uso ----------
function applyTheme(t) { document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0a0d13' : '#f4f6f9'; }
applyTheme(config.get().theme);
$('#theme').addEventListener('click', () => { const t = config.get().theme === 'dark' ? 'light' : 'dark'; config.set({ theme: t }); applyTheme(t); route(); });
const SHORT = { fmp: 'FMP', av: 'AV', td: 'TD', finnhub: 'FH', roic: 'ROIC', sec: 'SEC', esef: 'ESEF' };
function showUsage() { const u = usage(), c = config.get(); $('#usage').textContent = Object.keys(SHORT).filter((p) => config.canUse(p) && (u[p] || c.limits[p])).map((p) => `${SHORT[p]} ${u[p] || 0}${c.limits[p] ? '/' + c.limits[p] : ''}`).join(' · '); }
window.addEventListener('iip:usage', showUsage); showUsage();

window.__iipBooted = true;
{ const bf = document.getElementById('bootfail'); if (bf) bf.hidden = true; }
window.addEventListener('hashchange', route);
window.addEventListener('iip:toast', (e) => toast(e.detail));
// Recupera las claves desde las copias (IndexedDB / cookie) antes de pintar nada
restoreConfig().then((restored) => { if (restored) toast('Claves recuperadas de la copia de seguridad'); showUsage(); route(); });
