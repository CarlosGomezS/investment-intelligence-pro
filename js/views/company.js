// Ficha completa de empresa: carga de datos, cálculo del análisis y navegación por módulos.
import { data, gather } from '../providers/index.js';
import { buildModel } from '../calc/model.js';
import { evaluateRatios } from '../calc/ratios.js';
import { detectAlerts } from '../calc/alerts.js';
import { score, DEFAULT_WEIGHTS } from '../calc/scoring.js';
import { dcfDefaults, runDcf, multiples, dividendModel, composite } from '../calc/intrinsic.js';
import { buildReport } from '../calc/report.js';
import { store } from '../store.js';
import { esc, num, sgnPct, cls, big, datetime, skeleton, unavailable, toast } from '../ui/dom.js';
import { logoHTML, countryOf } from '../app.js';
import { isNum } from '../calc/finance.js';

export const TABS = [
  ['resumen', 'Resumen'], ['grafico', 'Cotización'], ['estados', 'Estados financieros'], ['ratios', 'Ratios'], ['crecimiento', 'Crecimiento y calidad'],
  ['deuda', 'Deuda y solvencia'], ['valoracion', 'Valoración'], ['dividendos', 'Dividendos'], ['competidores', 'Competidores'], ['moat', 'Ventajas competitivas'],
  ['noticias', 'Noticias y eventos'], ['analistas', 'Analistas e insiders'], ['riesgos', 'Alertas y riesgos'], ['scoring', 'Scoring'], ['informe', 'Informe final'], ['simulador', 'Simulador'],
];
const TAB_MOD = {
  resumen: () => import('./tabs/overview.js'), grafico: () => import('./tabs/chart.js'), estados: () => import('./tabs/statements.js'), ratios: () => import('./tabs/ratios.js'),
  crecimiento: () => import('./tabs/growth.js'), deuda: () => import('./tabs/debt.js'), valoracion: () => import('./tabs/valuation.js'), dividendos: () => import('./tabs/dividends.js'),
  competidores: () => import('./tabs/peers.js'), moat: () => import('./tabs/moat.js'), noticias: () => import('./tabs/news.js'), analistas: () => import('./tabs/analysts.js'),
  riesgos: () => import('./tabs/risks.js'), scoring: () => import('./tabs/scoring.js'), informe: () => import('./tabs/report.js'), simulador: () => import('./tabs/simulator.js'),
};

const cache = new Map(); // símbolo → estado ya calculado durante la sesión

// Carga progresiva: la ficha aparece en cuanto llegan los datos básicos. Lo que tarda más de unos segundos
// sigue descargándose en segundo plano y la vista se actualiza sola al llegar (late).
const ESSENTIAL = ['quote', 'income', 'balance', 'cashflow', 'prices'];
function timed(fn, ms, key, late) {
  const p = fn().then((v) => ({ ok: true, ...v }), (e) => ({ ok: false, error: e }));
  let done = false;
  p.then((r) => { if (done && late) late(key, r); });
  return Promise.race([p, new Promise((res) => setTimeout(() => { done = true; res({ ok: false, pending: true, error: { code: 'timeout', message: 'Aún descargando…' } }); }, ms))]);
}

async function load(sym, onProgress, late) {
  const from = '1980-01-01';
  // El perfil va primero: aporta nombre, ISIN y país, que necesitan SEC, ESEF y ROIC.AI para localizar la empresa.
  const first = await timed(() => data.profile(sym), 15000, 'profile');
  const jobs = {
    quote: () => data.quote(sym), priceChange: () => data.priceChange(sym),
    income: () => data.income(sym, 'annual', 15), balance: () => data.balance(sym, 'annual', 15), cashflow: () => data.cashflow(sym, 'annual', 15),
    incomeTTM: () => data.incomeTTM(sym), balanceTTM: () => data.balanceTTM(sym), cashflowTTM: () => data.cashflowTTM(sym),
    ratios: () => data.ratios(sym, 'annual', 15), keyMetrics: () => data.keyMetrics(sym, 'annual', 15), ratiosTTM: () => data.ratiosTTM(sym), keyMetricsTTM: () => data.keyMetricsTTM(sym),
    scores: () => data.scores(sym), estimates: () => data.estimates(sym, 'annual', 10), priceTarget: () => data.priceTarget(sym), gradesConsensus: () => data.gradesConsensus(sym),
    dcf: () => data.dcf(sym), dividends: () => data.dividends(sym), splits: () => data.splits(sym), earnings: () => data.earnings(sym),
    treasury: () => data.treasury(new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)), riskPremium: () => data.riskPremium(),
    prices: () => data.pricesDaily(sym, from),
  };
  const keys = Object.keys(jobs); let n = 0;
  const res = await Promise.all(keys.map((k) => timed(jobs[k], ESSENTIAL.includes(k) ? 20000 : 7000, k, late).then((r) => { n++; onProgress && onProgress(n, keys.length); return r; })));
  const raw = Object.fromEntries(keys.map((k, i) => [k, res[i]]));
  raw.profile = first;
  fixQuote(raw, sym);
  if (!raw.profile.ok && !raw.income.ok) { const e = raw.profile.error || raw.income.error; throw e; }
  // Conversión de divisa si los estados están en otra moneda que la cotización (p. ej. ADR)
  let fx = 1;
  const rep = raw.income.ok && raw.income.data[0] ? raw.income.data[0].reportedCurrency : null;
  const trade = raw.profile.ok ? raw.profile.data.currency : null;
  if (rep && trade && rep !== trade) {
    try { const f = await data.fx(`${rep}${trade}`); fx = f.data && f.data.price ? f.data.price : 1; raw.fx = { ok: true, ...f }; }
    catch (e) { raw.fx = { ok: false, error: e }; }
  }
  return { raw, fx };
}

// Sin cotización directa: se usa el último cierre del histórico (indicado como tal)
function fixQuote(raw, sym) {
  if (!raw.quote.ok && raw.prices && raw.prices.ok && raw.prices.data.length) {
    const L = raw.prices.data[raw.prices.data.length - 1], P2 = raw.prices.data[raw.prices.data.length - 2];
    raw.quote = { ok: true, data: { symbol: sym, price: L.close, changePercentage: P2 ? (L.close / P2.close - 1) * 100 : null, timestamp: L.date }, source: raw.prices.source + ' (último cierre)', endpoint: 'histórico', fetchedAt: raw.prices.fetchedAt };
  }
}

export function compute(S) {
  const m = buildModel(S.raw, S.fx);
  m.priceData = S.raw.prices.ok ? S.raw.prices.data : [];
  const ratios = evaluateRatios(m);
  const alerts = detectAlerts(m);
  const d = dcfDefaults(m);
  const saved = store.assumptions(m.symbol) || {};
  const inputs = {
    fcf0: saved.fcf0 ?? d.fcfBase.value, growth: saved.growth ?? d.growth.value, years: saved.years ?? d.years.value, terminalGrowth: saved.terminalGrowth ?? d.terminalGrowth.value,
    rf: saved.rf ?? d.rf.value, beta: saved.beta ?? d.beta.value, erp: saved.erp ?? d.erp.value, costDebt: saved.costDebt ?? d.costDebt.value,
    waccOverride: saved.waccOverride ?? null, netDebt: d.netDebt.value, shares: d.shares.value,
  };
  // WACC recalculado con los supuestos (editables)
  const E = m.marketCap || 0, D = m.X(m.T.debt) || 0, tax = m.market.wacc ? null : 0.21;
  const ke = isNum(inputs.rf) && isNum(inputs.beta) && isNum(inputs.erp) ? inputs.rf + inputs.beta * inputs.erp : null;
  const kd = isNum(inputs.costDebt) ? inputs.costDebt * (1 - (m.T.taxRate ?? tax ?? 0.21)) : ke;
  const waccCalc = isNum(ke) ? (E / (E + D || 1)) * ke + (D / (E + D || 1)) * (kd ?? ke) : null;
  inputs.ke = ke; inputs.wacc = isNum(inputs.waccOverride) ? inputs.waccOverride : waccCalc;
  const dcfRes = runDcf(m, inputs);
  const mult = multiples(m, S.peers ? S.peers.rows : null);
  const ddmRes = dividendModel(m, ke);
  const comp = composite(m, dcfRes, mult, ddmRes);
  const moatUser = (() => { const v = store.moat(m.symbol); const vals = Object.values(v.items || {}).filter(isNum); return vals.length >= 4 ? (vals.reduce((a, b) => a + b, 0) / (vals.length * 2)) * 100 : null; })();
  const weights = store.weights() || DEFAULT_WEIGHTS;
  const sc = score(m, { alerts, mos: comp.mos, prices: m.priceData, moatUser }, weights);
  const val = { defaults: d, inputs, dcf: dcfRes, mult, ddm: ddmRes, composite: comp };
  const rep = buildReport(m, sc, val, alerts);
  Object.assign(S, { m, ratios, alerts, val, sc, rep, weights });
  return S;
}

export function recompute(S) { compute(S); }

function header(S) {
  const { m } = S, p = m.profile, q = m.quote;
  const fav = store.isFav(m.symbol);
  const lists = Object.keys(store.lists());
  const ch = q.changePercentage ?? p.changePercentage;
  const upd = S.raw.quote.ok ? S.raw.quote.fetchedAt : S.raw.profile.fetchedAt;
  return `<div class="chead">
    ${logoHTML(m.symbol, 52)}
    <div><h1>${esc(p.companyName || m.symbol)}</h1>
      <div class="meta"><span class="mono">${esc(m.symbol)}</span><span>${esc(p.exchangeFullName || p.exchange || '')}</span><span>${esc(countryOf({ symbol: m.symbol, exchange: p.exchange }) || p.country || '')}</span><span>${esc(p.sector || '')}${p.industry ? ' · ' + esc(p.industry) : ''}</span>${p.isin ? `<span class="mono">ISIN ${esc(p.isin)}</span>` : ''}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm ${fav ? 'on' : ''}" id="favb"><svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>${fav ? 'En seguimiento' : 'Seguir'}</button>
        ${lists.length > 1 ? `<select class="in" id="listsel" style="width:auto;height:28px;font-size:12px"><option value="">Añadir a lista…</option>${lists.map((l) => `<option ${store.inList(l, m.symbol) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
        <a class="btn sm" href="#/comparar?s=${encodeURIComponent(m.symbol)}">Comparar</a>
        <button class="btn sm" id="saveb">Guardar análisis</button>
        <button class="btn sm" id="reloadb" title="Ignorar caché y volver a descargar">Actualizar</button>
      </div>
    </div>
    <div class="px"><b>${num(m.price, 2)} <small class="mute" style="font-size:14px">${esc(m.tradeCur)}</small></b><span class="${cls(ch)}">${sgnPct(isNum(ch) ? ch / 100 : null, 2)} hoy</span><div class="note">${datetime(upd)}</div></div>
  </div>
  ${m.repCur !== m.tradeCur ? `<div class="empty" style="margin-bottom:12px">Los estados financieros están en <b>${esc(m.repCur)}</b> y la acción cotiza en <b>${esc(m.tradeCur)}</b>. Para ratios y valoración se convierten al tipo ${esc(m.repCur)}/${esc(m.tradeCur)} = ${num(m.fx, 4)}${S.raw.fx && S.raw.fx.ok ? ` (${datetime(S.raw.fx.fetchedAt)})` : ' — no se pudo obtener el tipo de cambio: las cifras por acción no son comparables'}.</div>` : ''}`;
}

function tabs(sym, cur) {
  return `<nav class="tabs" aria-label="Módulos">${TABS.map(([k, l]) => `<a href="#/c/${encodeURIComponent(sym)}/${k}" class="${k === cur ? 'on' : ''}">${l}</a>`).join('')}</nav><div id="tab"></div>`;
}

export async function render(view, [symRaw, tab = 'resumen']) {
  const sym = (symRaw || '').toUpperCase();
  let S = cache.get(sym);
  if (!S || view.dataset.loaded !== sym) {
    if (!S) {
      view.innerHTML = `<div class="chead">${logoHTML(sym, 52)}<div><h1>${esc(sym)}</h1><div class="meta">Descargando estados financieros, cotizaciones, ratios, estimaciones y dividendos…</div></div></div>${skeleton(4)}`;
      try {
        const meta = view.querySelector('.chead .meta');
        let lateTimer = null;
        const late = (k, r) => {
          const St = cache.get(sym); if (!St || !r.ok) return;
          St.raw[k] = r; if (k === 'prices') fixQuote(St.raw, sym);
          clearTimeout(lateTimer);
          lateTimer = setTimeout(() => { compute(St); if (view.dataset.loaded === sym) { const t = location.hash.split('/')[3] || 'resumen'; view.dataset.loaded = ''; render(view, [sym, t]); toast('Datos completados'); } }, 800);
        };
        const { raw, fx } = await load(sym, (i, t) => { if (meta) meta.textContent = `Descargando datos… ${i} de ${t}`; }, late);
        S = { sym, raw, fx, extra: {} };
        compute(S);
        cache.set(sym, S);
        store.pushHistory({ symbol: sym, name: S.m.profile.companyName, exchange: S.m.profile.exchange });
      } catch (e) {
        view.innerHTML = `<div class="chead">${logoHTML(sym, 52)}<div><h1>${esc(sym)}</h1></div></div>${unavailable('No se pudo cargar la empresa', e)}<p class="note">Comprueba el ticker (las bolsas europeas llevan sufijo: SAN.MC, SAP.DE, MC.PA, ASML.AS) o busca por nombre arriba. Para empresas de fuera de EE. UU. añade en Ajustes la clave gratuita de ROIC.AI y el Worker (SEC EDGAR y cuentas europeas ESEF).</p>`;
        return;
      }
    }
    view.dataset.loaded = sym;
    view.innerHTML = `<div id="chead">${header(S)}</div>${tabs(sym, tab)}`;
    bindHeader(view, S);
  } else {
    view.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.getAttribute('href').endsWith('/' + tab)));
  }
  const el = view.querySelector('#tab');
  const modf = TAB_MOD[tab] || TAB_MOD.resumen;
  el.innerHTML = skeleton(2);
  const mod = await modf();
  try { await mod.render(el, S, { recompute: () => compute(S), rerender: () => render(view, [sym, tab]) }); }
  catch (e) { console.error(e); el.innerHTML = `<div class="empty">Error en el módulo: ${esc(e.message)}</div>`; }
}

function bindHeader(view, S) {
  const m = S.m;
  view.querySelector('#favb').onclick = () => { store.toggle('Favoritos', { symbol: m.symbol, name: m.profile.companyName, exchange: m.profile.exchange }); view.querySelector('#chead').innerHTML = header(S); bindHeader(view, S); };
  const ls = view.querySelector('#listsel');
  if (ls) ls.onchange = () => { if (ls.value) { store.toggle(ls.value, { symbol: m.symbol, name: m.profile.companyName, exchange: m.profile.exchange }); toast(store.inList(ls.value, m.symbol) ? `Añadida a ${ls.value}` : `Quitada de ${ls.value}`); } };
  view.querySelector('#saveb').onclick = () => {
    store.saveAnalysis({ symbol: m.symbol, name: m.profile.companyName, at: Date.now(), price: m.price, currency: m.tradeCur, score: S.sc.total, intrinsic: S.val.composite.value, mos: S.val.composite.mos, conclusion: S.rep.conclusion, dcf: S.val.dcf && S.val.dcf.perShare, inputs: S.val.inputs });
    toast('Análisis guardado en el historial');
  };
  view.querySelector('#reloadb').onclick = async () => {
    const { clearCache } = await import('../providers/http.js');
    await clearCache(); cache.delete(m.symbol); view.dataset.loaded = '';
    const tab = location.hash.split('/')[3] || 'resumen';
    render(view, [m.symbol, tab]);
  };
}

/** Carga perezosa de bloques extra (noticias, competidores…) con memoria por empresa. */
export async function extra(S, key, fn) {
  if (S.extra[key]) return S.extra[key];
  const r = await fn();
  S.extra[key] = r; return r;
}
export { big };
