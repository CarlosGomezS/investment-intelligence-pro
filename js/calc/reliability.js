// Fiabilidad de la valoración: independiente del valor intrínseco. Dice cuánto fiarse del número y por qué.
// Parte de 100 y resta por cada debilidad conocida de los datos o de los supuestos. Los motivos se muestran tal cual.
import { isNum } from './finance.js?v=c8fdab36';

const FIN = /financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i;

export function reliability(m, val, sc, raw) {
  const R = []; let s = 100;
  const minus = (n, why) => { s -= n; R.push(why); };
  const c = val.composite || {}, d = val.defaults || {}, dcf = val.dcf || {}, I = val.inputs || {};
  // Supuestos que el usuario ha fijado a mano en Valoración: ya no cuentan como «supuestos por falta de datos»
  const edited = (k) => isNum(I[k]) && d[k] && isNum(d[k].value) && Math.abs(I[k] - d[k].value) > 1e-9;
  // Bloqueantes: sin esto no hay valoración que valga
  if (m.fxMissing) return { level: 'no valorable', score: 0, reasons: ['falta el tipo de cambio entre la moneda de las cuentas y la de cotización'] };
  if (!isNum(c.value)) return { level: 'no valorable', score: 0, reasons: [c.reason || 'no hay al menos dos métodos de valoración con datos suficientes'] };
  if (isNum(sc.coverage) && sc.coverage < 0.45) return { level: 'no valorable', score: 0, reasons: [`solo hay datos para el ${Math.round(sc.coverage * 100)} % de las métricas`] };

  if (FIN.test(`${m.profile.sector || ''} ${m.profile.industry || ''}`)) minus(35, 'es financiera, inmobiliaria o eléctrica: el DCF de caja libre y los múltiplos de EBITDA no se aplican bien');
  const nYears = (m.years || []).filter((y) => isNum(y.revenue)).length;
  if (nYears < 5) minus(20, `solo ${nYears} años de cuentas`);
  if (isNum(sc.coverage) && sc.coverage < 0.7) minus(15, `datos para el ${Math.round(sc.coverage * 100)} % de las métricas`);
  if (d.growth && /falta de datos/.test(d.growth.origin || '') && !edited('growth')) minus(15, 'crecimiento del DCF supuesto (5 %) por falta de historial');
  const manualW = isNum(I.waccOverride); // con WACC manual, beta, bono y prima no intervienen
  if (m.market.betaAssumed && !edited('beta') && !manualW) minus(10, 'beta supuesta (1) por falta de datos');
  if (m.market.rfAssumed && !edited('rf') && !manualW) minus(5, 'tipo sin riesgo supuesto (4,5 %)');
  if (m.market.erpAssumed && !edited('erp') && !manualW) minus(5, 'prima de riesgo supuesta (4,5 %)');
  if (m.repCur && m.repCur !== 'USD' && !edited('rf') && !isNum(I.waccOverride)) minus(10, `flujos en ${m.repCur} descontados con el bono de EE. UU. (no hay dato gratuito del bono de su país; puedes cambiarlo en Valoración)`);
  if (isNum(dcf.tvShare)) { if (dcf.tvShare > 0.8) minus(15, `el ${Math.round(dcf.tvShare * 100)} % del DCF depende del valor terminal`); else if (dcf.tvShare > 0.7) minus(8, `el ${Math.round(dcf.tvShare * 100)} % del DCF depende del valor terminal`); }
  if (isNum(c.low) && isNum(c.high) && c.low <= 0 && c.high > 0) minus(15, 'un método da valor 0 (deuda mayor que el valor) y otro no: discrepan por completo');
  else if (isNum(c.low) && isNum(c.high) && c.low > 0) { const r = c.high / c.low; if (r > 2.5) minus(15, `los métodos discrepan mucho (de ${c.low.toFixed(0)} a ${c.high.toFixed(0)})`); else if (r > 1.6) minus(8, 'los métodos discrepan bastante entre sí'); }
  if (c.n === 2) minus(5, 'solo dos métodos de valoración');
  if (c.contrasted === false) minus(15, `sin contraste entre flujos y múltiplos: solo ${(c.families || []).map((f) => ({ dcf: 'DCF', ddm: 'dividendos', hist: 'múltiplos propios', peers: 'múltiplos de competidores' })[f]).join(' y ')}`);
  const W = m.market.wacc;
  if (W && W.kdAssumed && !manualW && !isNum(I.costDebt)) { if (W.wd > 0.2) minus(15, `coste de la deuda desconocido con un ${Math.round(W.wd * 100)} % de deuda en el capital: el WACC usa el coste del capital propio`); else minus(5, 'coste de la deuda desconocido (poca deuda: efecto pequeño en el WACC)'); }
  if (m.balanceFrom) minus(10, 'el balance del último año aún no está publicado (se usa el anterior)');
  if (m.sharesNote) minus(5, `número de acciones ${m.sharesNote}`);
  if (m.ttmPartial) minus(5, 'los últimos 12 meses llegan incompletos (faltan flujos de caja): todo se calcula con el último ejercicio cerrado, sin mezclar periodos');
  if (raw && Object.values(raw).some((r) => r && r.ok && r.stale)) minus(10, 'algunos datos vienen de caché caducada');
  s = Math.max(0, Math.min(100, s));
  const level = s >= 75 ? 'alta' : s >= 55 ? 'media' : s >= 35 ? 'baja' : 'muy baja';
  return { level, score: s, reasons: R };
}

/** Nivel de cobertura de datos de la puntuación (umbrales propuestos, no un estándar universal). */
export function coverageTier(cov) {
  if (!isNum(cov)) return { label: 'sin datos', ok: false };
  if (cov >= 0.9) return { label: 'evaluación completa', ok: true };
  if (cov >= 0.7) return { label: 'evaluación parcial', ok: true };
  if (cov >= 0.45) return { label: 'fiabilidad limitada', ok: true };
  return { label: 'datos insuficientes: sin veredicto', ok: false };
}
