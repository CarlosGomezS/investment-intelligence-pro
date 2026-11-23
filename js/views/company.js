// Ficha completa de empresa: carga de datos, cálculo del análisis y navegación por módulos.
import { data, gather, forget } from '../providers/index.js?v=f2479787';
import { fxRate } from '../providers/fxrate.js?v=f2479787';
import { buildModel } from '../calc/model.js?v=f2479787';
import { evaluateRatios } from '../calc/ratios.js?v=f2479787';
import { detectAlerts } from '../calc/alerts.js?v=f2479787';
import { score, DEFAULT_WEIGHTS } from '../calc/scoring.js?v=f2479787';
import { dcfDefaults, runDcf, multiples, dividendModel, composite } from '../calc/intrinsic.js?v=f2479787';
import { reliability } from '../calc/reliability.js?v=f2479787';
import { decide } from '../calc/decision.js?v=f2479787';
import { buildReport } from '../calc/report.js?v=f2479787';
import { store } from '../store.js?v=f2479787';
import { esc, num, sgnPct, cls, big, datetime, skeleton, unavailable, toast } from '../ui/dom.js?v=f2479787';
import { logoHTML, countryOf } from '../app.js?v=f2479787';
import { isNum } from '../calc/finance.js?v=f2479787';

export const TABS = [
  ['resumen', 'Resumen'], ['grafico', 'Cotización'], ['estados', 'Estados financieros'], ['ratios', 'Ratios'], ['crecimiento', 'Crecimiento y calidad'],
  ['deuda', 'Deuda y solvencia'], ['valoracion', 'Valoración'], ['dividendos', 'Dividendos'], ['competidores', 'Competidores'], ['moat', 'Ventajas competitivas'],
  ['noticias', 'Noticias y eventos'], ['analistas', 'Analistas e insiders'], ['riesgos', 'Alertas y riesgos'], ['scoring', 'Scoring'], ['informe', 'Informe final'], ['simulador', 'Simulador'],
];
const TAB_MOD = {
  resumen: () => import('./tabs/overview.js?v=f2479787'), grafico: () => import('./tabs/chart.js?v=f2479787'), estados: () => import('./tabs/statements.js?v=f2479787'), ratios: () => import('./tabs/ratios.js?v=f2479787'),
  crecimiento: () => import('./tabs/growth.js?v=f2479787'), deuda: () => import('./tabs/debt.js?v=f2479787'), valoracion: () => import('./tabs/valuation.js?v=f2479787'), dividendos: () => import('./tabs/dividends.js?v=f2479787'),
  competidores: () => import('./tabs/peers.js?v=f2479787'), moat: () => import('./tabs/moat.js?v=f2479787'), noticias: () => import('./tabs/news.js?v=f2479787'), analistas: () => import('./tabs/analysts.js?v=f2479787'),
  riesgos: () => import('./tabs/risks.js?v=f2479787'), scoring: () => import('./tabs/scoring.js?v=f2479787'), informe: () => import('./tabs/report.js?v=f2479787'), simulador: () => import('./tabs/simulator.js?v=f2479787'),
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
    spy: () => data.pricesDaily('SPY', new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10)),
  };
  const keys = Object.keys(jobs); let n = 0;
  const res = await Promise.all(keys.map((k) => timed(jobs[k], ESSENTIAL.includes(k) ? 20000 : 7000, k, late).then((r) => { n++; onProgress && onProgress(n, keys.length); return r; })));
  const raw = Object.fromEntries(keys.map((k, i) => [k, res[i]]));
  raw.profile = first;
  fixQuote(raw, sym);
  if (!raw.profile.ok && !raw.income.ok) { const e = raw.profile.error || raw.income.error; throw e; }
  // ETF o fondo: no tiene cuentas propias que analizar (p. ej. los ETF «SpaceX» apalancados)
  if (raw.profile.ok) {
    const p = raw.profile.data || {};
    if (p.isEtf || p.isFund || (!raw.income.ok && /\b(ETF|FUND|TRUST UNIT|2X|3X|DAILY TARGET|BULL|BEAR)\b/i.test(p.companyName || ''))) {
      throw Object.assign(new Error(`${p.companyName || sym} es un fondo cotizado (ETF), no una empresa: no publica cuentas, así que el análisis fundamental no aplica. Busca la empresa en sí (por ejemplo, SpaceX es SPCX)`), { code: 'etf' });
    }
  }
  // Conversión de divisa si los estados están en otra moneda que la cotización (p. ej. ADR)
  const fx = await fxFor(raw);
  return { raw, fx };
}

// Sin cotización directa: se usa el último cierre del histórico (indicado como tal)
// Tipo de cambio estados → cotización. Si falla, null: la valoración no se calcula (no se supone 1).
export async function fxFor(raw) {
  // Moneda de los estados: la del ejercicio más reciente; de cotización: la del perfil o, si no la trae, la de la cotización
  const inc = raw.income && raw.income.ok ? [...(raw.income.data || [])].sort((a, b) => String(b.date || b.fiscalYear).localeCompare(String(a.date || a.fiscalYear))) : [];
  const rep = inc[0] ? inc[0].reportedCurrency : null;
  const q = raw.quote && raw.quote.ok && raw.quote.data ? raw.quote.data : {};
  const trade = (typeof q.price === 'number' && Number.isFinite(q.price) && q.currency) || (raw.profile && raw.profile.ok && raw.profile.data.currency) || q.currency || 'USD'; // misma regla que el modelo
  if (!rep || !trade || rep === trade) return 1;
  const r = await fxRate(rep, trade);
  raw.fx = r.rate ? r.res : { ok: false, error: r.error };
  return r.rate;
}

function fixQuote(raw, sym) {
  if (!raw.quote.ok && raw.prices && raw.prices.ok && raw.prices.data.length) {
    const L = raw.prices.data[raw.prices.data.length - 1], P2 = raw.prices.data[raw.prices.data.length - 2];
    raw.quote = { ok: true, data: { symbol: sym, price: L.close, changePercentage: P2 ? (L.close / P2.close - 1) * 100 : null, timestamp: L.date }, source: raw.prices.source + ' (último cierre)', endpoint: 'histórico', fetchedAt: raw.prices.fetchedAt };
  }
}

export function compute(S) {
  const m = buildModel(S.raw, S.fx);
  // Sin ficha de empresa (ninguna fuente la da): se sigue con el símbolo para no romper el análisis
  if (!m.symbol) m.symbol = S.sym;
  if (!m.profile.symbol) m.profile = { ...m.profile, symbol: S.sym, companyName: m.profile.companyName || S.sym };
  m.priceData = m.prices && m.prices.length ? m.prices : S.raw.prices.ok ? S.raw.prices.data : []; // ya ajustados a splits si hacía falta
  const d = dcfDefaults(m);
  const saved = S.noSaved ? {} : store.assumptions(m.symbol) || {}; // en análisis masivo, siempre supuestos por defecto
  const inputs = {
    fcf0: saved.fcf0 ?? d.fcfBase.value, growth: saved.growth ?? d.growth.value, years: saved.years ?? d.years.value, terminalGrowth: saved.terminalGrowth ?? d.terminalGrowth.value,
    rf: saved.rf ?? d.rf.value, beta: saved.beta ?? d.beta.value, erp: saved.erp ?? d.erp.value, costDebt: saved.costDebt ?? d.costDebt.value,
    waccOverride: saved.waccOverride ?? null, netDebt: d.netDebt.value, shares: d.shares.value,
  };
  // WACC recalculado con los supuestos (editables)
  const E = m.marketCap || 0, D = m.X(m.T.debt) || 0, tax = m.market.wacc ? null : 0.21;
  const ke = isNum(inputs.rf) && isNum(inputs.beta) && isNum(inputs.erp) ? inputs.rf + inputs.beta * inputs.erp : null;
  const kd = isNum(inputs.costDebt) ? inputs.costDebt * (1 - (m.market.taxAvg ?? m.T.taxRate ?? tax ?? 0.21)) : ke; // mismo impuesto medio 3a que el modelo
  const we = E > 0 ? E / (E + D) : 1; // sin capitalización: solo coste del capital propio
  const waccCalc = isNum(ke) ? we * ke + (1 - we) * (kd ?? ke) : null;
  inputs.ke = ke; inputs.wacc = isNum(inputs.waccOverride) ? inputs.waccOverride : waccCalc;
  // El WACC que fijes en Valoración se usa en todo el análisis (ROIC frente a WACC, foso, informe), no solo en el DCF
  const userSet = ['rf', 'beta', 'erp', 'costDebt', 'waccOverride'].some((k) => saved[k] != null);
  if (userSet && isNum(inputs.wacc)) m.market.wacc = { ...(m.market.wacc || {}), wacc: inputs.wacc, ke, user: true, kdAssumed: !isNum(inputs.costDebt) && we < 1 };
  const ratios = evaluateRatios(m);
  const alerts = detectAlerts(m);
  const dcfRes = runDcf(m, inputs);
  const mult = multiples(m, S.peers ? S.peers.rows : null);
  const ddmRes = dividendModel(m, ke);
  const comp = composite(m, dcfRes, mult, ddmRes);
  const moatUser = (() => { const v = store.moat(m.symbol); const vals = Object.values(v.items || {}).filter(isNum); return vals.length >= 4 ? (vals.reduce((a, b) => a + b, 0) / (vals.length * 2)) * 100 : null; })();
  const weights = store.weights() || DEFAULT_WEIGHTS;
  const sc = score(m, { alerts, mos: comp.mos, prices: m.priceData, moatUser }, weights);
  const val = { defaults: d, inputs, dcf: dcfRes, mult, ddm: ddmRes, composite: comp };
  val.reliability = reliability(m, val, sc, S.raw); // cuánto fiarse del valor intrínseco, con sus motivos
  const dec = decide(m, sc, val, alerts); // cuatro ejes separados: calidad, valoración, potencial y riesgo
  const rep = buildReport(m, sc, val, alerts, dec); // misma calidad y misma conclusión que la decisión
  Object.assign(S, { m, ratios, alerts, val, sc, rep, dec, weights });
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
        <select class="in" id="dlsel" style="width:auto;height:28px;font-size:12px" aria-label="Descargar todo"><option value="">⬇ Descargar todo…</option><option value="xlsx">Excel (todas las hojas)</option><option value="csv">CSV (ZIP, un archivo por bloque)</option><option value="txt">Informe completo TXT</option><option value="json">Datos en bruto JSON</option><option value="copy">Copiar informe al portapapeles</option></select>
      </div>
    </div>
    <div class="px"><b>${num(m.price, 2)} <small class="mute" style="font-size:14px">${esc(m.tradeCur)}</small></b><span class="${cls(ch)}">${sgnPct(isNum(ch) ? ch / 100 : null, 2)} hoy</span><div class="note">${datetime(upd)}${S.raw.quote && S.raw.quote.stale ? ' · <b class="warn">precio en caché, no actualizado</b>' : ''}</div></div>
  </div>
  ${(() => { const n = []; if (m.balanceFrom) n.push(`el balance de ${esc(m.last.year)} aún no está disponible: deuda, caja y liquidez son las de ${esc(m.balanceFrom)}`); if (m.sharesNote) n.push(`número de acciones ${esc(m.sharesNote)}`); if (m.repCurAssumed) n.push(m.fxMissing ? 'la fuente no indica en qué moneda están las cuentas: no se calcula nada que cruce precio y cuentas (PER, valoración, rentabilidades) para no mezclar monedas' : `la fuente no indica la moneda de las cuentas: se suponen dólares (empresa de EE. UU. que cotiza en dólares)`); const ly = m.years[m.years.length - 1] || {}; if (ly.taxAssumed) n.push('el último ejercicio no permite calcular el tipo impositivo real: la rentabilidad del capital (ROIC) usa un 21 % supuesto'); if (m.ttmPartial) n.push('tu fuente da los últimos 12 meses sin flujos de caja: para no mezclar periodos, todo se calcula con el último ejercicio cerrado'); if (m.ttmFilled && m.ttmFilled.length) n.push(`en los últimos 12 meses faltan partidas en tu fuente; se usan las del último ejercicio para: ${esc(m.ttmFilled.filter((k) => /fcf|ocf|capex|dividends|buybacks|sbc|netDebt|debt|cash|equity/i.test(k)).slice(0, 6).join(', ') || 'otras partidas')}`); return n.length ? `<div class="empty" style="margin-bottom:12px"><b>Datos a tener en cuenta:</b> ${n.join(' · ')}.</div>` : ''; })()}
  ${m.repCur !== m.tradeCur ? `<div class="empty" style="margin-bottom:12px">Los estados financieros están en <b>${esc(m.repCur)}</b> y la acción cotiza en <b>${esc(m.tradeCur)}</b>. ${isNum(m.fx) ? `Para ratios y valoración se convierten al tipo ${esc(m.repCur)}/${esc(m.tradeCur)} = ${num(m.fx, 4)}${S.raw.fx && S.raw.fx.ok ? ` (${datetime(S.raw.fx.fetchedAt)})` : ''}.` : '<b class="neg">No se pudo obtener el tipo de cambio:</b> la valoración, el PER y todo lo que cruza precio con cuentas queda sin calcular para no darte cifras falsas. Pulsa «Actualizar» en unos minutos.'}</div>` : ''}`;
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
        let lateTimer = null, needFx = false; // needFx se acumula: otro bloque tardío no puede cancelar el recálculo del tipo de cambio
        const late = (k, r) => {
          const St = cache.get(sym); if (!St || !r.ok) return;
          St.raw[k] = r; if (k === 'prices') fixQuote(St.raw, sym);
          clearTimeout(lateTimer);
          if (['income', 'profile', 'quote'].includes(k)) needFx = true;
          lateTimer = setTimeout(async () => { if (needFx || !isNum(St.fx)) { St.fx = await fxFor(St.raw); needFx = false; } compute(St); if (view.dataset.loaded === sym) { const t = location.hash.split('/')[3] || 'resumen'; view.dataset.loaded = ''; render(view, [sym, t]); toast('Datos completados'); } }, 800);
        };
        const { raw, fx } = await load(sym, (i, t) => { if (meta) meta.textContent = `Descargando datos… ${i} de ${t}`; }, late);
        S = { sym, raw, fx, extra: {} };
        compute(S);
        cache.set(sym, S);
        store.pushHistory({ symbol: sym, name: S.m.profile.companyName, exchange: S.m.profile.exchange });
        // Competidores en segundo plano: completan la valoración por múltiplos y la comparación sectorial
        import('./tabs/peers.js?v=f2479787').then(({ loadPeers }) => loadPeers(S)).then(() => {
          compute(S);
          const t = location.hash.split('/')[3] || 'resumen';
          if (view.dataset.loaded === sym && ['resumen', 'valoracion', 'informe', 'ratios', 'scoring'].includes(t)) { view.dataset.loaded = ''; render(view, [sym, t]); }
        }).catch(() => {});
      } catch (e) {
        view.innerHTML = `<div class="chead">${logoHTML(sym, 52)}<div><h1>${esc(sym)}</h1></div></div>${unavailable('No se pudo cargar la empresa', e)}${e && e.tried ? `<p class="note">Respuesta de cada fuente: ${esc(e.tried)}</p>` : ''}${e && e.code === 'etf' ? '' : `<p class="note">Comprueba el ticker (las bolsas europeas llevan sufijo: SAN.MC, SAP.DE, MC.PA, ASML.AS) o busca por nombre arriba. Para empresas de fuera de EE. UU. añade en Ajustes la clave gratuita de ROIC.AI y el Worker (SEC EDGAR y cuentas europeas ESEF).</p>`}`;
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
  view.querySelector('#dlsel').onchange = async (e) => {
    const f = e.target.value; e.target.value = ''; if (!f) return;
    try {
      const { exportAll } = await import('../exportall.js?v=f2479787');
      const r = await exportAll(S, f);
      toast(r === 'copied' ? 'Informe copiado: pégalo en notas o WhatsApp' : r === 'shared' ? 'Archivo listo para compartir/guardar' : r === 'downloaded' ? 'Descarga iniciada' : r === 'cancel' ? 'Cancelado' : 'Tu app no permite descargas: usa «Copiar informe»');
    } catch (err) { toast('No se pudo exportar: ' + err.message); }
  };
  view.querySelector('#reloadb').onclick = async () => {
    const { clearCache } = await import('../providers/http.js?v=f2479787');
    const base = m.symbol.split('.')[0], p = m.profile || {};
    const cik = p.cik ? 'CIK' + String(p.cik).replace(/^0+/, '').padStart(10, '0') : null;
    await clearCache(m.symbol, [`symbol=${encodeURIComponent(base)}&`, cik, p.isin, p.isin && `isin=${p.isin}`]); forget(m.symbol); cache.delete(m.symbol); view.dataset.loaded = ''; // solo esta empresa
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
