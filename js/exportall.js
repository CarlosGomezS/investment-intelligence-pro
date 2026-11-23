// «Descargar todo»: todo el análisis de una empresa en Excel (una hoja por bloque), CSV (un ZIP con un archivo
// por bloque), TXT (informe legible) o JSON (datos en bruto). En apps empaquetadas (WebView) donde las
// descargas no funcionan, se intenta compartir el archivo y, si tampoco, se ofrece copiarlo.
import { DEFS } from './views/tabs/statements.js?v=38c5f79f';
import { toCSV } from './export.js?v=38c5f79f';
import { asc, isNum, splitAdjustRows } from './calc/finance.js?v=38c5f79f';

const g = (r, f) => (r ? (typeof f === 'function' ? f(r) : r[f]) : null);
const clean = (v) => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : v);

export function sheets(S) {
  const { m, ratios, alerts, val, sc, rep } = S;
  const out = {};
  const p = m.profile;
  out.Resumen = [['Campo', 'Valor'], ['Empresa', p.companyName], ['Símbolo', m.symbol], ['Bolsa', p.exchange], ['País', p.country], ['Sector', p.sector], ['Industria', p.industry], ['ISIN', p.isin],
    ['Moneda cotización', m.tradeCur], ['Moneda estados', m.repCur], ['Precio', m.price], ['Capitalización', m.marketCap], ['Enterprise value', m.ev], ['Acciones', m.shares], ['Beta', m.market.beta],
    ['Puntuación total', sc.total], ['Conclusión', rep.conclusion], ['Valor intrínseco central', val.composite.value], ['Margen de seguridad', val.composite.mos], ['Potencial', val.composite.up],
    ['Descripción', p.description], ['Generado', new Date().toISOString()]];
  for (const [k, D] of Object.entries(DEFS)) {
    const r = S.raw[k]; const rows = r && r.ok ? splitAdjustRows(asc(r.data), m.splitsAdj) : [];
    out[D.title.slice(0, 31)] = [['Partida (' + m.repCur + ')', ...rows.map((x) => x.fiscalYear || String(x.date).slice(0, 4))], ...D.rows.map(([l, f]) => [l, ...rows.map((x) => clean(g(x, f)))])];
  }
  out['Datos anuales derivados'] = m.years.length ? [Object.keys(m.years[0]), ...m.years.map((y) => Object.values(y).map(clean))] : [['Sin datos']];
  out.Ratios = [['Ratio', 'Grupo', 'Fórmula', 'Actual', 'Media 5a', 'Media 10a', 'Alerta', 'Interpretación'], ...ratios.map((r) => [r.label, r.group, r.formula, clean(r.value), clean(r.avg5), clean(r.avg10), r.alert || '', r.interp])];
  const years = [...new Set(ratios.flatMap((r) => r.hist.map((h) => h.year)))].sort();
  out['Ratios históricos'] = [['Ratio', ...years], ...ratios.map((r) => [r.label, ...years.map((y) => clean((r.hist.find((h) => h.year === y) || {}).v))])];
  const G = m.growth;
  out.Crecimiento = [['Métrica', 'Valor'], ...Object.entries(G).map(([k, v]) => [k, clean(v)])];
  const R = val.dcf;
  out['Valoración DCF'] = R && !R.error ? [['Supuesto', 'Valor', 'Origen'], ...Object.entries(val.defaults).map(([k, d]) => [k, clean(val.inputs[k] ?? d.value), d.origin]), ['wacc aplicado', val.inputs.wacc, ''], [], ['Año', 'Crecimiento', 'FCF', 'Factor descuento', 'Valor presente'], ...R.rows.map((r) => [r.t, r.g, r.fcf, r.df, r.pv]), [], ['VP flujos', R.pvSum], ['VP terminal', R.pvTv], ['EV', R.ev], ['Capital', R.equity], ['Valor por acción', R.perShare], [], ['Escenario', 'Crecimiento', 'WACC', 'g terminal', 'Valor/acción'], ...R.scen.map((s) => [s.label, s.growth, s.discount, s.terminalGrowth, clean(s.result && s.result.perShare)]), [], ['WACC \\ g', ...R.sens.gs], ...R.sens.grid.map((row, i) => [R.sens.ws[i], ...row.map(clean)])] : [[R ? R.error : 'Sin DCF']];
  out.Múltiplos = [['Método', 'Múltiplo', 'Precio implícito', 'Potencial', 'Origen'], ...val.mult.map((r) => [r.method, clean(r.multiple), clean(r.value), clean(r.up), r.origin]), ['DDM', '', clean(val.ddm.value), clean(val.ddm.up), val.ddm.reason || 'Gordon']];
  out.Dividendos = [['Ex-dividendo', 'Pago', 'Ajustado', 'Declarado'], ...m.divs.map((d) => [d.date, d.paymentDate || '', clean(d.adjDividend), clean(d.dividend)])];
  out.Scoring = [['Categoría', 'Peso', 'Puntuación categoría', 'Métrica', 'Valor', 'Puntos', 'Fórmula'], ...sc.cats.flatMap((c) => c.metrics.map((x) => [c.label, c.weight, clean(c.score), x.name, x.display, clean(x.score), x.formula]))];
  out.Alertas = [['Severidad', 'Área', 'Alerta', 'Detalle'], ...alerts.map((a) => [a.sev, a.area, a.title, a.detail])];
  out['Informe final'] = [['Pregunta', 'Veredicto', 'Respuesta'], ...rep.questions.map((q) => [q.question, q.verdict, String(q.text).replace(/<[^>]+>/g, '')]), [], ['Conclusión', rep.conclusion], ['A favor', rep.pros.join(' | ')], ['En contra', rep.cons.join(' | ')]];
  out['Precios diarios'] = [['Fecha', 'Apertura', 'Máximo', 'Mínimo', 'Cierre', 'Volumen'], ...(m.priceData || []).map((x) => [x.date, clean(x.open), clean(x.high), clean(x.low), clean(x.close), clean(x.volume)])];
  out['Estimaciones'] = m.estimates.length ? [Object.keys(m.estimates[0]), ...m.estimates.map((e) => Object.values(e).map(clean))] : [['Sin estimaciones en tus fuentes']];
  out.Fuentes = [['Bloque', 'Estado', 'Fuente', 'Endpoint', 'Fecha'], ...Object.entries(S.raw).map(([k, r]) => [k, r.ok ? 'OK' : (r.error && r.error.message) || 'sin datos', r.source || '', r.endpoint || '', r.fetchedAt ? new Date(r.fetchedAt).toISOString() : ''])];
  return out;
}

export function textReport(S) {
  const { m, rep, val, sc, alerts } = S, P = (v) => (isNum(v) ? (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %' : '—'), N = (v) => (isNum(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—');
  const L = [];
  L.push(`INVESTMENT INTELLIGENCE PRO · ${m.profile.companyName || m.symbol} (${m.symbol})`, `Generado: ${new Date().toLocaleString('es-ES')}`, '');
  L.push(`Precio: ${N(m.price)} ${m.tradeCur} · Capitalización: ${N(m.marketCap)} · PER: ${N(m.pe)}`);
  L.push(`Puntuación: ${sc.total}/100 · Conclusión: ${rep.conclusion}`);
  L.push(`Valor intrínseco central: ${N(val.composite.value)} ${m.tradeCur} · Margen de seguridad: ${P(val.composite.mos)}`, '');
  L.push('== PUNTUACIÓN POR CATEGORÍA ==', ...sc.cats.map((c) => `- ${c.label}: ${c.score ?? '—'}/100 (peso ${c.weight})`), '');
  L.push('== INFORME ==', ...rep.questions.flatMap((q, i) => [`${i + 1}. ${q.question} ${q.verdict ? '→ ' + q.verdict : ''}`, '   ' + String(q.text).replace(/<[^>]+>/g, '')]), '');
  L.push('A favor: ' + (rep.pros.join('; ') || '—'), 'En contra: ' + (rep.cons.join('; ') || '—'), '');
  L.push('== ALERTAS ==', ...(alerts.length ? alerts.map((a) => `- [${a.sev}] ${a.title}: ${a.detail}`) : ['- Ninguna']), '');
  L.push('== RATIOS ==', ...S.ratios.map((r) => `- ${r.label}: ${isNum(r.value) ? (r.fmt === 'pct' ? P(r.value) : N(r.value)) : '—'} · ${r.interp}`), '');
  for (const [name, rows] of Object.entries(sheets(S))) if (!['Resumen', 'Informe final', 'Ratios', 'Precios diarios'].includes(name)) { L.push(`== ${name.toUpperCase()} ==`); for (const r of rows) L.push(r.map((c) => String(c ?? '')).join('\t')); L.push(''); }
  L.push('Aviso: análisis automático con datos de terceros. No es asesoramiento financiero.');
  return L.join('\n');
}

async function deliver(name, blob) {
  // 1) Compartir (funciona en Android aunque la app no admita descargas)
  try { const file = new File([blob], name, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  // 2) Descarga normal
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return 'downloaded'; } catch {}
  return 'failed';
}

export async function exportAll(S, fmt) {
  const base = `${S.sym}_analisis_${new Date().toISOString().slice(0, 10)}`;
  const sh = sheets(S);
  if (fmt === 'xlsx') {
    if (!window.XLSX) throw new Error('La librería de Excel no ha cargado');
    const wb = window.XLSX.utils.book_new();
    for (const [n, rows] of Object.entries(sh)) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), n.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
    const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return deliver(base + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  if (fmt === 'csv') {
    if (!window.JSZip) throw new Error('La librería ZIP no ha cargado');
    const z = new window.JSZip();
    for (const [n, rows] of Object.entries(sh)) z.file(`${n.replace(/[^\wáéíóúñÁÉÍÓÚÑ ]+/g, '').replace(/\s+/g, '_')}.csv`, '﻿' + toCSV(rows));
    return deliver(base + '_csv.zip', await z.generateAsync({ type: 'blob' }));
  }
  if (fmt === 'txt') return deliver(base + '.txt', new Blob([textReport(S)], { type: 'text/plain;charset=utf-8' }));
  if (fmt === 'json') return deliver(base + '.json', new Blob([JSON.stringify({ symbol: S.sym, generated: new Date().toISOString(), raw: S.raw }, null, 1)], { type: 'application/json' }));
  if (fmt === 'copy') { await navigator.clipboard.writeText(textReport(S)); return 'copied'; }
}
