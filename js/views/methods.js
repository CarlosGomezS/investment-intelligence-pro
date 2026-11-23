// «Métodos»: aplica el método de inversión elegido (Buffett, Graham, Greenblatt, Lynch, Piotroski) a un universo de
// empresas, ordena por nota y da las 10 primeras con precio de entrada, objetivo y salida según el propio método,
// más la señal técnica del «cocodrilo» (Alligator de Bill Williams) para el momento de entrada y su stop.
import { data } from '../providers/index.js?v=5ad630d4';
import { compute, fxFor } from './company.js?v=5ad630d4';
import { METHODS, rankMethod } from '../calc/methods.js?v=5ad630d4';
import { fxRate } from '../providers/fxrate.js?v=5ad630d4';
import { alligator } from '../calc/alligator.js?v=5ad630d4';
import { esc, card, num, pct, big, toast } from '../ui/dom.js?v=5ad630d4';
import { logoHTML } from '../app.js?v=5ad630d4';
import { isNum } from '../calc/finance.js?v=5ad630d4';
import { store } from '../store.js?v=5ad630d4';
import { exportCSV } from '../export.js?v=5ad630d4';

// Grandes empresas de EE. UU. (solo símbolos; los datos se descargan de tus fuentes). Se usa si el screener de FMP no responde.
const FALLBACK = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA', 'LLY', 'JPM', 'V', 'UNH', 'XOM', 'MA', 'JNJ', 'PG', 'HD', 'COST', 'ABBV', 'MRK',
  'KO', 'PEP', 'ADBE', 'CRM', 'WMT', 'CVX', 'ORCL', 'NFLX', 'AMD', 'TMO', 'MCD', 'CSCO', 'ACN', 'ABT', 'LIN', 'TXN', 'NKE', 'INTU', 'QCOM', 'AMGN',
  'HON', 'IBM', 'CAT', 'UPS', 'LOW', 'SBUX', 'BKNG', 'GILD', 'ADP', 'MDLZ', 'MO', 'PM', 'ISRG', 'VRTX', 'ZTS', 'SPGI', 'DE', 'MMM', 'CL', 'HSY'];

// Análisis masivo: Finnhub primero (60/min, sin tope diario) para no gastar la cuota diaria de FMP.
const VIA = { profile: ['finnhub', 'fmp', 'roic'], quote: ['finnhub', 'td', 'fmp'], st: ['finnhub', 'fmp', 'sec', 'roic', 'esef'], ttm: ['finnhub', 'fmp'], px: ['td', 'fmp', 'roic', 'av'] }; // precios: Twelve Data primero; si su cola por minuto se alarga, pasa a FMP (no se gasta FMP de más)
const results = new Map(); // símbolo → { sym, S } | { sym, error }
let state = { method: 'buffett', universe: 'grandes', n: 40, manual: '', running: false, done: 0, total: 0, techs: new Map() };
const SAVE = 'iip.methods.v1';

const wrap = (p) => p.then((v) => ({ ok: true, ...v }), (e) => ({ ok: false, error: e }));
const KEYS = ['quote', 'priceChange', 'income', 'balance', 'cashflow', 'incomeTTM', 'balanceTTM', 'cashflowTTM', 'ratios', 'keyMetrics', 'ratiosTTM', 'keyMetricsTTM', 'scores', 'estimates', 'priceTarget', 'gradesConsensus', 'dcf', 'dividends', 'splits', 'earnings', 'treasury', 'riskPremium', 'prices', 'spy', 'profile'];

const usdCache = new Map();
function usdRate(cur) { if (!usdCache.has(cur)) usdCache.set(cur, fxRate(cur, 'USD').then((r) => r.rate)); return usdCache.get(cur); }
let shared = null; // bono a 10 años y prima de riesgo: una sola descarga para todas
async function sharedMarket() {
  if (!shared) shared = Promise.all([wrap(data.treasury(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))), wrap(data.riskPremium())]);
  return shared;
}

async function analyzeOne(sym) {
  const [treasury, riskPremium] = await sharedMarket();
  const lim = (p, ms = 25000) => Promise.race([p, new Promise((res) => setTimeout(() => res({ ok: false, error: { code: 'network', message: 'tarda demasiado' } }), ms))]);
  const from = new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10);
  // La ficha va primero en bolsas no estadounidenses: aporta nombre, ISIN y país, que necesitan SEC, ROIC.AI y ESEF
  const prof0 = sym.includes('.') ? await lim(wrap(data.via(VIA.profile, 'profile', sym))) : null;
  const [profile, quote, income, balance, cashflow, ratiosTTM, keyMetricsTTM, prices] = await Promise.all([
    prof0 ? Promise.resolve(prof0) : lim(wrap(data.via(VIA.profile, 'profile', sym))), lim(wrap(data.via(VIA.quote, 'quote', sym))),
    lim(wrap(data.via(VIA.st, 'income', sym, 'annual', 12))), lim(wrap(data.via(VIA.st, 'balance', sym, 'annual', 12))), lim(wrap(data.via(VIA.st, 'cashflow', sym, 'annual', 12))),
    lim(wrap(data.via(VIA.ttm, 'ratiosTTM', sym))), lim(wrap(data.via(VIA.ttm, 'keyMetricsTTM', sym))),
    lim(wrap(data.via(VIA.px, 'pricesDaily', sym, from)), 40000), // múltiplos históricos propios (segundo método de valoración) y cocodrilo
  ]);
  const raw = Object.fromEntries(KEYS.map((k) => [k, { ok: false, error: { code: 'not_found' } }]));
  Object.assign(raw, { profile, quote, income, balance, cashflow, ratiosTTM, keyMetricsTTM, treasury, riskPremium, prices });
  if (!income.ok || !quote.ok) throw Object.assign(new Error(!quote.ok ? 'sin cotización' : 'sin estados financieros en tus fuentes gratuitas'), { code: 'not_found' });
  const fx = await fxFor(raw); // moneda de los estados ≠ moneda de cotización (ADR, Londres en peniques…)
  if (fx === null) throw new Error('sin tipo de cambio entre la moneda de sus cuentas y la de cotización');
  let S = compute({ sym, raw, fx, noSaved: true });
  // Si aparece un salto de acciones (posible split), se descarga la lista real de splits y se recalcula con ella
  // Cualquier salto de acciones (no solo los splits típicos: 3:2, 7:1 × 4:1…) hace descargar la lista real de splits
  const sh = S.m.years.map((y) => y.shares).filter(isNum);
  const jump = sh.some((v, i) => i && (v / sh[i - 1] > 1.2 || v / sh[i - 1] < 0.85)) || (isNum(S.m.shares) && sh.length && (S.m.shares / sh[sh.length - 1] > 1.2 || S.m.shares / sh[sh.length - 1] < 0.85));
  if ((S.m.splitsAdj || []).length || jump) { raw.splits = await lim(wrap(data.splits(sym)), 15000); if (raw.splits.ok) S = compute({ sym, raw, fx, noSaved: true }); }
  // Si reparte dividendo, el historial de pagos (para los 20 años de Graham y la rentabilidad por dividendo)
  if (S.m.last && S.m.last.dividendsPaid > 0) { raw.dividends = await lim(wrap(data.via(['fmp', 'av'], 'dividends', sym)), 15000); S = compute({ sym, raw, fx, noSaved: true }); }
  // Tipo de cambio a USD para los umbrales en dólares (tamaño de Graham)
  if (S.m.tradeCur && S.m.tradeCur !== 'USD') { const u = await usdRate(S.m.tradeCur); S.usdRate = u; } else S.usdRate = 1;
  if (S.m.profile.isEtf || S.m.profile.isFund) throw new Error('es un ETF o fondo');
  if (!isNum(S.m.price)) throw new Error('sin precio');
  return S;
}

async function universe() {
  if (state.universe === 'seguimiento') return [...new Set(Object.values(store.lists()).flat().map((x) => x.symbol))];
  if (state.universe === 'manual') return state.manual.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  try {
    const r = await data.screener({ country: 'US', marketCapMoreThan: 2e10, isEtf: false, isFund: false, isActivelyTrading: true, limit: 200 });
    const list = (r.data || []).filter((x) => x.symbol && !/[.\-]/.test(x.symbol)).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).map((x) => x.symbol);
    if (list.length >= 20) return list.slice(0, state.n);
  } catch { /* sin screener: lista fija */ }
  return FALLBACK.slice(0, state.n);
}

export async function render(view) {
  try { const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (s && !state.running) Object.assign(state, { method: s.method || state.method, universe: s.universe || state.universe, n: s.n || state.n, manual: s.manual || '' }); } catch {}
  const M = METHODS[state.method];
  view.innerHTML = `<h1 style="font-size:22px;margin-bottom:14px">Métodos de inversión</h1>
  ${card('', `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
      <label class="f">Método<select class="in" id="mm">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${k === state.method ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label class="f">Empresas a analizar<select class="in" id="mu">
        <option value="grandes" ${state.universe === 'grandes' ? 'selected' : ''}>Grandes de EE. UU.</option>
        <option value="seguimiento" ${state.universe === 'seguimiento' ? 'selected' : ''}>Mi seguimiento</option>
        <option value="manual" ${state.universe === 'manual' ? 'selected' : ''}>Tickers que yo escriba</option></select></label>
      <label class="f" id="nwrap" style="${state.universe !== 'grandes' ? 'display:none' : ''}">Cuántas<select class="in" id="mn">${[20, 40, 60, 100].map((n) => `<option ${n === state.n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f" id="mwrap" style="${state.universe !== 'manual' ? 'display:none' : ''}">Tickers<input class="in" id="mt" placeholder="KO, PEP, MSFT, ITX.MC…" value="${esc(state.manual)}"></label>
    </div>
    <div class="row" style="margin-top:12px;gap:8px"><button class="btn pri" id="go">${state.running ? 'Analizando…' : 'Analizar'}</button><button class="btn" id="csv" ${results.size ? '' : 'disabled'}>CSV</button><span class="note" id="prog"></span></div>
    <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Cómo funciona «${esc(M.name)}»</summary>
      <p class="note" style="margin-top:8px"><b>${esc(M.author)}.</b> ${esc(M.summary)}</p>
      <ol class="note" style="padding-left:18px">${M.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      <p class="note"><b>Salida según el método:</b> ${esc(M.exit)}</p>
      <p class="note">${esc(M.thresholdsNote)} <b>Cocodrilo técnico</b> (Alligator de Bill Williams, solo para las 10 primeras): mandíbula SMMA 13 desplazada 8, dientes SMMA 8 desplazada 5, labios SMMA 5 desplazada 3 sobre el precio mediano. Entrada al romper el último fractal superior por encima de los dientes; stop tras el último fractal inferior; salida cuando las líneas se juntan. Es una herramienta de momento de entrada, no forma parte de los métodos fundamentales.</p>
    </details>`)}
  <div id="mr" style="margin-top:14px"></div>
  <p class="note" style="margin-top:12px">Herramienta de análisis con reglas publicadas por sus autores y datos de tus fuentes. No es una recomendación de compra ni asesoramiento financiero. Comprueba cada empresa en su ficha antes de invertir.</p>`;
  const $ = (s) => view.querySelector(s);
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify({ method: state.method, universe: state.universe, n: state.n, manual: state.manual })); } catch {} };
  $('#mm').onchange = (e) => { state.method = e.target.value; persist(); render(view); };
  $('#mu').onchange = (e) => { state.universe = e.target.value; persist(); render(view); };
  $('#mn').onchange = (e) => { state.n = +e.target.value; persist(); };
  if ($('#mt')) $('#mt').oninput = (e) => { state.manual = e.target.value; persist(); };
  $('#go').onclick = () => run(view);
  $('#csv').onclick = () => csv();
  draw(view);
  if (results.size && !state.running) techTop(view); // el top cambia con el método: cocodrilo de los nuevos
}

async function run(view) {
  if (state.running) return;
  const syms = await universe();
  if (!syms.length) { toast(state.universe === 'seguimiento' ? 'Tu lista de seguimiento está vacía' : 'Escribe al menos un ticker'); return; }
  state.running = true; state.done = 0; state.total = syms.length; results.clear(); state.techs = new Map();
  render(view);
  const q = [...syms]; const workers = Array.from({ length: 4 }, async () => {
    while (q.length) {
      const sym = q.shift();
      try { results.set(sym, { sym, S: await analyzeOne(sym) }); } catch (e) { results.set(sym, { sym, error: e.message || 'sin datos' }); }
      state.done++; if (document.body.contains(view)) progress(view);
    }
  });
  await Promise.all(workers);
  state.running = false;
  if (document.body.contains(view)) render(view);
  await techTop(view);
}

// Cocodrilo técnico para las 10 primeras del método elegido (precios diarios de 1 año)
async function techTop(view) {
  const top = rankMethod(state.method, [...results.values()]).slice(0, 10);
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  for (const { r } of top) {
    if (state.techs.has(r.sym)) continue;
    state.techs.set(r.sym, { loading: true });
    try { const pd = r.S.raw.prices && r.S.raw.prices.ok ? r.S.raw.prices.data : (await data.via(VIA.px, 'pricesDaily', r.sym, from)).data; const a = alligator(pd); if (a && isNum(a.stop) && isNum(r.S.m.price) && a.stop >= r.S.m.price) a.stop = null; /* el stop siempre por debajo del precio actual */ state.techs.set(r.sym, a || { error: 'pocas velas' }); } catch (e) { state.techs.set(r.sym, { error: (e && e.message) || 'sin precios' }); }
    if (document.body.contains(view)) draw(view);
  }
}

function progress(view) {
  const el = view.querySelector('#prog'); if (el) el.textContent = state.running ? `Analizando ${state.done} de ${state.total}… (se guarda en caché: la próxima vez es inmediato)` : '';
  if (state.done % 4 === 0) draw(view);
}

const VERD = { entra: ['Entraría', 'pos'], vigilar: ['Vigilar precio', 'warn'], no: ['No cumple', 'neg'] };

function draw(view) {
  const box = view.querySelector('#mr'); if (!box) return;
  if (!results.size) { box.innerHTML = state.running ? '<div class="skel"><div></div><div></div></div>' : '<div class="empty">Elige un método y pulsa «Analizar». La primera vez tarda unos minutos (respeta los límites gratuitos de tus fuentes); después queda en caché.</div>'; return; }
  const all = [...results.values()];
  const ranked = rankMethod(state.method, all);
  const fails = all.filter((r) => r.error);
  const top = ranked.slice(0, 10);
  const cur = (r) => r.S.m.tradeCur || '';
  const T = (sym) => state.techs.get(sym);
  const techCell = (sym) => { const t = T(sym); if (!t) return '<span class="note">—</span>'; if (t.loading) return '<span class="note">…</span>'; if (t.error) return `<span class="note">${esc(t.error)}</span>`; return `<span class="${t.state.startsWith('come al alza') ? 'pos' : t.state.includes('baja') ? 'neg' : 'warn'}">${esc(t.state)}</span>`; };
  const kv = (k, v) => `<span style="white-space:nowrap"><small class="mute">${k}</small> <b>${v}</b></span>`;
  box.innerHTML = card(`Top 10 · ${esc(METHODS[state.method].name)}`, `<div>
    ${top.map(({ r, res }, i) => { const t = T(r.sym); return `<div data-s="${esc(r.sym)}" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--line)">
      <div style="display:grid;grid-template-columns:26px auto minmax(0,1fr) auto;gap:8px;align-items:center"><span class="mute">${i + 1}</span>${logoHTML(r.sym, 26)}<div style="min-width:0"><b>${esc(r.sym)}</b> <span class="${VERD[res.verdict][1]}" style="font-size:12px">· ${VERD[res.verdict][0]}</span><br><small class="mute" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.S.m.profile.companyName || '')}</small></div><div style="text-align:right"><b style="font-size:20px">${res.score}</b><br><small class="mute">nota</small></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0 34px;font-size:12px">${kv('Precio', num(r.S.m.price))}${kv('Entrada', isNum(res.entry) ? num(res.entry) : '—')}${kv('Objetivo', isNum(res.target) ? num(res.target) : '—')}${kv('Cocodrilo', techCell(r.sym))}${kv('Stop técnico', t && isNum(t.stop) ? num(t.stop) : '—')}</div></div>`; }).join('')}
    </div><p class="note">Toca una empresa para ver cada criterio con sus datos. Importes en la moneda de cotización. Entrada y objetivo salen de las reglas del método; el stop técnico sale del cocodrilo (último fractal inferior bajo el precio) y no es parte del método fundamental.</p><div id="det"></div>`)
    + `<details class="card" style="margin-top:14px"><summary style="padding:12px 16px;cursor:pointer;font-weight:600">Resto de empresas analizadas (${Math.max(0, ranked.length - 10)})${fails.length ? ` · sin datos: ${fails.length}` : ''}</summary><div class="cb">
      ${ranked.slice(10).map(({ r, res }, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="#/c/${encodeURIComponent(r.sym)}/resumen">${i + 11}. <b>${esc(r.sym)}</b> <span class="mute">${esc((r.S.m.profile.companyName || '').slice(0, 30))}</span></a><span><b>${res.score}</b> · <span class="${VERD[res.verdict][1]}">${VERD[res.verdict][0]}</span></span></div>`).join('')}
      ${fails.length ? `<p class="note" style="margin-top:8px">Sin datos suficientes: ${fails.map((f) => `${esc(f.sym)} (${esc(f.error)})`).join(' · ')}</p>` : ''}</div></details>`;
  box.querySelectorAll('#mr [data-s]').forEach((tr) => (tr.onclick = () => detail(box, ranked.find((x) => x.r.sym === tr.dataset.s))));
}

function detail(box, item) {
  if (!item) return;
  const { r, res } = item, m = r.S.m, t = state.techs.get(r.sym), cur = m.tradeCur || '';
  const icon = (ok) => (ok === true ? '<span class="pos">✓</span>' : ok === false ? '<span class="neg">✕</span>' : '<span class="mute">?</span>');
  box.querySelector('#det').innerHTML = `<div class="card" style="margin-top:12px"><header><h3>${esc(r.sym)} · ${esc(m.profile.companyName || '')}</h3><a class="btn sm" href="#/c/${encodeURIComponent(r.sym)}/resumen">Ficha completa</a></header><div class="cb">
    ${res.checks.map((c) => `<div style="display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">${icon(c.ok)}<div><b>${esc(c.t)}</b> — ${esc(c.v)}<br><small class="mute">${esc(c.rule)}</small></div></div>`).join('')}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px">
      <div class="kpi"><span>Entrada (método)</span><b>${isNum(res.entry) ? num(res.entry) + ' ' + esc(cur) : '—'}</b><small>${esc(res.entryNote)}</small></div>
      <div class="kpi"><span>Objetivo (método)</span><b>${isNum(res.target) ? num(res.target) + ' ' + esc(cur) : '—'}</b><small>${esc(res.targetNote)}</small></div>
      <div class="kpi"><span>Salida según el método</span><b>${esc(res.horizon)}</b><small>${esc(res.stopNote)}</small></div>
      <div class="kpi"><span>Cocodrilo (técnico)</span><b>${t && t.state ? esc(t.state) : '—'}</b><small>${t && t.state ? `entrada ${isNum(t.entry) ? 'al romper ' + num(t.entry) : t.state.includes('alza') ? '— (el último fractal ya está superado: tendencia en marcha)' : '— (el cocodrilo no come al alza: no hay entrada técnica)'} · stop ${isNum(t.stop) ? num(t.stop) + ` (fractal del ${esc(t.stopDate)})` : '—'} · cierre ${num(t.close)} del ${esc(t.date)}` : 'se calcula solo para las 10 primeras'}</small></div>
    </div>
    ${t && isNum(t.stop) && isNum(res.target) && isNum(m.price) && m.price > t.stop && res.target > m.price ? `<p class="note">Con entrada al precio actual: riesgo hasta el stop ${pct((m.price - t.stop) / m.price)} · recorrido hasta el objetivo ${pct(res.target / m.price - 1)} · relación ${num((res.target - m.price) / (m.price - t.stop), 1)} a 1.</p>` : ''}
  </div></div>`;
  box.querySelector('#det').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function csv() {
  const ranked = rankMethod(state.method, [...results.values()]);
  exportCSV('metodo_' + state.method, [['Puesto', 'Símbolo', 'Empresa', 'Nota', 'Veredicto', 'Precio', 'Entrada (método)', 'Objetivo (método)', 'Salida', 'Cocodrilo', 'Stop técnico', ...METHODS[state.method].rules.map((_, i) => 'Criterio ' + (i + 1))],
    ...ranked.map(({ r, res }, i) => { const t = state.techs.get(r.sym) || {}; return [i + 1, r.sym, r.S.m.profile.companyName || '', res.score, VERD[res.verdict][0], r.S.m.price, res.entry ?? '', res.target ?? '', res.stopNote, t.state || '', t.stop ?? '', ...res.checks.map((c) => `${c.ok === true ? 'Sí' : c.ok === false ? 'No' : 'Sin dato'}: ${c.v}`)]; })]);
}
