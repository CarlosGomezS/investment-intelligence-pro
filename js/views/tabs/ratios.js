// Ratios financieros: valor actual, evolución, medias 5/10 años, comparación sectorial, interpretación y alertas.
import { fundamentals } from '../../ui/charts.js?v=f01d36e2';
import { esc, card, pct, num } from '../../ui/dom.js?v=f01d36e2';
import { fmtRatio } from '../../calc/ratios.js?v=f01d36e2';
import { isNum, median } from '../../calc/finance.js?v=f01d36e2';
import { loadPeers } from './peers.js?v=f01d36e2';
import { exportCSV } from '../../export.js?v=f01d36e2';

const PEER_KEY = { pe: 'pe', evebitda: 'evEbitda', roe: 'roe', roic: 'roic', gm: 'grossMargin', om: 'opMargin', nm: 'netMargin', de: 'de', nde: 'ndEbitda', fcfy: 'fcfYield' };
let selected = 'pe';

function joint(S) {
  const R = Object.fromEntries(S.ratios.map((r) => [r.id, r.value])), m = S.m, out = [];
  if (isNum(R.pe) && R.pe > 30) out.push(isNum(R.peg) && R.peg < 1.5 ? `PER alto (${fmtRatio(R.pe, 'x')}) pero justificado por el crecimiento esperado (PEG ${num(R.peg, 2)}).` : `PER alto (${fmtRatio(R.pe, 'x')}) sin un crecimiento que lo compense (PEG ${num(R.peg, 2)}).`);
  if (isNum(R.roe) && R.roe > 0.2 && isNum(R.de) && R.de > 1.5) out.push(`El ROE de ${pct(R.roe)} está apalancado (deuda/patrimonio ${num(R.de, 2)}); el ROIC de ${pct(R.roic)} refleja mejor la rentabilidad del negocio.`);
  if (isNum(R.roe) && R.roe > 0.5 && (!isNum(R.de) || R.de === null)) out.push('ROE muy elevado con patrimonio pequeño o negativo (recompras): úsalo con cautela.');
  if (isNum(R.dy) && R.dy > 0.05 && isNum(R.payout) && R.payout > 0.9) out.push(`Dividendo alto (${pct(R.dy, 2)}) con payout de ${pct(R.payout)}: riesgo de recorte.`);
  if (isNum(R.fcfy) && isNum(R.ey) && R.fcfy < R.ey * 0.6) out.push('La rentabilidad por FCF es muy inferior a la de beneficio: el beneficio contable no se está convirtiendo en caja.');
  if (isNum(R.cr) && R.cr < 1 && isNum(R.nde) && R.nde < 1) out.push('Liquidez corriente < 1 pero con poca deuda neta: típico de negocios que cobran antes de pagar; no es necesariamente un problema.');
  if (isNum(R.gm) && R.gm > 0.5 && isNum(R.om) && R.om < 0.1) out.push('Margen bruto alto pero operativo bajo: el negocio tiene poder de precio pero gasta mucho en estructura, ventas o I+D.');
  if (isNum(R.evebitda) && isNum(R.evebit) && R.evebit > R.evebitda * 1.6) out.push('EV/EBIT muy por encima de EV/EBITDA: las amortizaciones pesan mucho (negocio intensivo en capital).');
  if (m.market.rf10 && isNum(R.ey) && R.ey < m.market.rf10) out.push(`La rentabilidad por beneficio (${pct(R.ey)}) es inferior al bono a 10 años (${pct(m.market.rf10, 2)}): el precio descuenta crecimiento.`);
  return out;
}

export async function render(el, S) {
  let peers = null; try { peers = await loadPeers(S); } catch {}
  const pr = peers && peers.rows ? peers.rows.filter((r) => !r.self) : [];
  const groups = [...new Set(S.ratios.map((r) => r.group))];
  const pm = (r) => (PEER_KEY[r.id] && pr.length ? median(pr.map((p) => p[PEER_KEY[r.id]]).filter((v) => isNum(v) && (r.fmt !== 'x' || v > 0))) : null);
  const ttmNote = S.m.ttmIsReal ? 'Valores actuales: últimos doce meses (TTM).' : 'El proveedor no ofrece TTM con tu plan: el valor actual es el del último ejercicio cerrado.';
  const insights = joint(S);
  el.innerHTML = `${insights.length ? card('Lectura conjunta', `<ul style="margin:0;padding-left:18px">${insights.map((t) => `<li style="margin:4px 0">${esc(t)}</li>`).join('')}</ul>`) + '<div style="height:14px"></div>' : ''}
    ${card('Ratios financieros y fundamentales', `<div class="tablewrap"><table id="ratT"><thead><tr><th class="l">Ratio</th><th>Actual</th><th>Media 5a</th><th>Media 10a</th><th>Mediana competidores</th><th class="l">Interpretación</th></tr></thead><tbody>
      ${groups.map((g) => `<tr><td class="l" colspan="6" style="color:var(--mute);font-size:11.5px;font-weight:600;padding-top:14px">${esc(g)}</td></tr>` + S.ratios.filter((r) => r.group === g).map((r) => `<tr data-id="${r.id}" style="cursor:pointer${r.id === selected ? ';background:var(--panel2)' : ''}"><td class="l"><b>${esc(r.label)}</b><br><span class="formula">${esc(r.formula)}</span></td><td><b>${fmtRatio(r.value, r.fmt)}</b></td><td>${fmtRatio(r.avg5, r.fmt)}</td><td>${fmtRatio(r.avg10, r.fmt)}</td><td>${fmtRatio(pm(r), r.fmt)}</td><td class="l" style="min-width:260px">${esc(r.interp)}${r.alert ? `<br><span class="pill alta">${esc(r.alert)}</span>` : ''}</td></tr>`).join('')).join('')}
      </tbody></table></div><p class="note">${ttmNote} Medias calculadas solo con años disponibles (mínimo 3 para 5a y 8 para 10a). Pulsa un ratio para ver su evolución. <button class="btn sm" id="rcsv">Exportar CSV</button></p>`)}
    <div style="margin-top:14px" id="rch"></div>`;
  const chart = () => {
    const r = S.ratios.find((x) => x.id === selected);
    const box = el.querySelector('#rch');
    if (!r.hist.length) { box.innerHTML = card(`Evolución: ${esc(r.label)}`, '<div class="empty">Sin histórico anual para este ratio con el proveedor actual.</div>'); return; }
    box.innerHTML = card(`Evolución histórica: ${esc(r.label)}`, '<div class="chart"><canvas id="rc"></canvas></div>');
    const fmt = r.fmt === 'pct' ? 'pct' : r.fmt === 'x' ? 'x' : 'n';
    fundamentals('rc', r.hist.map((p) => p.year), [{ label: r.label, data: r.hist.map((p) => p.v) }, ...(isNum(r.avg5) ? [{ label: 'Media 5 años', data: r.hist.map(() => r.avg5), type: 'line', dash: [5, 4] }] : []), ...(isNum(pm(r)) ? [{ label: 'Mediana competidores (actual)', data: r.hist.map(() => pm(r)), type: 'line', dash: [2, 3] }] : [])], { fmt });
  };
  chart();
  el.querySelector('#ratT').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; selected = tr.dataset.id; el.querySelectorAll('#ratT tr[data-id]').forEach((x) => (x.style.background = x === tr ? 'var(--panel2)' : '')); chart(); el.querySelector('#rch').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  el.querySelector('#rcsv').onclick = () => exportCSV(`${S.sym}_ratios`, [['Ratio', 'Fórmula', 'Actual', 'Media 5a', 'Media 10a', 'Mediana competidores', 'Interpretación'], ...S.ratios.map((r) => [r.label, r.formula, r.value ?? '', r.avg5 ?? '', r.avg10 ?? '', pm(r) ?? '', r.interp])]);
}
