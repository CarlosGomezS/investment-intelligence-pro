// Competidores: detección automática (FMP stock-peers), lista editable, tabla comparativa, gráficos y ganador por pilar.
import { data, gather } from '../../providers/index.js?v=1369edf7';
import { fundamentals } from '../../ui/charts.js?v=1369edf7';
import { esc, big, pct, num, mult, card, unavailable, source, table, toast } from '../../ui/dom.js?v=1369edf7';
import { isNum, div, asc, median } from '../../calc/finance.js?v=1369edf7';
import { store } from '../../store.js?v=1369edf7';
import { logoHTML } from '../../app.js?v=1369edf7';

async function peerRow(sym) {
  const r = await gather({ p: () => data.profileLite(sym), rt: () => data.ratiosTTM(sym), km: () => data.keyMetricsTTM(sym), inc: () => data.income(sym, 'annual', 4) }, 15000);
  if (!r.p.ok && !r.rt.ok) return { symbol: sym, error: (r.p.error || r.rt.error) };
  const p = r.p.data || {}, rt = r.rt.data || {}, km = r.km.data || {}, inc = asc(r.inc.ok ? r.inc.data : []);
  const L = inc[inc.length - 1] || {}, P = inc[inc.length - 2] || {}, F = inc[0] || {};
  const n = inc.length - 1;
  return {
    symbol: sym, name: p.companyName || sym, currency: L.reportedCurrency || p.currency, tcur: p.currency || L.reportedCurrency, marketCap: p.marketCap,
    revenue: L.revenue, growth1: div(L.revenue, P.revenue) != null ? L.revenue / P.revenue - 1 : null, growth3: n >= 2 && F.revenue > 0 && L.revenue > 0 ? (L.revenue / F.revenue) ** (1 / n) - 1 : null,
    netIncome: L.netIncome, grossMargin: rt.grossProfitMarginTTM ?? div(L.grossProfit, L.revenue), opMargin: rt.operatingProfitMarginTTM ?? div(L.operatingIncome, L.revenue),
    netMargin: rt.netProfitMarginTTM ?? div(L.netIncome, L.revenue), roic: km.returnOnInvestedCapitalTTM, roe: km.returnOnEquityTTM, de: rt.debtToEquityRatioTTM,
    // Deuda neta/EBITDA negativa con márgenes negativos = EBITDA negativo, no caja neta: no se usa
    ndEbitda: isNum(km.netDebtToEBITDATTM) && km.netDebtToEBITDATTM < 0 && !((rt.operatingProfitMarginTTM ?? div(L.operatingIncome, L.revenue)) > 0) ? null : km.netDebtToEBITDATTM, pe: rt.priceToEarningsRatioTTM, evEbitda: km.evToEBITDATTM, fcfYield: km.freeCashFlowYieldTTM,
    fcf: isNum(km.freeCashFlowYieldTTM) && isNum(p.marketCap) ? km.freeCashFlowYieldTTM * p.marketCap : null, _prov: [r.p, r.rt, r.km, r.inc].filter((x) => x.ok),
  };
}

function selfRow(S) {
  const m = S.m, T = m.T;
  return { symbol: m.symbol, name: m.profile.companyName, currency: m.repCur, tcur: m.tradeCur, marketCap: m.marketCap, revenue: T.revenue, growth1: m.growth.rev1, growth3: m.growth.rev3, netIncome: T.netIncome,
    grossMargin: T.grossMargin, opMargin: T.operatingMargin, netMargin: T.netMargin, roic: T.roic ?? m.last.roic, roe: T.roe ?? m.last.roe, de: T.debtToEquity, ndEbitda: T.netDebtToEbitda, // propios (con patrimonio negativo no aplican)
    pe: m.pe, evEbitda: isNum(T.ebitda) && T.ebitda > 0 ? m.ev / m.X(T.ebitda) : null, fcfYield: div(m.X(T.fcf), m.marketCap), fcf: m.X(T.fcf), self: true };
}

export async function loadPeers(S, force) {
  if (S.peers && !force) return S.peers;
  let list = store.peers(S.sym), prov = null, auto = false;
  if (!list) {
    try { const r = await data.peers(S.sym); prov = r; auto = true; list = (r.data || []).map((x) => x.symbol).filter((x) => x && x !== S.sym).slice(0, 6); }
    catch (e) { S.peers = { rows: [selfRow(S)], error: e, list: [] }; return S.peers; }
  }
  const rows = await Promise.all(list.slice(0, 8).map((s) => peerRow(s).catch((e) => ({ symbol: s, error: e }))));
  S.peers = { rows: [selfRow(S), ...rows.filter((r) => !r.error)], failed: rows.filter((r) => r.error), list, auto, prov };
  return S.peers;
}

const COLS = [
  ['marketCap', 'Capitalización', (v, r) => big(v, r && r.tcur), 'high'], ['revenue', 'Ingresos', (v, r) => big(v, r && r.currency), 'high'], ['growth1', 'Crec. ventas 1a', (v) => pct(v), 'high'], ['growth3', 'Crec. ventas 3a (anual)', (v) => pct(v), 'high'],
  ['netIncome', 'Beneficio neto', (v, r) => big(v, r && r.currency), 'high'], ['grossMargin', 'Margen bruto', (v) => pct(v), 'high'], ['opMargin', 'Margen operativo', (v) => pct(v), 'high'], ['netMargin', 'Margen neto', (v) => pct(v), 'high'],
  ['roic', 'ROIC', (v) => pct(v), 'high'], ['roe', 'ROE', (v) => pct(v), 'high'], ['de', 'Deuda/Patrimonio', (v) => num(v, 2), 'low'], ['ndEbitda', 'Deuda neta/EBITDA', (v) => mult(v), 'low'],
  ['pe', 'PER', (v) => (isNum(v) && v > 0 ? mult(v) : '—'), 'low'], ['evEbitda', 'EV/EBITDA', (v) => (isNum(v) && v > 0 ? mult(v) : '—'), 'low'], ['fcf', 'FCF', (v, r) => big(v, r && r.tcur), 'high'], ['fcfYield', 'Rent. FCF', (v) => pct(v), 'high'],
];

function rankScore(rows, keys) {
  // Puntuación por percentil dentro del grupo para un conjunto de métricas
  return rows.map((r) => {
    const sc = keys.map(([k, dir]) => {
      const vals = rows.map((x) => x[k]).filter((v) => isNum(v) && (k !== 'pe' && k !== 'evEbitda' || v > 0));
      const v = r[k]; if (!isNum(v) || vals.length < 2 || ((k === 'pe' || k === 'evEbitda') && v <= 0)) return null;
      const below = vals.filter((x) => (dir === 'high' ? x < v : x > v)).length;
      return below / (vals.length - 1);
    }).filter(isNum);
    return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
  });
}

export async function render(el, S, ctx) {
  el.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const P = await loadPeers(S);
  if (P.error && P.rows.length < 2) { el.innerHTML = unavailable('Competidores', P.error) + editor(S, P); bind(el, S, ctx); return; }
  const rows = P.rows;
  const curNote = new Set(rows.map((r) => r.currency)).size > 1 ? '<p class="note">Atención: las cifras absolutas (ingresos, beneficio, FCF) están en la moneda de cada empresa; los ratios y márgenes sí son comparables.</p>' : '';
  const pillars = [
    ['Calidad financiera', [['grossMargin', 'high'], ['roic', 'high'], ['ndEbitda', 'low']]],
    ['Crecimiento', [['growth1', 'high'], ['growth3', 'high']]],
    ['Rentabilidad', [['opMargin', 'high'], ['netMargin', 'high'], ['roe', 'high'], ['roic', 'high']]],
    ['Valoración (más barata)', [['pe', 'low'], ['evEbitda', 'low'], ['fcfYield', 'high']]],
  ];
  const winners = pillars.map(([lab, keys]) => { const s = rankScore(rows, keys); let bi = -1, bv = -1; s.forEach((v, i) => { if (isNum(v) && v > bv) { bv = v; bi = i; } }); return { lab, w: rows[bi], s }; });
  // Misma limpieza que la valoración: múltiplos ≤ 0 o > 200 no cuentan
  const okV = (k, v) => isNum(v) && (!['pe', 'evEbitda'].includes(k) || (v > 0 && v < 200));
  // Cifras absolutas: solo hay mediana si todos los competidores usan la misma moneda (no se mezclan USD con EUR)
  const ABS = { marketCap: 'tcur', fcf: 'tcur', revenue: 'currency', netIncome: 'currency' };
  const sameCur = (k) => !ABS[k] || new Set(rows.filter((r) => !r.self).map((r) => r[ABS[k]])).size <= 1;
  const med = Object.fromEntries(COLS.map(([k]) => [k, sameCur(k) ? median(rows.filter((r) => !r.self).map((r) => r[k]).filter((v) => okV(k, v))) : null]));
  el.innerHTML = `${card(`Comparativa con competidores${P.auto ? ' (detectados automáticamente)' : ' (lista personalizada)'}`, `<div class="tablewrap fixed"><table id="peerT" class="dense"><thead><tr><th class="l">Empresa</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr${r.self ? ' style="background:color-mix(in srgb,var(--acc) 9%,transparent)"' : ''}><td class="l"><a href="#/c/${encodeURIComponent(r.symbol)}/resumen" style="display:flex;gap:8px;align-items:center">${logoHTML(r.symbol, 22)}<span><b>${esc(r.symbol)}</b><br><small class="mute">${esc((r.name || '').slice(0, 28))}</small></span></a></td>${COLS.map(([k, , f]) => `<td>${f(r[k], r)}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td class="l">Mediana competidores</td>${COLS.map(([k, , f]) => `<td>${f(med[k])}</td>`).join('')}</tr></tbody></table></div>${curNote}
      ${P.failed && P.failed.length ? `<p class="note">Sin datos para: ${P.failed.map((f) => esc(f.symbol)).join(', ')} (${esc(P.failed[0].error && P.failed[0].error.message || '')}).</p>` : ''}${source(P.prov, ...(rows[1] && rows[1]._prov || []))}`)}
    <div class="grid g4" style="margin:14px 0">${winners.map((w) => card(w.lab, w.w ? `<div style="display:flex;gap:10px;align-items:center">${logoHTML(w.w.symbol, 34)}<div><b>${esc(w.w.symbol)}</b><div class="note">${esc(w.w.name || '')}</div></div></div><p class="note">Mejor percentil medio del grupo en: ${pillars.find((p) => p[0] === w.lab)[1].map(([k]) => COLS.find((c) => c[0] === k)[1]).join(', ')}.</p>` : '<p class="note">Datos insuficientes.</p>')).join('')}</div>
    <div class="grid g2">
      ${card('Márgenes y rentabilidad', '<div class="chart"><canvas id="pc1"></canvas></div>')}
      ${card('Valoración', '<div class="chart"><canvas id="pc2"></canvas></div>')}
    </div>
    <div style="margin-top:14px">${editor(S, P)}</div>`;
  const labels = rows.map((r) => r.symbol);
  fundamentals('pc1', labels, [{ label: 'Margen operativo', data: rows.map((r) => r.opMargin) }, { label: 'Margen neto', data: rows.map((r) => r.netMargin) }, { label: 'ROIC', data: rows.map((r) => r.roic) }], { fmt: 'pct' });
  fundamentals('pc2', labels, [{ label: 'PER', data: rows.map((r) => (r.pe > 0 && r.pe < 200 ? r.pe : null)) }, { label: 'EV/EBITDA', data: rows.map((r) => (r.evEbitda > 0 && r.evEbitda < 200 ? r.evEbitda : null)) }], { fmt: 'x' });
  bind(el, S, ctx);
}

function editor(S, P) {
  return card('Editar lista de competidores', `<p class="note" style="margin-top:0">La detección automática de FMP agrupa por sector e industria y a veces incluye empresas poco comparables. Escribe los tickers separados por comas.</p>
    <div class="row"><input class="in" id="peerIn" style="flex:1;min-width:220px" value="${esc((P.list || []).join(', '))}" placeholder="MSFT, GOOGL, SAMSUNG…"><button class="btn pri" id="peerSave">Aplicar</button><button class="btn" id="peerAuto">Volver a automático</button></div>
    <p class="note">Cada competidor consume 4 peticiones al proveedor (se guardan 24 h en caché).</p>`);
}
function bind(el, S, ctx) {
  const save = el.querySelector('#peerSave'), auto = el.querySelector('#peerAuto');
  if (save) save.onclick = async () => { const list = el.querySelector('#peerIn').value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean).filter((x) => x !== S.sym); store.setPeers(S.sym, list); S.peers = null; toast('Competidores actualizados'); await loadPeers(S, true); ctx.recompute(); render(el, S, ctx); };
  if (auto) auto.onclick = async () => { store.setPeers(S.sym, null); S.peers = null; await loadPeers(S, true); ctx.recompute(); render(el, S, ctx); };
}
