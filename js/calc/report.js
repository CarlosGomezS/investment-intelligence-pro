// Informe final: responde a las 13 preguntas con los datos calculados y emite una conclusión razonada.
import { isNum } from './finance.js?v=cc3b3e4a';
import { fmtB } from './alerts.js?v=cc3b3e4a';

const P = (v, d = 1) => (isNum(v) ? (v * 100).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }) + ' %' : 'sin dato');
const N = (v, d = 2) => (isNum(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }) : 'sin dato');
const cat = (sc, k) => (sc.cats.find((c) => c.key === k) || {}).score;
const level = (s) => (s == null ? 'sin datos suficientes' : s >= 75 ? 'sí, claramente' : s >= 60 ? 'sí, con matices' : s >= 45 ? 'a medias' : 'no');

export function buildReport(m, sc, val, alerts) {
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
  A('¿Cuál es su valor intrínseco estimado?', isNum(c.value) ? `${N(c.value)} ${cur}` : 'no calculable', isNum(c.value) ? `Mediana de ${c.n} estimaciones (DCF base con doble peso, múltiplos históricos y de competidores${val.ddm && val.ddm.applicable ? ', DDM' : ''}). Rango central ${N(c.low)}–${N(c.high)} ${cur}. DCF base: ${val.dcf && isNum(val.dcf.perShare) ? N(val.dcf.perShare) + ' ' + cur : 'no aplicable'}.` : 'Faltan datos (FCF negativo o sin historial).', null);
  A('¿Qué margen de seguridad ofrece?', isNum(c.mos) ? P(c.mos, 0) : 'sin dato', isNum(c.mos) ? (c.mos > 0.25 ? 'Holgado: el precio deja colchón ante errores de estimación.' : c.mos > 0 ? 'Escaso: poco colchón ante errores de estimación.' : (c.value === 0 ? 'Negativo: el valor estimado del capital es 0 (la deuda supera al valor de la empresa).' : `Negativo: el precio supera el valor estimado en un ${P(isNum(c.value) && c.value > 0 ? m.price / c.value - 1 : null, 0)}.`)) : '', null);
  const risks = alerts.slice(0, 5).map((a) => a.title.toLowerCase());
  A('¿Cuáles son sus principales riesgos?', risks.length ? `${alerts.length} alertas` : 'sin alertas cuantitativas', risks.length ? 'Detectados en los datos: ' + risks.join('; ') + '.' : 'Los estados no muestran anomalías; revisa riesgos de negocio, regulación y noticias.', null);
  A('¿Qué tendría que pasar para que la inversión saliera mal?', '', badCase(m, val), null);
  A('¿Qué tendría que pasar para que multiplicase su valor?', '', goodCase(m, val), null);
  const fit = longTermFit(sc);
  A('¿Es adecuada para una inversión a 5-10 años?', fit.v, fit.t, null);

  const total = sc.total, qual = mean3(cat(sc, 'calidad'), cat(sc, 'rentabilidad'), cat(sc, 'caja'), cat(sc, 'solidez'));
  let conclusion;
  if (sc.coverage < 0.45 || total == null) conclusion = 'Empresa difícil de valorar por falta de información';
  else if (qual >= 60 && !isNum(c.mos)) conclusion = 'Empresa de calidad, sin valoración fiable';
  else if (qual >= 70 && c.mos >= 0.2 && !alerts.some((a) => a.sev === 'alta') && total >= 60) conclusion = 'Empresa de gran calidad a precio atractivo';
  else if (qual >= 60 && c.mos >= -0.1 && !alerts.some((a) => a.sev === 'alta')) conclusion = 'Empresa de calidad a precio razonable';
  else if (qual >= 60 && c.mos >= -0.1) conclusion = 'Empresa de calidad, con riesgos graves que vigilar';
  else if (qual >= 60) conclusion = 'Empresa de calidad, pero sobrevalorada';
  else conclusion = 'Empresa mediocre o con riesgos elevados';
  // Bancos, aseguradoras, REIT y eléctricas: el DCF de caja libre y la puntuación estándar no les aplican bien
  if (/financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i.test(`${m.profile.sector || ''} ${m.profile.industry || ''}`)) conclusion += ' (aviso: es financiera, inmobiliaria o eléctrica; el DCF y la puntuación estándar no se aplican bien a este sector)';
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
  const acq = Y.reduce((a, y) => a + (y.acquisitions || 0), 0), rev = (Y[Y.length - 1].revenue || 0) - (Y[0].revenue || 0);
  const debt = (Y[Y.length - 1].debt || 0) - (Y[0].debt || 0);
  const parts = [];
  if (acq > 0 && rev > 0 && acq > 0.5 * rev) parts.push(`las adquisiciones (${fmtB(acq)}) equivalen a más de la mitad del aumento de ventas, así que parte del crecimiento es comprado`);
  if (debt > 0 && rev > 0 && debt > rev) parts.push('la deuda ha crecido más que las ventas');
  if (isNum(m.growth.shares5) && m.growth.shares5 > 0.02) parts.push('se apoya en emisión de acciones');
  return parts.length ? ' Ojo: ' + parts.join('; ') + '.' : ' El crecimiento parece mayoritariamente orgánico (pocas adquisiciones, sin dilución ni deuda creciente).';
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
  const g = (k) => (sc.cats.find((c) => c.key === k) || {}).score ?? 50;
  const s = (g('calidad') + g('rentabilidad') + g('moat') + g('estabilidad') + g('solidez')) / 5;
  if (s >= 70) return { v: 'sí', t: 'Calidad, rentabilidad y estabilidad compatibles con mantenerla muchos años; el precio de entrada decide la rentabilidad.' };
  if (s >= 55) return { v: 'con matices', t: 'Negocio aceptable, pero alguno de los pilares de largo plazo (foso, estabilidad o deuda) es mejorable.' };
  return { v: 'no parece', t: 'Los fundamentos de largo plazo son débiles o inestables.' };
}
