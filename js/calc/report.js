// Informe final: responde a las 13 preguntas con los datos calculados y emite una conclusión razonada.
import { isNum } from './finance.js?v=5149fba8';
import { fmtB } from './alerts.js?v=5149fba8';

const P = (v, d = 1) => (isNum(v) ? (v * 100).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %' : 'sin dato');
const N = (v, d = 2) => (isNum(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }) : 'sin dato');
const cat = (sc, k) => (sc.cats.find((c) => c.key === k) || {}).score;
const level = (s) => (s == null ? 'sin datos suficientes' : s >= 75 ? 'sí, claramente' : s >= 60 ? 'sí, con matices' : s >= 45 ? 'a medias' : 'no');

export function buildReport(m, sc, val, alerts, dec) {
  const T = m.T, cur = m.tradeCur;
  const q = [];
  const A = (question, verdict, text, s) => q.push({ question, verdict, text, score: s });
  A('¿Es una empresa de calidad?', level(cat(sc, 'calidad')), `Piotroski ${m.scores.piotroskiScore ?? '—'}/9, margen bruto ${P(T.grossMargin)}, la caja operativa equivale al ${P(T.incomeQuality)} del beneficio.`, cat(sc, 'calidad'));
  A('¿Está creciendo?', level(cat(sc, 'crecimiento')), `Ventas: ${P(m.growth.rev1)} el último año, ${P(m.growth.rev5)} anual a 5 años${isNum(m.growth.rev10) ? ` y ${P(m.growth.rev10)} a 10` : ''}. BPA ${P(m.growth.eps5)} anual (5a). Analistas esperan ${P(m.growth.analystRev)} anual en ventas.${growthQuality(m)}`, cat(sc, 'crecimiento'));
  A('¿Es rentable?', level(cat(sc, 'rentabilidad')), `${m.last.negCapital ? `ROCE ${P(T.rc ?? m.last.rc)} (ROIC y ROE no aplican: patrimonio negativo por recompras)` : `ROIC ${P(T.roic ?? m.last.roic)}, ROE ${P(T.roe ?? m.last.roe)}`}, margen operativo ${P(T.operatingMargin)} y neto ${P(T.netMargin)}.`, cat(sc, 'rentabilidad'));
  const sol = cat(sc, 'solidez');
  A('¿Tiene deuda preocupante?', sol == null ? 'sin datos suficientes' : sol >= 65 ? 'no' : sol >= 45 ? 'vigilable' : 'sí', `Deuda total ${fmtB(m.X(T.debt))} ${cur}, deuda neta ${fmtB(m.netDebt)} ${cur} (${N(T.netDebtToEbitda, 1)}× EBITDA). Cobertura de intereses ${N(T.interestCoverage, 1)}×.`, sol);
  A('¿Genera efectivo?', level(cat(sc, 'caja')), `FCF ${fmtB(m.X(T.fcf))} ${cur} (${P(T.fcfMargin)} de las ventas), ${N(T.fcfConversion, 2)}× el beneficio neto.`, cat(sc, 'caja'));
  A('¿Tiene ventajas competitivas?', level(cat(sc, 'moat')), `${m.stats.roicIsRoce ? 'ROCE' : 'ROIC'} medio 5a ${P(m.stats.roicAvg5)} frente a un WACC de ${P(m.market.wacc && m.market.wacc.wacc)}; margen bruto con desviación de ${P(m.stats.gmStd)} en 10 años. Indicadores cuantitativos: confirma el foso con el módulo Moat.`, cat(sc, 'moat'));
  const vs = cat(sc, 'valoracion');
  A('¿Está cara o barata?', vs == null ? 'sin datos suficientes' : vs >= 65 ? 'barata' : vs >= 45 ? 'precio razonable' : 'cara', `PER ${N(m.pe, 1)}×, rentabilidad FCF ${P(isNum(T.fcf) && m.marketCap ? m.X(T.fcf) / m.marketCap : null)}.`, vs);
  const c = val.composite;
  A('¿Cuál es su valor intrínseco estimado?', isNum(c.value) ? `${N(c.value)} ${cur}` : 'no calculable', isNum(c.value) ? `${c.n} estimaciones: primero la mediana de cada familia (DCF, múltiplos propios, de competidores${val.ddm && val.ddm.applicable ? ', DDM' : ''}), luego se combinan con el DCF a doble peso: media ponderada si hay 2 familias, mediana si hay más. Rango entre familias ${N(c.low)}–${N(c.high)} ${cur}. DCF base: ${val.dcf && isNum(val.dcf.perShare) ? N(val.dcf.perShare) + ' ' + cur : 'no aplicable'}.` : c.reason || 'Faltan datos (FCF negativo o sin historial).', null);
  A('¿Qué margen de seguridad ofrece?', isNum(c.mos) ? P(c.mos, 0) : 'sin dato', isNum(c.mos) ? (c.mos > 0.25 ? 'Holgado: el precio deja colchón ante errores de estimación.' : c.mos > 0 ? 'Escaso: poco colchón ante errores de estimación.' : (c.value === 0 ? 'Negativo: el valor estimado del capital es 0 (la deuda supera al valor de la empresa).' : `Negativo: el precio supera el valor estimado en un ${P(isNum(c.value) && c.value > 0 ? m.price / c.value - 1 : null, 0)}.`)) : '', null);
  const risks = alerts.slice(0, 5).map((a) => a.title.toLowerCase());
  A('¿Cuáles son sus principales riesgos?', risks.length ? `${alerts.length} alertas` : 'sin alertas cuantitativas', risks.length ? 'Detectados en los datos: ' + risks.join('; ') + '.' : 'Los estados no muestran anomalías; revisa riesgos de negocio, regulación y noticias.', null);
  A('¿Qué tendría que pasar para que la inversión saliera mal?', '', badCase(m, val), null);
  A('¿Qué tendría que pasar para que multiplicase su valor?', '', goodCase(m, val), null);
  const fit = longTermFit(sc);
  A('¿Es adecuada para una inversión a 5-10 años?', fit.v, fit.t, null);

  // Misma calidad y misma conclusión que la tarjeta de decisión (cuatro ejes): nunca dos veredictos distintos
  const total = sc.total, qual = dec && dec.quality ? dec.quality.score : mean3(cat(sc, 'calidad'), cat(sc, 'rentabilidad'), cat(sc, 'moat'), cat(sc, 'caja'));
  const rel = val.reliability || {};
  let conclusion = sc.coverage < 0.45 || total == null ? 'Empresa difícil de valorar por falta de información' : dec ? dec.verdict : 'Sin conclusión';
  // Valoración poco fiable: se dice en la conclusión, no solo en letra pequeña
  if (rel.level === 'baja' || rel.level === 'muy baja') conclusion += ` (valoración de fiabilidad ${rel.level}: ${(rel.reasons || []).slice(0, 2).join('; ')})`;
  // Bancos, aseguradoras, REIT y eléctricas: el DCF de caja libre y la puntuación estándar no les aplican bien
  if (!(dec && /Sector que esta evaluación/.test(dec.verdict)) && !/es financiera/.test(conclusion) && /financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i.test(`${m.profile.sector || ''} ${m.profile.industry || ''}`)) conclusion += ' (aviso: es financiera, inmobiliaria o eléctrica; el DCF y la puntuación estándar no se aplican bien a este sector)';
  const pros = sc.cats.filter((x) => x.score != null && x.score >= 70).map((x) => `${x.label} (${x.score}/100)`);
  const cons = sc.cats.filter((x) => x.score != null && x.score < 60).map((x) => `${x.label} solo ${x.score}/100`).concat(alerts.filter((a) => a.sev !== 'baja').map((a) => a.title));
  if (!m.ttmIsReal) cons.push(`Análisis con datos del ${m.periodLabel}, sin los últimos trimestres`);
  if ((val.mult || []).some((r) => r.exclude)) cons.push('El crecimiento se ha frenado frente a su historia: sus múltiplos pasados ya no sirven de referencia');
  cons.push('Riesgos cualitativos que los números no ven: competencia, cambio tecnológico (p. ej. IA), regulación y calidad de la dirección. Revísalos en la pestaña Ventajas competitivas y en las noticias');
  return { questions: q, conclusion, pros, cons, total, quality: qual };
}

function mean3(...v) { const x = v.filter(isNum); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }

function growthQuality(m) {
  const Y = m.years.slice(-6); if (Y.length < 3) return '';
  // Sin datos de adquisiciones, deuda o acciones no se afirma que el crecimiento sea orgánico
  const acqY = Y.slice(1).map((y) => y.acquisitions), acq = acqY.some(isNum) ? acqY.filter(isNum).reduce((a, b) => a + b, 0) : null;
  const rev = isNum(Y[Y.length - 1].revenue) && isNum(Y[0].revenue) ? Y[Y.length - 1].revenue - Y[0].revenue : null;
  const debt = isNum(Y[Y.length - 1].debt) && isNum(Y[0].debt) ? Y[Y.length - 1].debt - Y[0].debt : null;
  const parts = [];
  if (acq > 0 && rev > 0 && acq > 0.5 * rev) parts.push(`las adquisiciones (${fmtB(acq)}) equivalen a más de la mitad del aumento de ventas, así que parte del crecimiento es comprado`);
  if (debt > 0 && rev > 0 && debt > rev) parts.push('la deuda ha crecido más que las ventas');
  if (isNum(m.growth.shares5) && m.growth.shares5 > 0.02) parts.push('se apoya en emisión de acciones');
  if (parts.length) return ' Ojo: ' + parts.join('; ') + '.';
  const miss = [!isNum(acq) && 'adquisiciones', !isNum(debt) && 'deuda', !isNum(m.growth.shares5) && 'número de acciones'].filter(Boolean);
  return miss.length ? ` Faltan datos de ${miss.join(', ')} para saber si el crecimiento es orgánico.` : ' El crecimiento parece mayoritariamente orgánico (pocas adquisiciones, sin dilución ni deuda creciente).';
}
function badCase(m, val) {
  const s = val.dcf && val.dcf.scen ? val.dcf.scen.find((x) => x.id === 'pesimista') : null;
  return `Que el crecimiento del FCF se quede en ${P(s ? s.growth : null)} anual o el coste de capital suba un punto (escenario pesimista: ${s && s.result && !s.result.error ? N(s.result.perShare) + ' ' + m.tradeCur + ' por acción' : 'n/d'}), que los márgenes vuelvan por debajo de su media de 5 años (${P(m.stats.omAvg5)} operativo) o que el múltiplo se comprima hacia su mínimo histórico.`;
}
function goodCase(m, val) {
  const s = val.dcf && val.dcf.scen ? val.dcf.scen.find((x) => x.id === 'optimista') : null;
  return `Sostener un crecimiento del FCF de ${P(s ? s.growth : null)} anual con márgenes estables (escenario optimista: ${s && s.result && !s.result.error ? N(s.result.perShare) + ' ' + m.tradeCur : 'n/d'}), mantener el ROIC por encima del ${P(m.stats.roicAvg5)} mientras reinvierte, y que el mercado no reduzca el múltiplo.`;
}
function longTermFit(sc) {
  // Solo con los pilares que tienen nota (sin dato no vale 50); con menos de 3 de 5 no se opina
  const sc5 = ['calidad', 'rentabilidad', 'moat', 'estabilidad', 'solidez'].map((k) => (sc.cats.find((c) => c.key === k) || {}).score).filter(isNum);
  if (sc5.length < 3) return { v: 'sin datos suficientes', t: `Solo hay nota en ${sc5.length} de los 5 pilares de largo plazo (calidad, rentabilidad, foso, estabilidad y solidez).` };
  const s = sc5.reduce((a, b) => a + b, 0) / sc5.length;
  if (s >= 70) return { v: 'sí', t: 'Calidad, rentabilidad y estabilidad compatibles con mantenerla muchos años; el precio de entrada decide la rentabilidad.' };
  if (s >= 55) return { v: 'con matices', t: 'Negocio aceptable, pero alguno de los pilares de largo plazo (foso, estabilidad o deuda) es mejorable.' };
  return { v: 'no parece', t: 'Los fundamentos de largo plazo son débiles o inestables.' };
}
