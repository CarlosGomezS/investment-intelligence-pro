// Comparador de empresas (hasta 5, métricas actuales e históricas) y comparador sectorial (medianas del sector).
import { data, gather } from '../providers/index.js?v=1369edf7';
import { fundamentals } from '../ui/charts.js?v=1369edf7';
import { esc, card, num, pct, big, mult, unavailable, table } from '../ui/dom.js?v=1369edf7';
import { logoHTML } from '../app.js?v=1369edf7';
import { isNum, buildAnnual, deriveYear, median, cagrN, adjustSplits } from '../calc/finance.js?v=1369edf7';
import { exportCSV } from '../export.js?v=1369edf7';

const METRICS = [['revenue', 'Ingresos', 'big'], ['netIncome', 'Beneficio neto', 'big'], ['fcf', 'FCF', 'big'], ['ebitda', 'EBITDA', 'big'], ['eps', 'BPA', 'n'], ['grossMargin', 'Margen bruto', 'pct'], ['operatingMargin', 'Margen operativo', 'pct'], ['netMargin', 'Margen neto', 'pct'], ['roic', 'ROIC', 'pct'], ['roe', 'ROE', 'pct'], ['debt', 'Deuda total', 'big'], ['cash', 'Caja', 'big'], ['equity', 'Patrimonio', 'big'], ['shares', 'Acciones', 'big']];
let metric = 'revenue', mode = 'empresas';

async function company(sym) {
  const from = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  const r = await gather({ p: () => data.profileLite(sym), rt: () => data.ratiosTTM(sym), km: () => data.keyMetricsTTM(sym), i: () => data.income(sym, 'annual', 10), b: () => data.balance(sym, 'annual', 10), c: () => data.cashflow(sym, 'annual', 10), px: () => data.pricesDaily(sym, from) }, 20000);
  if (!r.p.ok && !r.i.ok) throw Object.assign(r.p.error || new Error('Sin datos'), { sym });
  const years = buildAnnual(r.i.ok ? r.i.data : [], r.b.ok ? r.b.data : [], r.c.ok ? r.c.data : []).map((y) => deriveYear(y));
  adjustSplits(years); // acciones y BPA comparables entre años (splits)
  const cur = r.i.ok && r.i.data && r.i.data[0] ? r.i.data[0].reportedCurrency : null;
  if (cur && years.length) years[years.length - 1].cur = cur;
  return { sym, p: r.p.data || {}, rt: r.rt.data || {}, km: r.km.data || {}, years, px: r.px.ok ? r.px.data : [], prov: r.p };
}

export async function render(view, _p, qs) {
  const syms = (qs.get('s') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
  view.innerHTML = `<div class="row between" style="margin-bottom:14px"><h1 style="font-size:22px">Comparador</h1><div class="seg" id="md"><button data-m="empresas" class="${mode === 'empresas' ? 'on' : ''}">Empresas</button><button data-m="sector" class="${mode === 'sector' ? 'on' : ''}">Sector</button></div></div><div id="body"></div>`;
  view.querySelector('#md').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.m; render(view, _p, qs); } };
  const body = view.querySelector('#body');
  if (mode === 'sector') return sector(body);
  body.innerHTML = card('', `<form id="cf" class="row"><input class="in" id="cs" style="flex:1;min-width:240px" placeholder="Tickers separados por comas: AAPL, MSFT, GOOGL" value="${esc(syms.join(', '))}"><button class="btn pri">Comparar</button></form>`) + '<div id="cr" style="margin-top:14px"></div>';
  body.querySelector('#cf').onsubmit = (e) => { e.preventDefault(); location.hash = '#/comparar?s=' + encodeURIComponent(body.querySelector('#cs').value.replace(/\s+/g, '')); };
  if (syms.length < 2) { body.querySelector('#cr').innerHTML = '<div class="empty">Introduce al menos dos empresas.</div>'; return; }
  const cr = body.querySelector('#cr'); cr.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const res = await Promise.allSettled(syms.map(company));
  const C = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const fails = res.filter((r) => r.status === 'rejected').map((r, i) => `${esc(r.reason.sym || '')}: ${esc(r.reason.message)}`);
  if (C.length < 1) { cr.innerHTML = unavailable('Comparación', res[0].reason); suggestFix(cr, res, syms); return; }
  const L = (c) => c.years[c.years.length - 1] || {};
  const K = (c) => (c.years.length && c.years[c.years.length - 1].cur) || c.p.currency || ''; // moneda de los estados
  const rows = [
    ['Capitalización', (c) => big(c.p.marketCap, c.p.currency)], ['Ingresos (último)', (c) => big(L(c).revenue, K(c))], ['Crec. ventas 5a (anual)', (c) => pct(cagrN(c.years.map((y) => y.revenue), 5))], ['Beneficio neto', (c) => big(L(c).netIncome, K(c))],
    ['Margen bruto', (c) => pct(L(c).grossMargin)], ['Margen operativo', (c) => pct(L(c).operatingMargin)], ['Margen neto', (c) => pct(L(c).netMargin)], ['ROIC (ROCE si el capital es negativo*)', (c) => (L(c).negCapital ? pct(L(c).roce) + '*' : pct(L(c).roic))], ['ROE', (c) => (L(c).negCapital ? 'n/a*' : pct(L(c).roe))],
    ['Deuda neta/EBITDA', (c) => mult(L(c).netDebtToEbitda)], ['FCF', (c) => big(L(c).fcf, K(c))], ['PER', (c) => (c.rt.priceToEarningsRatioTTM > 0 && c.rt.priceToEarningsRatioTTM < 200 ? mult(c.rt.priceToEarningsRatioTTM) : '—')], ['EV/EBITDA', (c) => (c.km.evToEBITDATTM > 0 && c.km.evToEBITDATTM < 200 ? mult(c.km.evToEBITDATTM) : '—')], ['Rent. FCF', (c) => pct(c.km.freeCashFlowYieldTTM)], ['Rent. dividendo', (c) => pct(c.rt.dividendYieldTTM, 2)],
  ];
  cr.innerHTML = `${fails.length ? `<div class="empty" style="margin-bottom:12px">Sin datos: ${fails.join(' · ')}</div>` : ''}
    ${card('Comparativa', `<div class="tablewrap fixed"><table id="cmpT"><thead><tr><th class="l">Métrica</th>${C.map((c) => `<th><a href="#/c/${encodeURIComponent(c.sym)}/resumen" style="display:inline-flex;gap:6px;align-items:center">${logoHTML(c.sym, 20)}${esc(c.sym)}</a></th>`).join('')}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td class="l">${l}</td>${C.map((c) => `<td>${f(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="note">Cifras absolutas en la moneda de cada empresa. * Patrimonio negativo por recompras: el ROIC y el ROE no tienen sentido y se muestra el ROCE. Margen bruto «—» = la empresa no publica coste de ventas (habitual en plataformas como Booking). <button class="btn sm" id="cx">CSV</button></p>`)}
    <div class="grid g2" style="margin-top:14px">
      ${card('Evolución histórica', `<select class="in noprint" id="mt" style="width:auto;margin-bottom:8px">${METRICS.map(([k, l]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="chart"><canvas id="cm1"></canvas></div>`)}
      ${card('Rentabilidad de la acción (5 años, base 0 %)', '<div class="chart"><canvas id="cm2"></canvas></div>')}
    </div>`;
  const plot = () => {
    const yrs = [...new Set(C.flatMap((c) => c.years.map((y) => y.year)))].sort();
    const fmt = METRICS.find((x) => x[0] === metric)[2];
    fundamentals('cm1', yrs, C.map((c) => ({ label: c.sym, data: yrs.map((y) => { const r = c.years.find((x) => x.year === y); return r && isNum(r[metric]) ? r[metric] : null; }), type: fmt === 'pct' ? 'line' : 'bar' })), { fmt });
  };
  plot();
  cr.querySelector('#mt').onchange = (e) => { metric = e.target.value; plot(); };
  // rentabilidad: muestreo mensual (último cierre de cada mes, sin interpolar)
  const months = [...new Set(C.flatMap((c) => c.px.map((p) => p.date.slice(0, 7))))].sort();
  // Todas las curvas parten del mismo mes (el primero en que TODAS cotizan): si no, una que cotiza desde hace 2 años y otra desde hace 5 no serían comparables
  const startM = C.filter((c) => c.px.length).map((c) => c.px[0].date.slice(0, 7)).sort().pop();
  const monthsC = months.filter((mo) => !startM || mo >= startM);
  fundamentals('cm2', monthsC, C.map((c) => { const byM = {}; c.px.forEach((p) => (byM[p.date.slice(0, 7)] = p.close)); const base = byM[monthsC[0]]; return { label: c.sym, type: 'line', data: monthsC.map((mo) => (byM[mo] && base ? byM[mo] / base - 1 : null)) }; }), { fmt: 'pct' });
  suggestFix(cr, res, syms);
  cr.querySelector('#cx').onclick = () => exportCSV('comparativa', [['Métrica', ...C.map((c) => c.sym)], ...rows.map(([l, f]) => [l, ...C.map((c) => f(c))])]);
}

// Para los tickers sin datos, busca el más parecido y lo propone (p. ej. ADB → ADBE, Adobe)
async function suggestFix(cr, res, syms) {
  const bad = syms.filter((s, i) => res[i].status === 'rejected');
  if (!bad.length) return;
  const tips = [];
  for (const s of bad) { try { const r = await data.search(s); const x = (r.data || []).find((d) => d.symbol && d.symbol.toUpperCase() !== s); if (x) tips.push({ bad: s, good: x.symbol, name: x.name }); } catch {} }
  if (!tips.length) return;
  const ok = syms.filter((s) => !bad.includes(s));
  const box = document.createElement('div'); box.className = 'empty'; box.style.marginBottom = '12px';
  box.innerHTML = tips.map((t) => `¿«${esc(t.bad)}» querías decir <a href="#/comparar?s=${encodeURIComponent([...ok, t.good].join(','))}"><b>${esc(t.good)}</b> (${esc(t.name || '')})</a>?`).join('<br>');
  cr.prepend(box);
}

async function sector(body) {
  const SECTORS = ['Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical', 'Consumer Defensive', 'Industrials', 'Communication Services', 'Energy', 'Utilities', 'Real Estate', 'Basic Materials'];
  body.innerHTML = card('Comparador sectorial', `<form id="sf" class="row"><select class="in" id="ss" style="width:auto">${SECTORS.map((s) => `<option>${s}</option>`).join('')}</select><select class="in" id="sc" style="width:auto"><option value="US">EE. UU.</option><option value="">Global</option><option value="ES">España</option><option value="DE">Alemania</option><option value="FR">Francia</option><option value="GB">Reino Unido</option></select><select class="in" id="sn" style="width:auto"><option value="10">10 mayores</option><option value="15" selected>15 mayores</option><option value="25">25 mayores</option></select><button class="btn pri">Analizar sector</button></form><p class="note">Las mayores empresas del sector por capitalización, con medianas del grupo. Consume 1 + 2 peticiones por empresa.</p>`) + '<div id="sr" style="margin-top:14px"></div>';
  body.querySelector('#sf').onsubmit = async (e) => {
    e.preventDefault(); const sr = body.querySelector('#sr'); sr.innerHTML = '<div class="skel"><div></div></div>';
    try {
      const u = await data.screener({ sector: body.querySelector('#ss').value, country: body.querySelector('#sc').value || undefined, isEtf: false, isFund: false, isActivelyTrading: true, limit: 60 });
      const top = (u.data || []).sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, +body.querySelector('#sn').value);
      const R = await Promise.all(top.map(async (c) => { const g = await gather({ rt: () => data.ratiosTTM(c.symbol), km: () => data.keyMetricsTTM(c.symbol) }, 15000); const rt = g.rt.ok ? g.rt.data || {} : {}, km = g.km.ok ? g.km.data || {} : {}; return { symbol: c.symbol, name: c.companyName, mc: c.marketCap, gm: rt.grossProfitMarginTTM, om: rt.operatingProfitMarginTTM, nm: rt.netProfitMarginTTM, roic: km.returnOnInvestedCapitalTTM, roe: km.returnOnEquityTTM, pe: rt.priceToEarningsRatioTTM, eve: km.evToEBITDATTM, fcfy: km.freeCashFlowYieldTTM, nde: isNum(km.netDebtToEBITDATTM) && km.netDebtToEBITDATTM < 0 && !(rt.operatingProfitMarginTTM > 0) ? null : km.netDebtToEBITDATTM, dy: rt.dividendYieldTTM }; }));
      const cols = [{ k: 'symbol', label: 'Empresa', align: 'left', f: (v, r) => r._med ? '<b>Mediana del sector</b>' : `<a href="#/c/${encodeURIComponent(v)}/resumen"><b>${esc(v)}</b></a> <span class="mute">${esc((r.name || '').slice(0, 24))}</span>` }, { k: 'mc', label: 'Capitalización', f: (v) => big(v) }, { k: 'gm', label: 'M. bruto', f: (v) => pct(v) }, { k: 'om', label: 'M. operativo', f: (v) => pct(v) }, { k: 'nm', label: 'M. neto', f: (v) => pct(v) }, { k: 'roic', label: 'ROIC', f: (v) => pct(v) }, { k: 'roe', label: 'ROE', f: (v) => pct(v) }, { k: 'pe', label: 'PER', f: (v) => (v > 0 ? mult(v) : '—') }, { k: 'eve', label: 'EV/EBITDA', f: (v) => (v > 0 ? mult(v) : '—') }, { k: 'fcfy', label: 'Rent. FCF', f: (v) => pct(v) }, { k: 'nde', label: 'DN/EBITDA', f: (v) => mult(v) }, { k: 'dy', label: 'Rent. div.', f: (v) => pct(v, 2) }];
      const med = { symbol: '', name: '', _med: true }; for (const c of cols.slice(1)) med[c.k] = median(R.map((r) => r[c.k]).filter((v) => isNum(v) && (!['pe', 'eve'].includes(c.k) || (v > 0 && v < 200)))); // múltiplos ≤ 0 o > 200 no cuentan
      sr.innerHTML = card(`Sector: ${esc(body.querySelector('#ss').value)}`, table('secT', cols, [...R, med], { dense: true }));
    } catch (err) { sr.innerHTML = unavailable('Comparador sectorial', err); }
  };
}
