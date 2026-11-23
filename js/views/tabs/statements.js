// Estados financieros completos: anual, trimestral y TTM móvil, con variación interanual, gráficos y exportación.
import { data } from '../../providers/index.js?v=f2479787';
import { fundamentals } from '../../ui/charts.js?v=f2479787';
import { esc, big, pct, num, cls, sgnPct, card, unavailable, source } from '../../ui/dom.js?v=f2479787';
import { isNum, div, asc, splitAdjustRows, splitAdjustRowsByDate } from '../../calc/finance.js?v=f2479787';
import { extra } from '../company.js?v=f2479787';
import { exportCSV, exportXLSX } from '../../export.js?v=f2479787';

const neg = (v) => (isNum(v) ? -v : null);
const abs = (v) => (isNum(v) ? Math.abs(v) : null);
export const DEFS = {
  income: { title: 'Cuenta de resultados', rows: [
    ['Ingresos totales', 'revenue', 'tot'], ['Coste de ventas', 'costOfRevenue', 'sub'], ['Beneficio bruto', 'grossProfit', 'tot'], ['Gastos operativos', 'operatingExpenses', 'sub'],
    ['Investigación y desarrollo', 'researchAndDevelopmentExpenses', 'sub'], ['Gastos generales y administrativos', (r) => r.sellingGeneralAndAdministrativeExpenses ?? r.generalAndAdministrativeExpenses, 'sub'],
    ['EBITDA', 'ebitda', 'tot'], ['EBIT', 'ebit'], ['Beneficio operativo', 'operatingIncome', 'tot'], ['Gastos financieros', 'interestExpense', 'sub'], ['Beneficio antes de impuestos', 'incomeBeforeTax'], ['Impuestos', 'incomeTaxExpense', 'sub'],
    ['Beneficio neto', 'netIncome', 'tot'], ['BPA básico', 'eps', 'ps'], ['BPA diluido', 'epsDiluted', 'ps'], ['Acciones (diluidas)', 'weightedAverageShsOutDil', 'sh'],
    ['Margen bruto', (r) => div(r.grossProfit, r.revenue), 'pct'], ['Margen operativo', (r) => div(r.operatingIncome, r.revenue), 'pct'], ['Margen neto', (r) => div(r.netIncome, r.revenue), 'pct'],
  ] },
  balance: { title: 'Balance de situación', stock: true, rows: [
    ['Activo corriente', 'totalCurrentAssets', 'tot'], ['Efectivo y equivalentes', 'cashAndCashEquivalents', 'sub'], ['Inversiones a corto plazo', 'shortTermInvestments', 'sub'], ['Cuentas por cobrar', 'netReceivables', 'sub'], ['Inventarios', 'inventory', 'sub'],
    ['Activo no corriente', 'totalNonCurrentAssets', 'tot'], ['Inmovilizado material', 'propertyPlantEquipmentNet', 'sub'], ['Fondo de comercio', 'goodwill', 'sub'], ['Intangibles', 'intangibleAssets', 'sub'], ['Inversiones a largo plazo', 'longTermInvestments', 'sub'],
    ['Activos totales', 'totalAssets', 'tot'], ['Pasivo corriente', 'totalCurrentLiabilities', 'tot'], ['Deuda a corto plazo', 'shortTermDebt', 'sub'], ['Deuda a largo plazo', 'longTermDebt', 'sub'], ['Pasivos totales', 'totalLiabilities', 'tot'],
    ['Patrimonio neto', 'totalStockholdersEquity', 'tot'], ['Deuda total', 'totalDebt'], ['Deuda neta', (r) => r.netDebt ?? (isNum(r.totalDebt) && isNum(r.cashAndShortTermInvestments ?? r.cashAndCashEquivalents) ? r.totalDebt - (r.cashAndShortTermInvestments ?? r.cashAndCashEquivalents) : null)],
    ['Capital circulante', (r) => (isNum(r.totalCurrentAssets) && isNum(r.totalCurrentLiabilities) ? r.totalCurrentAssets - r.totalCurrentLiabilities : null)],
  ] },
  cashflow: { title: 'Estado de flujos de efectivo', rows: [
    ['Flujo de caja operativo', (r) => r.operatingCashFlow ?? r.netCashProvidedByOperatingActivities, 'tot'], ['Flujo de caja de inversión', 'netCashProvidedByInvestingActivities', 'tot'], ['CAPEX', (r) => neg(abs(r.capitalExpenditure)), 'sub'],
    ['Adquisiciones', 'acquisitionsNet', 'sub'], ['Flujo de caja financiero', 'netCashProvidedByFinancingActivities', 'tot'], ['Dividendos pagados', (r) => r.commonDividendsPaid ?? r.netDividendsPaid, 'sub'],
    ['Recompra de acciones', 'commonStockRepurchased', 'sub'], ['Emisión de acciones', 'commonStockIssuance', 'sub'], ['Emisión/amortización neta de deuda', 'netDebtIssuance', 'sub'],
    ['Free Cash Flow (FCF)', (r) => r.freeCashFlow ?? (isNum(r.operatingCashFlow) && isNum(r.capitalExpenditure) ? r.operatingCashFlow - Math.abs(r.capitalExpenditure) : null), 'tot'],
    ['Pagos en acciones (SBC)', 'stockBasedCompensation', 'sub'],
  ] },
};
const get = (r, f) => (r ? (typeof f === 'function' ? f(r) : r[f]) : null);
const label = (r, period) => (period === 'quarter' || period === 'ttm' ? `${r.period || ''} ${r.fiscalYear || String(r.date).slice(0, 4)}`.trim() : r.fiscalYear || String(r.date).slice(0, 4));
const st = { period: 'annual', stmt: 'income', chartRows: { income: ['revenue', 'netIncome'], balance: ['totalAssets', 'totalDebt'], cashflow: ['Free Cash Flow (FCF)', 'Flujo de caja operativo'] } };

function rollingTTM(qAsc, defs, isStock) {
  const out = [];
  for (let i = 3; i < qAsc.length; i++) {
    const w = qAsc.slice(i - 3, i + 1), r = { date: qAsc[i].date, fiscalYear: qAsc[i].fiscalYear, period: 'TTM ' + (qAsc[i].period || '') };
    // Solo 4 trimestres consecutivos (unos 9 meses entre el primer y el último cierre); con huecos no es un TTM
    const span = (new Date(w[3].date) - new Date(w[0].date)) / 864e5;
    if (!(span > 240 && span < 310)) continue;
    // y cada salto entre trimestres de unos 3 meses (sin duplicados ni huecos)
    if (![1, 2, 3].every((j) => { const d = (new Date(w[j].date) - new Date(w[j - 1].date)) / 864e5; return d > 60 && d < 120; })) continue;
    for (const k of Object.keys(qAsc[i])) {
      if (typeof qAsc[i][k] !== 'number') continue;
      // Acciones: las del último trimestre. BPA: se suma (4 trimestres) o se recalcula abajo con beneficio / acciones
      r[k] = isStock || /Shs|shares/i.test(k) ? qAsc[i][k] : (w.every((x) => isNum(x[k])) ? w.reduce((a, x) => a + x[k], 0) : null);
    }
    if (isNum(r.netIncome) && isNum(qAsc[i].weightedAverageShsOutDil)) r.epsDiluted = r.netIncome / qAsc[i].weightedAverageShsOutDil;
    if (isNum(r.netIncome) && isNum(qAsc[i].weightedAverageShsOut)) r.eps = r.netIncome / qAsc[i].weightedAverageShsOut;
    out.push(r);
  }
  return out;
}

async function rowsFor(S, stmt, period) {
  if (period === 'annual') {
    const r = S.raw[stmt];
    if (!r.ok) return { error: r.error };
    const rows = splitAdjustRows(asc(r.data), S.m.splitsAdj);
    const ttm = S.raw[stmt + 'TTM'];
    if (ttm && ttm.ok && ttm.data) { const [t] = splitAdjustRowsByDate([{ ...ttm.data, date: ttm.data.date || (rows.length ? rows[rows.length - 1].date : null), fiscalYear: 'TTM' }], S.raw.splits && S.raw.splits.ok ? S.raw.splits.data : null, S.m.shares); /* TTM con el mismo ajuste de splits */ rows.push({ ...t, _ttm: true }); }
    const adj = rows.some((x) => x._splitAdj);
    return { rows, prov: [r, ttm && ttm.ok ? ttm : null], note: adj ? 'Acciones y BPA de los años anteriores a cada split detectado están ajustados al número de acciones actual (comparables entre años). Los importes no cambian.' : '' };
  }
  try {
    const q = await extra(S, 'q' + stmt, () => data[stmt](S.sym, 'quarter', 44));
    const rows = splitAdjustRowsByDate(asc(q.data), S.raw.splits && S.raw.splits.ok ? S.raw.splits.data : null);
    if (period === 'quarter') return { rows, prov: [q] };
    return { rows: rollingTTM(rows, DEFS[stmt], DEFS[stmt].stock), prov: [q], note: 'TTM móvil calculado sumando los cuatro trimestres previos de cada fecha (balance: dato a cierre de trimestre).' };
  } catch (e) { return { error: e }; }
}

export async function render(el, S) {
  const cur = S.m.repCur;
  el.innerHTML = `<div class="row between noprint" style="margin-bottom:12px">
      <div class="seg" id="stm">${Object.entries(DEFS).map(([k, d]) => `<button data-k="${k}" class="${k === st.stmt ? 'on' : ''}">${d.title}</button>`).join('')}</div>
      <div class="row"><div class="seg" id="per"><button data-k="annual">Anual</button><button data-k="quarter">Trimestral</button><button data-k="ttm">TTM móvil</button></div>
      <button class="btn sm" id="csv">CSV</button><button class="btn sm" id="xls">Excel (3 estados)</button></div></div>
    <div id="sbody"></div>`;
  const body = el.querySelector('#sbody');
  const draw = async () => {
    el.querySelectorAll('#stm button').forEach((b) => b.classList.toggle('on', b.dataset.k === st.stmt));
    el.querySelectorAll('#per button').forEach((b) => b.classList.toggle('on', b.dataset.k === st.period));
    body.innerHTML = '<div class="skel"><div></div></div>';
    const D = DEFS[st.stmt];
    const res = await rowsFor(S, st.stmt, st.period);
    if (res.error) { body.innerHTML = unavailable(`${D.title} (${st.period === 'annual' ? 'anual' : st.period === 'quarter' ? 'trimestral' : 'TTM'})`, res.error) + (st.period !== 'annual' ? '<p class="note">Los estados trimestrales requieren el plan de pago de FMP o una clave de Alpha Vantage.</p>' : ''); return; }
    const rows = res.rows.slice(st.period === 'annual' ? -16 : -20);
    const cols = rows.map((r) => (r._ttm ? 'TTM' : label(r, st.period)));
    const lag = st.period === 'annual' ? 1 : 4; // trimestral y TTM móvil: frente al mismo periodo del año anterior
    const fmt = (v, kind) => (kind === 'pct' ? pct(v) : kind === 'ps' ? num(v, 2) : big(v));
    const tr = D.rows.map(([lab, f, kind]) => {
      const vals = rows.map((r) => get(r, f));
      const cells = vals.map((v, i) => {
        // Periodo comparable: el de hace un año por FECHA (330-400 días); si falta un trimestre no se compara con otro
        const j = i - lag, ok = j >= 0 && (!rows[i].date || !rows[j].date || Math.abs((new Date(rows[i].date) - new Date(rows[j].date)) / 864e5 - 365) < 35);
        const base = rows[i]._ttm || !ok ? null : vals[j];
        const g = kind !== 'pct' && isNum(v) && isNum(base) && base !== 0 ? (v - base) / Math.abs(base) : null;
        return `<td>${fmt(v, kind)}${isNum(g) ? `<span class="yo ${cls(g)}">${sgnPct(g, 0)}</span>` : ''}</td>`;
      }).join('');
      return `<tr class="${kind === 'tot' ? 'tot' : kind === 'sub' ? 'sub' : ''}"><td class="l">${esc(lab)}</td>${cells}</tr>`;
    }).join('');
    const opts = D.rows.filter(([, , k]) => k !== 'pct');
    body.innerHTML = card(`${D.title} · ${esc(cur)}`, `<div class="tablewrap fixed"><table id="stbl" class="dense"><thead><tr><th class="l">Partida</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${tr}</tbody></table></div>
        <p class="note">Debajo de cada cifra: variación ${st.period === 'quarter' ? 'frente al mismo trimestre del año anterior' : 'interanual'}. ${res.note || ''} Sin datos = el proveedor no informa la partida (no se estima).</p>${source(...res.prov.filter(Boolean))}`)
      + `<div style="margin-top:14px">${card('Evolución histórica', `<div class="row noprint" style="margin-bottom:8px"><span class="note">Partidas:</span><div class="chips" id="pick">${opts.map(([lab, f]) => { const key = typeof f === 'string' ? f : lab; return `<button class="chip ${st.chartRows[st.stmt].includes(key) ? 'on' : ''}" data-k="${esc(key)}">${esc(lab)}</button>`; }).join('')}</div></div><div class="chart lg"><canvas id="stc"></canvas></div>`)}</div>`;
    const plot = () => {
      const sel = st.chartRows[st.stmt];
      const ds = opts.filter(([lab, f]) => sel.includes(typeof f === 'string' ? f : lab)).map(([lab, f]) => ({ label: lab, data: rows.map((r) => get(r, f) ?? null) }));
      const margin = st.stmt === 'income' ? [{ label: 'Margen neto', data: rows.map((r) => div(r.netIncome, r.revenue)), type: 'line', axis: 'y2' }] : [];
      fundamentals('stc', cols, [...ds, ...margin], { fmt: 'big', fmt2: 'pct' });
    };
    plot();
    body.querySelector('#pick').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const s = st.chartRows[st.stmt]; const i = s.indexOf(b.dataset.k); if (i >= 0) s.splice(i, 1); else if (s.length < 5) s.push(b.dataset.k); b.classList.toggle('on'); plot(); };
  };
  el.querySelector('#stm').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.stmt = b.dataset.k; draw(); } };
  el.querySelector('#per').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.period = b.dataset.k; draw(); } };
  const matrix = async (stmt) => { const r = await rowsFor(S, stmt, st.period); if (r.error) return [['Sin datos']]; const rows = r.rows; return [['Partida (' + cur + ')', ...rows.map((x) => (x._ttm ? 'TTM' : label(x, st.period)))], ...DEFS[stmt].rows.map(([lab, f]) => [lab, ...rows.map((x) => get(x, f) ?? '')])]; };
  el.querySelector('#csv').onclick = async () => exportCSV(`${S.sym}_${st.stmt}_${st.period}`, await matrix(st.stmt));
  el.querySelector('#xls').onclick = async () => exportXLSX(`${S.sym}_estados_${st.period}`, { 'Resultados': await matrix('income'), 'Balance': await matrix('balance'), 'Flujos': await matrix('cashflow') });
  await draw();
}
