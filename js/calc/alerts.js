// Detección de anomalías sobre la serie anual. Cada alerta es cuantificada y explicada.
import { isNum, div, mean, lastAvg, cagrN } from './finance.js?v=05f60eff';

const pct = (v) => (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %';
const pp = (v) => (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' p.p.';
const gr = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b - 1 : null);

export function detectAlerts(m) {
  const Y = m.years, out = [];
  if (Y.length < 2) return out;
  const a = Y[Y.length - 1], b = Y[Y.length - 2];
  const add = (sev, area, title, detail) => out.push({ sev, area, title, detail, year: a.year });

  const rg = gr(a.revenue, b.revenue);
  if (isNum(rg) && rg < -0.1) add('alta', 'Ingresos', 'Caída brusca de ingresos', `Las ventas bajaron un ${pct(-rg)} en ${a.year} (de ${fmtB(b.revenue)} a ${fmtB(a.revenue)}).`);
  else if (isNum(rg) && rg < 0) add('media', 'Ingresos', 'Ingresos a la baja', `Las ventas cayeron un ${pct(-rg)} en ${a.year}.`);

  // Medias de los 3 años previos: exigen los 3 datos
  const avg3 = (k) => { const v = Y.slice(-4, -1).map((y) => y[k]).filter(isNum); return v.length >= 3 ? mean(v) : null; };
  const gm3 = avg3('grossMargin'), om3 = avg3('operatingMargin');
  if (isNum(a.grossMargin) && isNum(gm3) && a.grossMargin < gm3 - 0.03) add('media', 'Márgenes', 'Deterioro del margen bruto', `Margen bruto ${pct(a.grossMargin)} frente a una media de ${pct(gm3)} en los 3 años previos (${pp(a.grossMargin - gm3)}).`);
  if (isNum(a.operatingMargin) && isNum(om3) && a.operatingMargin < om3 - 0.03) add('media', 'Márgenes', 'Deterioro del margen operativo', `Margen operativo ${pct(a.operatingMargin)} frente a ${pct(om3)} de media (${pp(a.operatingMargin - om3)}).`);

  const fg = gr(a.fcf, b.fcf);
  if (isNum(a.fcf) && a.fcf < 0) add('alta', 'Caja', 'Flujo de caja libre negativo', `FCF de ${fmtB(a.fcf)} en ${a.year}: la empresa consume caja.`);
  else if (isNum(fg) && fg < -0.25) add('media', 'Caja', 'Caída del flujo de caja libre', `El FCF cayó un ${pct(-fg)} en ${a.year}.`);

  if (!a.balanceStale && isNum(a.debt) && a.debt > 0.1 * (a.assets || Infinity) && !(b.debt > 0)) add('alta', 'Deuda', 'Aparece deuda relevante', `Pasa de no tener deuda a ${fmtB(a.debt)} (${pct(a.debt / a.assets)} del activo) en un año.`);
  const dg = a.balanceStale ? null : gr(a.debt, b.debt); // balance del año aún sin publicar: no se comparan saldos
  if (isNum(dg) && dg > 0.3 && (!isNum(rg) || dg > rg + 0.15)) add('alta', 'Deuda', 'Aumento excesivo de deuda', `La deuda creció un ${pct(dg)} (hasta ${fmtB(a.debt)}) mientras las ventas variaron un ${isNum(rg) ? pct(rg) : '—'}.`);

  const s1 = gr(a.shares, b.shares), s5 = m.growth.shares5; // CAGR alineado al calendario (respeta los años que faltan)
  if (isNum(s1) && s1 > 0.03) add('media', 'Accionistas', 'Dilución de acciones', `El número de acciones aumentó un ${pct(s1)} en el último año.`);
  else if (isNum(s5) && s5 > 0.02) add('media', 'Accionistas', 'Dilución sostenida', `Las acciones crecen un ${pct(s5)} anual en 5 años: tu parte de la empresa se reduce.`);

  const roic3 = avg3('roic');
  if (isNum(a.roic) && isNum(roic3) && Y.slice(-4).every((y) => !y.negCapital) && a.roic < roic3 - 0.05) add('media', 'Rentabilidad', 'Deterioro del ROIC', `ROIC ${pct(a.roic)} frente a ${pct(roic3)} de media previa.`);

  const ig = a.balanceStale ? null : gr(a.inventory, b.inventory);
  if (isNum(ig) && isNum(rg) && ig > rg + 0.15 && a.inventory > 0.05 * a.revenue) add('media', 'Circulante', 'Inventarios crecen más que las ventas', `Inventario +${pct(ig)} frente a ventas ${pct(rg)}: posible exceso de stock o demanda más débil.`);
  const rcg = a.balanceStale ? null : gr(a.receivables, b.receivables);
  if (isNum(rcg) && isNum(rg) && rcg > rg + 0.15 && a.receivables > 0.05 * a.revenue) add('media', 'Circulante', 'Cuentas por cobrar crecen anormalmente', `Clientes pendientes de cobro +${pct(rcg)} frente a ventas ${pct(rg)}: vigila la calidad de las ventas.`);

  const iq = lastAvg(Y.map((y) => y.incomeQuality), 2);
  if (isNum(iq) && iq < 0.8 && isNum(a.netIncome) && a.netIncome > 0) add('alta', 'Calidad', 'Beneficios que no se convierten en caja', `La caja operativa es solo el ${pct(iq)} del beneficio neto (media 2 años). Lo sano es ≥ 100 %.`);

  if (!a.balanceStale && isNum(a.goodwill) && a.goodwill > 0.1 * (a.assets || Infinity) && !(b.goodwill > 0)) add('media', 'Contabilidad', 'Aparece fondo de comercio relevante', `Pasa de 0 a ${fmtB(a.goodwill)}: hubo una adquisición importante. Revisa su integración y posibles deterioros.`);
  const gw = a.balanceStale ? null : gr(a.goodwill, b.goodwill);
  if (isNum(gw) && gw > 0.25 && a.goodwill > 0.05 * (a.assets || Infinity)) add('baja', 'Contabilidad', 'Fondo de comercio en fuerte aumento', `El fondo de comercio creció un ${pct(gw)}: señal de adquisiciones relevantes. Revisa su integración y posibles deterioros futuros.`);
  if (isNum(a.taxRate) && isNum(b.taxRate) && Math.abs(a.taxRate - b.taxRate) > 0.15) add('baja', 'Contabilidad', 'Cambio brusco del tipo impositivo efectivo', `Pasó de ${pct(b.taxRate)} a ${pct(a.taxRate)}: puede haber partidas extraordinarias que distorsionan el beneficio.`);

  if (isNum(a.currentRatio) && a.currentRatio < 1 && isNum(a.cash) && isNum(a.shortTermDebt) && a.cash < a.shortTermDebt) add('alta', 'Liquidez', 'Riesgo de liquidez', `Liquidez corriente ${fx(a.currentRatio, 2)} y la caja (${fmtB(a.cash)}) no cubre la deuda a corto (${fmtB(a.shortTermDebt)}).`);
  if (isNum(a.interestCoverage) && a.interestCoverage < 2) add('alta', 'Deuda', 'Cobertura de intereses débil', `El beneficio operativo cubre solo ${fx(a.interestCoverage, 1)} veces los intereses.`);
  if (a.ebitdaNegWithDebt) add('alta', 'Deuda', 'Deuda sin EBITDA que la cubra', 'El EBITDA es negativo y la empresa tiene deuda neta: no genera resultado operativo para pagarla.');
  if (isNum(a.netDebtToEbitda) && a.netDebtToEbitda > 3.5) add('alta', 'Deuda', 'Apalancamiento elevado', `Deuda neta ${fx(a.netDebtToEbitda, 1)} veces el EBITDA.`);
  if (isNum(a.netIncome) && a.netIncome < 0) add('alta', 'Rentabilidad', 'Pérdidas', `Pérdidas netas de ${fmtB(a.netIncome)} en ${a.year}.`);
  const closes = (m.priceData || []).slice(-1260).map((p) => p.close).filter(isNum);
  if (closes.length > 250) { let pk = -Infinity, dd = 0; for (const c of closes) { pk = Math.max(pk, c); dd = Math.min(dd, c / pk - 1); } if (dd < -0.5) out.push({ sev: 'media', area: 'Mercado', title: 'Caída fuerte de la cotización', detail: `La acción llegó a caer un ${pct(-dd)} desde máximos en los últimos 5 años: el mercado ha dudado seriamente del negocio. Averigua por qué antes de entrar.`, year: a.year }); }
  // Cobros anticipados: matizan la liquidez, pero NO anulan la alerta si la caja no cubre la deuda bancaria a corto
  if (isNum(a.deferredRevenue) && isNum(a.currentLiabilities) && a.deferredRevenue / a.currentLiabilities > 0.3) { const al = out.find((x) => x.title === 'Riesgo de liquidez'); if (al) al.detail += ` Parte del pasivo corriente (${pct(a.deferredRevenue / a.currentLiabilities)}) son cobros anticipados de clientes, que no se pagan en efectivo, pero la deuda a corto sí.`; }
  const sevRank = { alta: 0, media: 1, baja: 2 };
  return out.sort((x, y) => sevRank[x.sev] - sevRank[y.sev]);
}

export function fmtB(v) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const f = (x, d) => x.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
  if (a >= 1e12) return f(v / 1e12, 2) + ' bill.';
  if (a >= 1e9) return f(v / 1e9, 2) + ' mil M';
  if (a >= 1e6) return f(v / 1e6, 1) + ' M';
  if (a >= 1e3) return f(v / 1e3, 1) + ' mil';
  return f(v, 2);
}
export { div };

function fx(v, d) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }); }
