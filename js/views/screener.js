// Screener en dos fases: 1) filtro de universo en el proveedor (capitalización, sector, país, dividendo, beta…);
// 2) enriquecimiento con ratios TTM de los N primeros para filtrar por calidad, crecimiento y valoración.
import { data, gather } from '../providers/index.js?v=cc3b3e4a';
import { esc, card, num, pct, big, mult, unavailable, toast, source } from '../ui/dom.js?v=cc3b3e4a';
import { logoHTML } from '../app.js?v=cc3b3e4a';
import { isNum, asc } from '../calc/finance.js?v=cc3b3e4a';
import { exportCSV } from '../export.js?v=cc3b3e4a';

const SECTORS = ['', 'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical', 'Consumer Defensive', 'Industrials', 'Communication Services', 'Energy', 'Utilities', 'Real Estate', 'Basic Materials'];
const SECT_ES = { Technology: 'Tecnología', Healthcare: 'Salud', 'Financial Services': 'Financiero', 'Consumer Cyclical': 'Consumo cíclico', 'Consumer Defensive': 'Consumo defensivo', Industrials: 'Industria', 'Communication Services': 'Comunicaciones', Energy: 'Energía', Utilities: 'Utilities', 'Real Estate': 'Inmobiliario', 'Basic Materials': 'Materiales' };
const COUNTRIES = [['', 'Todos'], ['US', 'EE. UU.'], ['ES', 'España'], ['DE', 'Alemania'], ['FR', 'Francia'], ['NL', 'Países Bajos'], ['GB', 'Reino Unido'], ['CH', 'Suiza'], ['IT', 'Italia'], ['JP', 'Japón'], ['CA', 'Canadá'], ['DK', 'Dinamarca']];
const PRESETS = {
  infra: { label: 'Infravaloradas de calidad', f: { roic: 12, nde: 2, fcfy: 5, pe: 20 } },
  roic: { label: 'ROIC alto y deuda reducida', f: { roic: 15, nde: 1 } },
  fcf: { label: 'FCF creciente 3 años', f: { fcfUp: true } },
  div: { label: 'Dividendo sostenible', f: { dy: 3, payout: 70 } },
  growth: { label: 'Crecimiento rentable', f: { gm: 40, roic: 12, revG: 10 } },
};
let last = null;

export function render(view) {
  view.innerHTML = `<h1 style="font-size:22px;margin-bottom:14px">Screener de acciones</h1>
  <div class="grid g2">
    ${card('1 · Universo', `<form id="u" class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <label class="f">Capitalización mínima (miles de M)<input class="in" id="mc" type="number" value="10" step="1"></label>
      <label class="f">Capitalización máxima (miles de M)<input class="in" id="mx" type="number" placeholder="sin límite"></label>
      <label class="f">Sector<select class="in" id="sec">${SECTORS.map((s) => `<option value="${s}">${s ? SECT_ES[s] : 'Todos'}</option>`).join('')}</select></label>
      <label class="f">País<select class="in" id="cty">${COUNTRIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="f">Dividendo anual mínimo por acción<input class="in" id="dv" type="number" step="0.1" placeholder="0"></label>
      <label class="f">Beta máxima<input class="in" id="bt" type="number" step="0.1" placeholder="sin límite"></label>
      <label class="f">Número de resultados<select class="in" id="lim"><option>50</option><option selected>100</option><option>250</option></select></label>
      <div class="f" style="align-self:end"><button class="btn pri">Buscar universo</button></div></form>`)}
    ${card('2 · Filtros de calidad, crecimiento y valoración', `<div class="chips" id="pre" style="margin-bottom:10px">${Object.entries(PRESETS).map(([k, p]) => `<button class="chip" data-p="${k}">${p.label}</button>`).join('')}</div>
      <form id="q" class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      <label class="f">ROIC mín. %<input class="in" id="f_roic" type="number"></label><label class="f">Margen bruto mín. %<input class="in" id="f_gm" type="number"></label><label class="f">Crec. ventas mín. %<input class="in" id="f_revG" type="number"></label>
      <label class="f">PER máx.<input class="in" id="f_pe" type="number"></label><label class="f">Rent. FCF mín. %<input class="in" id="f_fcfy" type="number"></label><label class="f">Deuda neta/EBITDA máx.<input class="in" id="f_nde" type="number" step="0.1"></label>
      <label class="f">Rent. dividendo mín. %<input class="in" id="f_dy" type="number" step="0.1"></label><label class="f">Payout máx. %<input class="in" id="f_payout" type="number"></label><label class="f"><span><input type="checkbox" id="f_fcfUp"> FCF creciente 3 años</span></label>
      <label class="f">Analizar los primeros<select class="in" id="n"><option>10</option><option selected>20</option><option>40</option></select></label>
      <div class="f" style="align-self:end;grid-column:span 2"><button class="btn pri">Aplicar filtros</button></div></form>
      <p class="note">Cada empresa analizada consume 2 peticiones (3 con «FCF creciente» o crecimiento de ventas). Los datos se guardan 24 h en caché.</p>`)}
  </div><div id="res" style="margin-top:14px"></div>`;
  const res = view.querySelector('#res');
  const g = (id) => { const v = view.querySelector('#' + id).value; return v === '' ? undefined : v; };
  view.querySelector('#u').onsubmit = async (e) => {
    e.preventDefault(); res.innerHTML = '<div class="skel"><div></div></div>';
    try {
      const r = await data.screener({ marketCapMoreThan: g('mc') ? +g('mc') * 1e9 : undefined, marketCapLowerThan: g('mx') ? +g('mx') * 1e9 : undefined, sector: g('sec'), country: g('cty'), dividendMoreThan: g('dv'), betaLowerThan: g('bt'), isEtf: false, isFund: false, isActivelyTrading: true, limit: g('lim') });
      last = { universe: (r.data || []).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)), prov: r, rich: null };
      show(res);
    } catch (err) { res.innerHTML = unavailable('Screener', err); }
  };
  view.querySelector('#pre').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; ['roic', 'gm', 'revG', 'pe', 'fcfy', 'nde', 'dy', 'payout'].forEach((k) => (view.querySelector('#f_' + k).value = PRESETS[b.dataset.p].f[k] ?? '')); view.querySelector('#f_fcfUp').checked = !!PRESETS[b.dataset.p].f.fcfUp; view.querySelectorAll('#pre .chip').forEach((c) => c.classList.toggle('on', c === b)); };
  view.querySelector('#q').onsubmit = async (e) => {
    e.preventDefault();
    if (!last) { toast('Primero busca un universo'); return; }
    const F = Object.fromEntries(['roic', 'gm', 'revG', 'pe', 'fcfy', 'nde', 'dy', 'payout'].map((k) => [k, g('f_' + k) !== undefined ? +g('f_' + k) : null]));
    F.fcfUp = view.querySelector('#f_fcfUp').checked;
    const n = +g('n'); const needCF = F.fcfUp || F.revG != null;
    res.innerHTML = `<div class="empty">Analizando ${n} empresas…</div>`;
    const sub = last.universe.slice(0, n);
    const rich = await Promise.all(sub.map(async (c) => {
      const r = await gather({ rt: () => data.ratiosTTM(c.symbol), km: () => data.keyMetricsTTM(c.symbol), ...(needCF ? { cf: () => data.cashflow(c.symbol, 'annual', 4), inc: () => data.income(c.symbol, 'annual', 2) } : {}) }, 15000);
      const rt = r.rt.ok ? r.rt.data || {} : {}, km = r.km.ok ? r.km.data || {} : {};
      const cf = r.cf && r.cf.ok ? asc(r.cf.data).map((x) => x.freeCashFlow ?? (isNum(x.operatingCashFlow) && isNum(x.capitalExpenditure) ? x.operatingCashFlow + x.capitalExpenditure : null)).slice(-4) : [];
      const inc = r.inc && r.inc.ok ? asc(r.inc.data).slice(-2) : []; // algunas fuentes ignoran el límite
      return { ...c, ok: r.rt.ok || r.km.ok, roic: km.returnOnInvestedCapitalTTM, gm: rt.grossProfitMarginTTM, pe: rt.priceToEarningsRatioTTM, fcfy: km.freeCashFlowYieldTTM, nde: km.netDebtToEBITDATTM, dy: rt.dividendYieldTTM, payout: rt.dividendPayoutRatioTTM, losing: (isNum(rt.netProfitMarginTTM) && rt.netProfitMarginTTM <= 0) || (isNum(rt.operatingProfitMarginTTM) && rt.operatingProfitMarginTTM <= 0), om: rt.operatingProfitMarginTTM,
        revG: inc.length === 2 && inc[0].revenue > 0 ? inc[1].revenue / inc[0].revenue - 1 : null, fcfUp: cf.length >= 4 ? cf.every((v, i) => isNum(v) && v > 0 && (i === 0 || (isNum(cf[i - 1]) && v > cf[i - 1]))) : null }; // FCF positivo y creciente
    }));
    const pass = (c) => c.ok && (F.roic == null || (isNum(c.roic) && c.roic >= F.roic / 100)) && (F.gm == null || (isNum(c.gm) && c.gm >= F.gm / 100)) && (F.revG == null || (isNum(c.revG) && c.revG >= F.revG / 100)) && (F.pe == null || (c.pe > 0 && c.pe <= F.pe)) && (F.fcfy == null || (isNum(c.fcfy) && c.fcfy >= F.fcfy / 100)) && (F.nde == null || (isNum(c.nde) && c.nde <= F.nde && !(c.nde < 0 && c.losing))) && (F.dy == null || (isNum(c.dy) && c.dy >= F.dy / 100)) && (F.payout == null || (isNum(c.payout) && c.payout >= 0 && !c.losing && c.payout <= F.payout / 100)) && (!F.fcfUp || c.fcfUp === true);
    last.rich = rich.map((c) => ({ ...c, pass: pass(c) })).sort((a, b) => b.pass - a.pass || (b.roic || 0) - (a.roic || 0));
    last.failed = rich.filter((c) => !c.ok).length;
    show(res);
  };
}

function show(res) {
  const L = last.rich || last.universe;
  const rich = !!last.rich;
  const rows = rich ? L : L.slice(0, 250);
  res.innerHTML = card(rich ? `Resultado: ${L.filter((x) => x.pass).length} de ${L.length} empresas cumplen los filtros` : `Universo: ${L.length} empresas`, `<div class="tablewrap"><table class="dense" id="scrT"><thead><tr><th class="l">Empresa</th><th class="l">Sector</th><th>Capitalización</th><th>Precio</th>${rich ? '<th>ROIC</th><th>Margen bruto</th><th>PER</th><th>Rent. FCF</th><th>DN/EBITDA</th><th>Rent. div.</th><th>Cumple</th>' : '<th>Beta</th><th>Dividendo</th><th>País</th>'}</tr></thead><tbody>
    ${rows.map((c) => `<tr style="${rich && !c.pass ? 'opacity:.5' : ''}"><td class="l"><a href="#/c/${encodeURIComponent(c.symbol)}/resumen" style="display:flex;gap:8px;align-items:center">${logoHTML(c.symbol, 22)}<span><b>${esc(c.symbol)}</b> <span class="mute">${esc((c.companyName || '').slice(0, 30))}</span></span></a></td><td class="l">${esc(SECT_ES[c.sector] || c.sector || '')}</td><td>${big(c.marketCap)}</td><td>${num(c.price)}</td>
      ${rich ? `<td>${pct(c.roic)}</td><td>${pct(c.gm)}</td><td>${c.pe > 0 ? mult(c.pe) : '—'}</td><td>${pct(c.fcfy)}</td><td>${mult(c.nde)}</td><td>${pct(c.dy, 2)}</td><td>${c.ok ? (c.pass ? '<span class="pos">✓</span>' : '✕') : '<span class="note">sin datos</span>'}</td>` : `<td>${num(c.beta, 2)}</td><td>${num(c.lastAnnualDividend)}</td><td>${esc(c.country || '')}</td>`}</tr>`).join('')}
    </tbody></table></div>${rich && last.failed ? `<p class="note">${last.failed} empresas sin ratios disponibles con tu plan (no se pueden evaluar).</p>` : ''}<p class="note"><button class="btn sm" id="sx">Exportar CSV</button></p>${source(last.prov)}`);
  res.querySelector('#sx').onclick = () => exportCSV('screener', [['Símbolo', 'Nombre', 'Sector', 'Capitalización', 'Precio', 'ROIC', 'Margen bruto', 'PER', 'Rent FCF', 'DN/EBITDA', 'Rent div', 'Cumple'], ...rows.map((c) => [c.symbol, c.companyName, c.sector, c.marketCap, c.price, c.roic ?? '', c.gm ?? '', c.pe ?? '', c.fcfy ?? '', c.nde ?? '', c.dy ?? '', c.pass ?? ''])]);
}
