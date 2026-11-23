// Analistas e insiders: estimaciones, precios objetivo, recomendaciones y su evolución, operaciones de directivos y participación institucional.
import { data } from '../../providers/index.js?v=30cb3a13';
import { fundamentals } from '../../ui/charts.js?v=30cb3a13';
import { esc, card, num, pct, big, date, cls, sgnPct, unavailable, source, table } from '../../ui/dom.js?v=30cb3a13';
import { isNum, asc } from '../../calc/finance.js?v=30cb3a13';
import { extra } from '../company.js?v=30cb3a13';

const TX = { 'P-Purchase': 'Compra', 'S-Sale': 'Venta', 'A-Award': 'Concesión', 'M-Exempt': 'Ejercicio de opciones', 'F-InKind': 'Retención fiscal', 'G-Gift': 'Donación', 'D-Return': 'Devolución', 'C-Conversion': 'Conversión', 'J-Other': 'Otra' };

export async function render(el, S) {
  const m = S.m, cur = m.tradeCur;
  el.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const q = new Date(); const yq = q.getMonth() < 3 ? [q.getFullYear() - 1, 3] : [q.getFullYear(), Math.floor(q.getMonth() / 3)];
  const [gr, gh, ins, inst] = await Promise.allSettled([
    extra(S, 'grades', () => data.grades(m.symbol, 40)), extra(S, 'gradesH', () => data.gradesHistorical(m.symbol, 24)),
    extra(S, 'insiders', () => data.insiders(m.symbol, 100)), extra(S, 'inst', () => data.institutional(m.symbol, yq[0], yq[1])),
  ]);
  const est = m.estimates.filter((e) => String(e.date).slice(0, 4) >= String(m.last.year));
  const pt = m.priceTarget, g = m.grades;
  const tot = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((a, k) => a + (g[k] || 0), 0);
  const dist = [['Compra fuerte', g.strongBuy, 'var(--pos)'], ['Comprar', g.buy, 'color-mix(in srgb,var(--pos) 60%,var(--panel2))'], ['Mantener', g.hold, 'var(--warn)'], ['Vender', g.sell, 'color-mix(in srgb,var(--neg) 60%,var(--panel2))'], ['Venta fuerte', g.strongSell, 'var(--neg)']];
  const I = ins.status === 'fulfilled' ? (ins.value.data || []) : [];
  const yAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const I12 = I.filter((t) => (t.transactionDate || t.filingDate || '') >= yAgo);
  const val = (t) => (isNum(t.securitiesTransacted) && isNum(t.price) ? t.securitiesTransacted * t.price : null);
  const buys = I12.filter((t) => /^P/.test(t.transactionType || '')), sells = I12.filter((t) => /^S/.test(t.transactionType || ''));
  const sum = (a) => a.reduce((s, t) => s + (val(t) || 0), 0);
  const instD = inst.status === 'fulfilled' ? (Array.isArray(inst.value.data) ? inst.value.data[0] : inst.value.data) : null;
  const GH = gh.status === 'fulfilled' ? asc(gh.value.data || []) : [];

  el.innerHTML = `<div class="grid g3">
    ${card('Precio objetivo de los analistas', isNum(pt.targetConsensus) ? `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Medio</span><b>${num(pt.targetConsensus)} ${esc(cur)}</b><small class="${cls(pt.targetConsensus - m.price)}">${sgnPct(pt.targetConsensus / m.price - 1, 0)}</small></div><div class="kpi"><span>Mediana</span><b>${num(pt.targetMedian)}</b></div>
      <div class="kpi"><span>Máximo</span><b>${num(pt.targetHigh)}</b><small>${sgnPct(pt.targetHigh / m.price - 1, 0)}</small></div><div class="kpi"><span>Mínimo</span><b>${num(pt.targetLow)}</b><small>${sgnPct(pt.targetLow / m.price - 1, 0)}</small></div></div>${source(m.prov.priceTarget)}` : unavailable('Precio objetivo', S.raw.priceTarget.error))}
    ${card('Recomendaciones', tot ? `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin-bottom:10px">${dist.map(([l, v, c]) => (v ? `<i title="${l}: ${v}" style="width:${(v / tot) * 100}%;background:${c}"></i>` : '')).join('')}</div>${dist.map(([l, v]) => `<div class="row between" style="font-size:13px;padding:2px 0"><span>${l}</span><b>${v || 0}</b></div>`).join('')}<p class="note">Consenso: <b>${esc(g.consensus || '—')}</b> (${tot} analistas).</p>${source(m.prov.gradesConsensus)}` : unavailable('Recomendaciones', S.raw.gradesConsensus.error))}
    ${card('Insiders (12 meses)', ins.status === 'fulfilled' ? `<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><span>Compras en mercado</span><b class="pos">${buys.length}</b><small>${big(sum(buys), cur)}</small></div><div class="kpi"><span>Ventas en mercado</span><b class="neg">${sells.length}</b><small>${big(sum(sells), cur)}</small></div></div><p class="note">${sum(buys) > sum(sells) && buys.length ? 'Los directivos compran por más importe del que venden: señal de confianza.' : buys.length > sells.length && sum(sells) > sum(buys) ? 'Hay más compras que ventas en número, pero las ventas son mayores en importe: no es una señal de confianza.' : sells.length && !buys.length ? 'Solo ventas: habitual por planes de retribución (10b5-1); preocupa más si son masivas o del CEO/CFO.' : 'Actividad equilibrada.'}</p>` : unavailable('Insiders', ins.reason))}
  </div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Estimaciones de ingresos y BPA', est.length ? table('estT', [{ k: (r) => String(r.date).slice(0, 4), label: 'Ejercicio', align: 'left' }, { k: 'revenueAvg', label: 'Ventas (media)', f: (v) => big(v) }, { k: (r) => [r.revenueLow, r.revenueHigh], label: 'Rango ventas', f: (v) => `${big(v[0])} – ${big(v[1])}` }, { k: 'epsAvg', label: 'BPA (media)', f: (v) => num(v) }, { k: (r) => [r.epsLow, r.epsHigh], label: 'Rango BPA', f: (v) => `${num(v[0])} – ${num(v[1])}` }, { k: 'numAnalystsEps', label: 'Analistas', f: (v) => v ?? '—' }], est, { dense: true }) + `<p class="note">Crecimiento anual implícito de ventas: ${pct(m.growth.analystRev)}; de BPA: ${pct(m.growth.analystEps)}. Son estimaciones, no datos.</p>${source(m.prov.estimates)}` : unavailable('Estimaciones', S.raw.estimates.error))}
    ${card('Evolución de las recomendaciones (revisiones)', GH.length ? '<div class="chart"><canvas id="an1"></canvas></div>' + source(gh.value) : unavailable('Histórico de recomendaciones', gh.reason))}
    ${card('Últimos cambios de recomendación', gr.status === 'fulfilled' && gr.value.data.length ? `<div style="max-height:380px;overflow:auto">${table('grT', [{ k: 'date', label: 'Fecha', f: date, align: 'left' }, { k: 'gradingCompany', label: 'Entidad', align: 'left' }, { k: 'previousGrade', label: 'Antes' }, { k: 'newGrade', label: 'Ahora' }, { k: 'action', label: 'Acción', f: (v) => ({ upgrade: '↑ Mejora', downgrade: '↓ Rebaja', maintain: 'Mantiene', init: 'Inicia', reiterate: 'Reitera' }[v] || esc(v || '')) }], gr.value.data.slice(0, 40), { dense: true })}</div>${source(gr.value)}` : unavailable('Cambios de recomendación', gr.reason))}
    ${card('Operaciones de directivos', ins.status === 'fulfilled' && I.length ? `<div style="max-height:380px;overflow:auto">${table('insT', [{ k: 'transactionDate', label: 'Fecha', f: date, align: 'left' }, { k: 'reportingName', label: 'Directivo', align: 'left' }, { k: 'typeOfOwner', label: 'Cargo', align: 'left' }, { k: 'transactionType', label: 'Tipo', f: (v) => esc(TX[v] || v || '') }, { k: 'securitiesTransacted', label: 'Acciones', f: (v) => num(v, 0) }, { k: 'price', label: 'Precio', f: (v) => num(v) }, { k: (r) => val(r), label: 'Importe', f: (v) => big(v) }], I.slice(0, 60), { dense: true })}</div>${source(ins.value)}` : unavailable('Operaciones de directivos', ins.reason))}
  </div>
  <div style="margin-top:14px">${card('Participación institucional', instD ? `<div class="kpis">${[['Inversores con posición', instD.investorsHolding, (v) => num(v, 0)], ['Variación de inversores', instD.investorsHoldingChange, (v) => num(v, 0)], ['% del capital', instD.ownershipPercent, (v) => num(v, 2) + ' %'], ['Acciones en carteras 13F', instD.numberOf13Fshares, (v) => big(v)], ['Variación de acciones', instD.numberOf13FsharesChange, (v) => big(v)], ['Valor invertido', instD.totalInvested, (v) => big(v, 'USD')], ['Nuevas posiciones', instD.newPositions, (v) => num(v, 0)], ['Posiciones cerradas', instD.closedPositions, (v) => num(v, 0)]].map(([l, v, f]) => `<div class="kpi"><span>${l}</span><b>${isNum(v) ? f(v) : '—'}</b></div>`).join('')}</div><p class="note">Trimestre ${yq[1]}T ${yq[0]} según formularios 13F.</p>${source(inst.value)}` : unavailable('Participación institucional', inst.reason))}</div>`;
  if (GH.length) fundamentals('an1', GH.map((x) => String(x.date).slice(0, 7)), [{ label: 'Compra fuerte', data: GH.map((x) => x.analystRatingsStrongBuy) }, { label: 'Comprar', data: GH.map((x) => x.analystRatingsBuy) }, { label: 'Mantener', data: GH.map((x) => x.analystRatingsHold) }, { label: 'Vender', data: GH.map((x) => (x.analystRatingsSell || 0) + (x.analystRatingsStrongSell || 0)) }], { fmt: 'n', stacked: true });
}
