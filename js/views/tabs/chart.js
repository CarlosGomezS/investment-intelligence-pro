// Cotización interactiva: rangos de 1 día a máximo, escala lineal/log, rentabilidad acumulada,
// comparación con índices, volumen y marcas de dividendos y splits.
import { data } from '../../providers/index.js?v=5b306087';
import { priceChart, PALETTE } from '../../ui/charts.js?v=5b306087';
import { esc, num, pct, sgnPct, cls, card, unavailable, source, table } from '../../ui/dom.js?v=5b306087';
import { isNum, maxDrawdown, volatility } from '../../calc/finance.js?v=5b306087';
import { extra } from '../company.js?v=5b306087';

const RANGES = [['1D', 1], ['1S', 7], ['1M', 30], ['3M', 91], ['6M', 182], ['1A', 365], ['5A', 1826], ['10A', 3652], ['Máx', 0]];
const INDEXES = [['', 'Sin comparar'], ['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['^DJI', 'Dow Jones'], ['^STOXX50E', 'Euro Stoxx 50'], ['^IBEX', 'IBEX 35'], ['^GDAXI', 'DAX'], ['^FTSE', 'FTSE 100'], ['^N225', 'Nikkei 225'], ['URTH', 'MSCI World (ETF)']];
const st = { range: '1A', log: false, pctMode: false, vol: true, idx: '', marks: true };

export async function render(el, S) {
  const { m } = S;
  const prices = S.raw.prices.ok ? S.raw.prices.data : [];
  el.innerHTML = `${card('', `<div class="row between noprint" style="margin-bottom:10px">
      <div class="seg" id="rg">${RANGES.map(([k]) => `<button data-k="${k}" class="${k === st.range ? 'on' : ''}">${k}</button>`).join('')}</div>
      <div class="row"><div class="seg"><button id="lin" class="${!st.log && !st.pctMode ? 'on' : ''}">Lineal</button><button id="log" class="${st.log ? 'on' : ''}">Log</button><button id="pcm" class="${st.pctMode ? 'on' : ''}">Rentab. %</button></div>
      <select class="in" id="idx" style="width:auto;height:30px;font-size:12px">${INDEXES.map(([k, l]) => `<option value="${k}" ${k === st.idx ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="note"><input type="checkbox" id="vol" ${st.vol ? 'checked' : ''}> Volumen</label><label class="note"><input type="checkbox" id="mk" ${st.marks ? 'checked' : ''}> Dividendos/splits</label></div></div>
      <div id="pchart"></div><div id="pmsg"></div>`)}
    <div class="grid g2" style="margin-top:14px"><div id="perf"></div><div id="stats"></div></div>`;
  if (!prices.length) { el.querySelector('#pchart').outerHTML = unavailable('Histórico de cotizaciones', S.raw.prices.error); return; }

  const draw = async () => {
    const msg = el.querySelector('#pmsg'); msg.innerHTML = '';
    const days = RANGES.find((r) => r[0] === st.range)[1];
    let series = prices, intraday = false;
    if (days && days <= 7) {
      const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - (days === 1 ? 4 : 9) * 864e5).toISOString().slice(0, 10);
      try {
        const r = await extra(S, 'intra' + days, () => data.intraday(m.symbol, from, to));
        let d = r.data; if (days === 1 && d.length) { const lastDay = d[d.length - 1].date.slice(0, 10); d = d.filter((x) => x.date.startsWith(lastDay)); }
        series = d; intraday = true;
      } catch (e) { msg.innerHTML = `<p class="note">Datos intradía no disponibles (${esc(e.message)}); se muestran cierres diarios.</p>`; }
    }
    if (!intraday && days) { const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); series = prices.filter((p) => p.date >= cut); }
    const T = (d) => (intraday ? Math.floor(new Date(d.replace(' ', 'T')).getTime() / 1000) : d);
    const base = series[0] ? series[0].close : 1;
    const toPct = st.pctMode || !!st.idx;
    const main = series.map((p) => ({ time: T(p.date), value: toPct ? (p.close / base - 1) * 100 : p.close }));
    const S2 = [{ name: m.symbol, color: PALETTE()[0], data: main }];
    if (st.idx && !intraday) {
      try {
        const ir = await extra(S, 'idx' + st.idx, () => data.index(st.idx, '1980-01-01'));
        const set = new Set(series.map((p) => p.date));
        const ip = ir.data.filter((p) => set.has(p.date));
        if (ip.length) { const b = ip[0].close; S2.push({ name: INDEXES.find((x) => x[0] === st.idx)[1], color: PALETTE()[2], data: ip.map((p) => ({ time: p.date, value: (p.close / b - 1) * 100 })) }); }
        msg.innerHTML += source(ir);
      } catch (e) { msg.innerHTML += unavailable('Índice de referencia', e); }
    }
    const vol = st.vol ? series.map((p, i) => ({ time: T(p.date), value: p.volume || 0, up: i === 0 || p.close >= series[i - 1].close })) : null;
    let markers = [];
    if (st.marks && !intraday) {
      const set = new Set(series.map((p) => p.date));
      markers = m.divs.filter((d) => set.has(d.date)).map((d) => ({ time: d.date, text: 'D ' + num(d.dividend ?? d.adjDividend, 2), kind: 'div' }))
        .concat(m.splits.filter((s) => set.has(s.date)).map((s) => ({ time: s.date, text: `Split ${s.numerator}:${s.denominator}`, kind: 'split' })))
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));
      if (markers.length > 120) markers = markers.filter((x) => x.kind === 'split');
    }
    priceChart(el.querySelector('#pchart'), { series: S2, volume: vol, markers, log: st.log && !toPct, percent: toPct });
    msg.innerHTML += source(S.raw.prices.ok ? S.raw.prices : null);
  };

  el.querySelector('#rg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.range = b.dataset.k; el.querySelectorAll('#rg button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
  const setMode = (log, pc) => { st.log = log; st.pctMode = pc; ['lin', 'log', 'pcm'].forEach((id) => el.querySelector('#' + id).classList.toggle('on', (id === 'lin' && !log && !pc) || (id === 'log' && log) || (id === 'pcm' && pc))); draw(); };
  el.querySelector('#lin').onclick = () => setMode(false, false);
  el.querySelector('#log').onclick = () => setMode(true, false);
  el.querySelector('#pcm').onclick = () => setMode(false, true);
  el.querySelector('#idx').onchange = (e) => { st.idx = e.target.value; draw(); perf(); };
  el.querySelector('#vol').onchange = (e) => { st.vol = e.target.checked; draw(); };
  el.querySelector('#mk').onchange = (e) => { st.marks = e.target.checked; draw(); };
  await draw();

  // Rentabilidad por periodos frente al índice y estadísticas de riesgo
  const perf = async () => {
    const rows = [];
    let idxData = null;
    if (st.idx) { try { idxData = (await extra(S, 'idx' + st.idx, () => data.index(st.idx, '1980-01-01'))).data; } catch {} }
    const ret = (arr, days) => { if (!arr || !arr.length) return null; const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); const a = arr.filter((p) => p.date >= cut); return a.length > 2 ? a[a.length - 1].close / a[0].close - 1 : null; };
    for (const [k, d] of RANGES.slice(2, 8)) { const r = ret(prices, d), i = ret(idxData, d); rows.push({ k, r, i, diff: isNum(r) && isNum(i) ? r - i : null, ann: d >= 365 && isNum(r) ? (1 + r) ** (365 / d) - 1 : null }); }
    const all = prices.length > 2 ? prices[prices.length - 1].close / prices[0].close - 1 : null;
    rows.push({ k: `Máx. (desde ${prices[0].date.slice(0, 4)})`, r: all, i: null, diff: null, ann: isNum(all) ? (1 + all) ** (365 / ((Date.now() - new Date(prices[0].date)) / 864e5)) - 1 : null });
    el.querySelector('#perf').innerHTML = card('Rentabilidad acumulada', table('perf', [
      { k: 'k', label: 'Periodo', align: 'left' }, { k: 'r', label: m.symbol, f: (v) => `<span class="${cls(v)}">${sgnPct(v)}</span>` }, { k: 'ann', label: 'Anualizada', f: (v) => sgnPct(v) },
      { k: 'i', label: st.idx ? INDEXES.find((x) => x[0] === st.idx)[1] : 'Índice', f: (v) => sgnPct(v) }, { k: 'diff', label: 'Diferencia', f: (v) => `<span class="${cls(v)}">${sgnPct(v)}</span>` },
    ], rows) + '<p class="note">Rentabilidad de precio (sin dividendos). La rentabilidad total con dividendos reinvertidos está en el Simulador.</p>');
  };
  await perf();
  const c5 = prices.slice(-1260).map((p) => p.close), c1 = prices.slice(-252).map((p) => p.close);
  el.querySelector('#stats').innerHTML = card('Riesgo de mercado', `<div class="kpis" style="grid-template-columns:1fr 1fr">
    <div class="kpi"><span>Volatilidad anual (1 año)</span><b>${pct(volatility(c1))}</b></div><div class="kpi"><span>Volatilidad anual (5 años)</span><b>${pct(volatility(c5))}</b></div>
    <div class="kpi"><span>Máxima caída (1 año)</span><b class="neg">${pct(maxDrawdown(c1))}</b></div><div class="kpi"><span>Máxima caída (5 años)</span><b class="neg">${pct(maxDrawdown(c5))}</b></div>
    <div class="kpi"><span>Máxima caída histórica</span><b class="neg">${pct(maxDrawdown(prices.map((p) => p.close)))}</b></div><div class="kpi"><span>Beta</span><b>${num(m.profile.beta, 2)}</b></div></div>
    <p class="note">Histórico disponible: ${prices.length.toLocaleString('es-ES')} sesiones desde ${esc(prices[0].date)}.</p>`);
}
