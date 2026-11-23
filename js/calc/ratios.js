// Catálogo de ratios: cómo se calcula cada uno, su serie histórica, interpretación y umbral de alerta.
// Valor actual: TTM cuando el proveedor lo da; si no, último ejercicio (la interfaz lo indica).
import { isNum, div, mean } from './finance.js?v=69ff756a';

const yr = (r) => r.fiscalYear || String(r.date).slice(0, 4);
const histFrom = (rows, f) => rows.map((r) => ({ year: yr(r), v: r[f] })).filter((p) => isNum(p.v));
const histDerived = (years, f) => years.map((y) => ({ year: y.year, v: y[f] })).filter((p) => isNum(p.v));

// fmt: 'x' múltiplo, 'pct' porcentaje, 'n' número. better: 'low' | 'high' | 'band'
export const RATIOS = [
  { id: 'pe', label: 'PER', group: 'Valoración', fmt: 'x', better: 'low', formula: 'Precio / BPA diluido (TTM)',
    cur: (m) => (isNum(m.pe) && m.pe > 0 ? m.pe : null), hist: (m) => histFrom(m.ratiosHist, 'priceToEarningsRatio').filter((p) => p.v > 0),
    interp: (v, avg, m) => v == null ? 'Sin beneficios positivos: el PER no es interpretable.' : `Sobre el BPA del ${m.periodLabel}: pagas ${fx(v, 1)} años de beneficio.${isNum(m.peProvider) && Math.abs(m.peProvider / v - 1) > 0.05 ? ` Con el BPA de los últimos 12 meses (Finnhub) sería ${fx(m.peProvider, 1)}×.` : ''}${avg ? ` Su media histórica es ${fx(avg, 1)}×: ${v > avg * 1.15 ? 'cotiza por encima de su media' : v < avg * 0.85 ? 'cotiza por debajo de su media' : 'en línea con su media'}.` : ''}`,
    alert: (v) => v > 45 && 'PER muy elevado: exige un crecimiento alto y sostenido.' },
  { id: 'fpe', label: 'PER adelantado', group: 'Valoración', fmt: 'x', better: 'low', formula: 'Precio / BPA estimado por analistas para el próximo ejercicio',
    cur: (m) => (isNum(m.forwardEps) && m.forwardEps > 0 ? m.price / m.forwardEps : null), hist: () => [],
    interp: (v, _a, m) => v == null ? 'Sin estimaciones de BPA disponibles.' : `Con el BPA previsto por los analistas (${fx(m.forwardEps, 2)}) el PER bajaría a ${fx(v, 1)}×. Es una estimación, no un dato.`,
    alert: () => false },
  { id: 'peg', label: 'PEG', group: 'Valoración', fmt: 'n', better: 'low', formula: 'PER / (crecimiento anual del BPA en %). Crecimiento: previsión de analistas; si no hay, CAGR 5a',
    cur: (m) => { const g = m.growth.analystEps ?? m.growth.eps5; return isNum(m.pe) && m.pe > 0 && isNum(g) && g > 0 ? m.pe / (g * 100) : null; }, hist: (m) => histFrom(m.ratiosHist, 'priceToEarningsGrowthRatio').filter((p) => p.v > 0 && p.v < 20),
    interp: (v) => v == null ? 'Sin crecimiento positivo del BPA: el PEG no aplica.' : v < 1 ? 'Por debajo de 1: el precio parece barato respecto al crecimiento esperado.' : v < 2 ? 'Entre 1 y 2: precio razonable para su crecimiento.' : 'Por encima de 2: pagas caro el crecimiento.',
    alert: (v) => v > 3 && 'PEG superior a 3.' },
  { id: 'ps', label: 'Precio / Ventas', group: 'Valoración', fmt: 'x', better: 'low', formula: 'Capitalización / ingresos TTM',
    cur: (m) => div(m.marketCap, m.X(m.T.revenue)), hist: (m) => histFrom(m.ratiosHist, 'priceToSalesRatio'),
    interp: (v, avg) => v == null ? '—' : `${fx(v, 1)}× ventas.${avg ? ` Media histórica ${fx(avg, 1)}×.` : ''} Solo tiene sentido junto al margen: un P/V alto con margen bajo es caro.`, alert: (v) => v > 15 && 'Más de 15 veces ventas.' },
  { id: 'pb', label: 'Precio / Valor contable', group: 'Valoración', fmt: 'x', better: 'low', formula: 'Capitalización / patrimonio neto',
    cur: (m) => (isNum(m.T.equity) && m.T.equity > 0 ? div(m.marketCap, m.X(m.T.equity)) : null), hist: (m) => histFrom(m.ratiosHist, 'priceToBookRatio').filter((p) => p.v > 0),
    interp: (v) => v == null ? 'Patrimonio negativo o no disponible (suele deberse a recompras masivas).' : `${fx(v, 1)}× su valor en libros. Relevante en bancos, aseguradoras e industriales; poco útil en empresas de intangibles.`, alert: () => false },
  { id: 'evebitda', label: 'EV / EBITDA', group: 'Valoración', fmt: 'x', better: 'low', formula: '(Capitalización + deuda neta) / EBITDA TTM',
    cur: (m) => (isNum(m.T.ebitda) && m.T.ebitda > 0 ? div(m.ev, m.X(m.T.ebitda)) : null), hist: (m) => histFrom(m.kmHist, 'evToEBITDA').filter((p) => p.v > 0),
    interp: (v, avg) => v == null ? 'EBITDA negativo.' : `${fx(v, 1)}×${avg ? ` frente a una media de ${fx(avg, 1)}×` : ''}. Incluye la deuda, por eso compara mejor empresas con distinto apalancamiento.`, alert: (v) => v > 30 && 'EV/EBITDA superior a 30.' },
  { id: 'evebit', label: 'EV / EBIT', group: 'Valoración', fmt: 'x', better: 'low', formula: '(Capitalización + deuda neta) / EBIT TTM',
    cur: (m) => (isNum(m.T.ebit) && m.T.ebit > 0 ? div(m.ev, m.X(m.T.ebit)) : null),
    hist: (m) => m.kmHist.map((k) => { const y = m.years.find((d) => d.year === yr(k)); return { year: yr(k), v: y && y.ebit > 0 ? div(k.enterpriseValue, k._derived ? m.X(y.ebit) : y.ebit) : null }; }) /* EV calculado por la app está en moneda de cotización */.filter((p) => isNum(p.v) && p.v > 0),
    interp: (v) => v == null ? '—' : `${fx(v, 1)}×. A diferencia del EBITDA, descuenta amortizaciones: más exigente con negocios intensivos en capital.`, alert: () => false },
  { id: 'evfcf', label: 'EV / FCF', group: 'Valoración', fmt: 'x', better: 'low', formula: '(Capitalización + deuda neta) / flujo de caja libre TTM',
    cur: (m) => (isNum(m.T.fcf) && m.T.fcf > 0 ? div(m.ev, m.X(m.T.fcf)) : null), hist: (m) => histFrom(m.kmHist, 'evToFreeCashFlow').filter((p) => p.v > 0),
    interp: (v) => v == null ? 'FCF negativo: la empresa consume caja.' : `Tardarías ${fx(v, 0)} años en recuperar el valor de la empresa con su caja libre actual.`, alert: (v) => v > 50 && 'EV/FCF superior a 50.' },
  { id: 'roe', label: 'ROE', group: 'Rentabilidad', fmt: 'pct', better: 'high', formula: 'Beneficio neto / patrimonio neto',
    cur: (m) => m.T.roe ?? m.last.roe, hist: (m) => histDerived(m.years, 'roe'),
    interp: (v, _a, m) => v == null ? '—' : `${fx(v * 100, 1)} %. ${v > 0.15 ? 'Muy rentable para el accionista' : v > 0.08 ? 'Rentabilidad aceptable' : 'Rentabilidad baja'}${isNum(m.T.debtToEquity) && m.T.debtToEquity > 1.5 && v > 0.15 ? ', pero inflado por deuda (D/E > 1,5): mira el ROIC.' : '.'}`, alert: (v) => v < 0 && 'ROE negativo: destruye valor.' },
  { id: 'roa', label: 'ROA', group: 'Rentabilidad', fmt: 'pct', better: 'high', formula: 'Beneficio neto / activos totales',
    cur: (m) => m.T.roa ?? m.last.roa, hist: (m) => histDerived(m.years, 'roa'),
    interp: (v) => v == null ? '—' : `${fx(v * 100, 1)} % sobre sus activos. En bancos un 1 % ya es bueno; en industria, más del 7 %.`, alert: (v) => v < 0 && 'ROA negativo.' },
  { id: 'roic', label: 'ROIC', group: 'Rentabilidad', fmt: 'pct', better: 'high', formula: 'EBIT·(1−tipo impositivo) / (patrimonio + deuda − caja)',
    cur: (m) => m.T.roic ?? m.last.roic, hist: (m) => histDerived(m.years, 'roic'),
    interp: (v, _a, m) => { if (v == null) return m.last.negCapital ? `No aplicable: el capital invertido es negativo (patrimonio negativo por recompras de acciones). Se usa el ROCE${isNum(m.last.roce) ? ` (${fx(m.last.roce * 100, 1)} %)` : ''} en la puntuación.` : '—'; const w = m.market.wacc && m.market.wacc.wacc; return `${fx(v * 100, 1)} %${w ? `, frente a un coste de capital (WACC) de ${fx(w * 100, 1)} %: ${v > w + 0.03 ? 'crea valor con holgura' : v > w ? 'crea algo de valor' : 'no cubre su coste de capital'}` : ''}.`; },
    alert: (v, m) => m.market.wacc && v < m.market.wacc.wacc && 'El ROIC no supera el WACC: el crecimiento destruye valor.' },
  { id: 'roce', label: 'ROCE', group: 'Rentabilidad', fmt: 'pct', better: 'high', formula: 'EBIT / (activos totales − pasivo corriente)',
    cur: (m) => m.T.roce ?? m.last.roce, hist: (m) => histDerived(m.years, 'roce'),
    interp: (v) => v == null ? '—' : `${fx(v * 100, 1)} % sobre el capital empleado (antes de impuestos).`, alert: () => false },
  { id: 'gm', label: 'Margen bruto', group: 'Márgenes', fmt: 'pct', better: 'high', formula: 'Beneficio bruto / ventas',
    cur: (m) => m.T.grossMargin, hist: (m) => histDerived(m.years, 'grossMargin'),
    interp: (v, avg) => v == null ? '—' : `${fx(v * 100, 1)} %${avg ? ` (media ${fx(avg * 100, 1)} %)` : ''}. Indica poder de fijación de precios.`, alert: (v, m) => m.stats.gmAvg5 && v < m.stats.gmAvg5 - 0.03 && 'Margen bruto más de 3 puntos por debajo de su media de 5 años.' },
  { id: 'om', label: 'Margen operativo', group: 'Márgenes', fmt: 'pct', better: 'high', formula: 'Beneficio operativo / ventas',
    cur: (m) => m.T.operatingMargin, hist: (m) => histDerived(m.years, 'operatingMargin'),
    interp: (v, avg) => v == null ? '—' : `${fx(v * 100, 1)} %${avg ? ` (media ${fx(avg * 100, 1)} %)` : ''}.`, alert: (v, m) => m.stats.omAvg5 && v < m.stats.omAvg5 - 0.03 && 'Margen operativo deteriorándose.' },
  { id: 'nm', label: 'Margen neto', group: 'Márgenes', fmt: 'pct', better: 'high', formula: 'Beneficio neto / ventas',
    cur: (m) => m.T.netMargin, hist: (m) => histDerived(m.years, 'netMargin'),
    interp: (v) => v == null ? '—' : `De cada 100 de ventas quedan ${fx(v * 100, 1)} de beneficio.`, alert: (v) => v < 0 && 'Pérdidas netas.' },
  { id: 'cr', label: 'Liquidez corriente', group: 'Solvencia', fmt: 'n', better: 'band', formula: 'Activo corriente / pasivo corriente',
    cur: (m) => m.T.currentRatio ?? m.last.currentRatio ?? m.rTTM.currentRatioTTM, hist: (m) => histDerived(m.years, 'currentRatio'),
    interp: (v, _a, m) => v == null ? '—' : v < 1 && isNum(m.T.deferredRevenue) && isNum(m.T.currentLiabilities) && m.T.deferredRevenue / m.T.currentLiabilities > 0.3 ? `Por debajo de 1, pero el ${fx(m.T.deferredRevenue / m.T.currentLiabilities * 100, 0)} % del pasivo corriente son ingresos cobrados por adelantado (suscripciones), que no se pagan en efectivo: típico y sano en software.` : v < 1 ? 'Por debajo de 1: depende de generar caja o refinanciar para pagar el corto plazo.' : v > 3 ? 'Muy holgada (puede indicar caja ociosa).' : 'Holgura adecuada para el corto plazo.', alert: (v) => v < 0.8 && 'Liquidez corriente inferior a 0,8.' },
  { id: 'qr', label: 'Prueba ácida', group: 'Solvencia', fmt: 'n', better: 'band', formula: '(Activo corriente − inventario) / pasivo corriente',
    // Sin dato de inventario no se resta 0 (inflaría la liquidez): se usa el ratio del proveedor o queda sin dato
    cur: (m) => div(isNum(m.T.currentAssets) && isNum(m.T.inventory) ? m.T.currentAssets - m.T.inventory : null, m.T.currentLiabilities) ?? m.rTTM.quickRatioTTM ?? null,
    hist: (m) => m.years.map((y) => ({ year: y.year, v: div(isNum(y.currentAssets) && isNum(y.inventory) ? y.currentAssets - y.inventory : null, y.currentLiabilities) })).filter((p) => isNum(p.v)),
    interp: (v) => v == null ? '—' : `${fx(v, 2)}: liquidez sin contar inventarios.`, alert: (v) => v < 0.5 && 'Prueba ácida inferior a 0,5.' },
  { id: 'de', label: 'Deuda / Patrimonio', group: 'Solvencia', fmt: 'n', better: 'low', formula: 'Deuda financiera total / patrimonio neto',
    cur: (m) => (isNum(m.T.equity) && m.T.equity > 0 ? m.T.debtToEquity : null), hist: (m) => histDerived(m.years, 'debtToEquity').filter((p) => p.v >= 0),
    interp: (v) => v == null ? 'Patrimonio negativo: el ratio no es interpretable (revisa deuda neta/EBITDA).' : v < 0.5 ? 'Apalancamiento bajo.' : v < 1.5 ? 'Apalancamiento moderado.' : 'Apalancamiento alto.', alert: (v) => v > 2.5 && 'Deuda más de 2,5 veces el patrimonio.' },
  { id: 'nde', label: 'Deuda neta / EBITDA', group: 'Solvencia', fmt: 'x', better: 'low', formula: '(Deuda − caja e inversiones a corto) / EBITDA',
    cur: (m) => m.T.netDebtToEbitda ?? m.last.netDebtToEbitda, hist: (m) => histDerived(m.years, 'netDebtToEbitda'),
    interp: (v) => v == null ? '—' : v < 0 ? 'Más caja que deuda (caja neta).' : v < 2 ? 'Deuda cómoda: menos de 2 años de EBITDA.' : v < 3.5 ? 'Deuda exigente.' : 'Deuda elevada: vigila refinanciaciones.', alert: (v) => v > 3.5 && 'Deuda neta superior a 3,5 veces el EBITDA.' },
  { id: 'ic', label: 'Cobertura de intereses', group: 'Solvencia', fmt: 'x', better: 'high', formula: 'EBIT / gastos financieros',
    cur: (m) => m.T.interestCoverage ?? m.last.interestCoverage, hist: (m) => histDerived(m.years, 'interestCoverage').filter((p) => p.v < 1000),
    interp: (v) => v == null ? 'El proveedor no informa gastos por intereses (frecuente con caja neta).' : v > 8 ? 'Paga sus intereses con mucha holgura.' : v > 3 ? 'Cobertura suficiente.' : 'Cobertura débil.', alert: (v) => v < 2.5 && 'El beneficio operativo cubre menos de 2,5 veces los intereses.' },
  { id: 'fcfy', label: 'Rentabilidad FCF', group: 'Rendimientos', fmt: 'pct', better: 'high', formula: 'FCF TTM / capitalización',
    cur: (m) => div(m.X(m.T.fcf), m.marketCap), hist: (m) => histFrom(m.kmHist, 'freeCashFlowYield'),
    interp: (v) => v == null ? '—' : `Por cada 100 invertidos la empresa genera ${fx(v * 100, 1)} de caja libre. Compáralo con el bono a 10 años.`, alert: (v) => v < 0 && 'FCF negativo.' },
  { id: 'ey', label: 'Rentabilidad por beneficio', group: 'Rendimientos', fmt: 'pct', better: 'high', formula: 'BPA / precio (inverso del PER)',
    cur: (m) => (isNum(m.pe) && m.pe > 0 ? 1 / m.pe : null), hist: (m) => histFrom(m.kmHist, 'earningsYield'),
    interp: (v, _a, m) => v == null ? '—' : `${fx(v * 100, 1)} %${m.market.rf10 ? ` frente al ${fx(m.market.rf10 * 100, 2)} % del bono a 10 años: ${v > m.market.rf10 ? 'prima positiva' : 'el bono rinde más que el beneficio'}` : ''}.`, alert: () => false },
  { id: 'dy', label: 'Rentabilidad por dividendo', group: 'Rendimientos', fmt: 'pct', better: 'high', formula: 'Dividendos por acción últimos 12 meses / precio',
    cur: (m) => (isNum(m.dpsTTM) && m.price ? m.dpsTTM / m.price : null), hist: (m) => histFrom(m.ratiosHist, 'dividendYield').filter((h) => h.v < 0.25), // >25 % = dato sin ajustar a splits
    interp: (v, _a, m) => v == null ? (m && m.dpsTTM === 0 ? 'No reparte dividendo.' : 'Sin dato de dividendos.') : v === 0 ? 'No reparte dividendo.' : `${fx(v * 100, 2)} % anual.`, alert: (v) => v > 0.09 && 'Dividendo superior al 9 %: el mercado puede estar descontando un recorte.' },
  { id: 'payout', label: 'Payout', group: 'Rendimientos', fmt: 'pct', better: 'band', formula: 'Dividendos pagados / beneficio neto',
    // Con pérdidas el payout no existe (saldría negativo y parecería «sostenible»)
    cur: (m) => { const ni = m.T.netIncome ?? m.last.netIncome; return isNum(ni) && ni > 0 ? div(m.T.dividendsPaid ?? m.last.dividendsPaid, ni) : null; }, hist: (m) => m.years.map((y) => ({ year: y.year, v: y.netIncome > 0 ? div(y.dividendsPaid, y.netIncome) : null })).filter((p) => isNum(p.v) && p.v >= 0),
    interp: (v, _a, m) => v == null && (m.T.dividendsPaid ?? m.last.dividendsPaid) > 0 && !((m.T.netIncome ?? m.last.netIncome) > 0) ? 'Paga dividendo teniendo pérdidas: no lo cubre el beneficio, insostenible si persiste.' : v == null ? (m.dpsTTM === 0 ? 'Sin dividendos.' : 'Sin dato.') : v === 0 ? 'Sin dividendos.' : v < 0.6 ? 'Payout sostenible.' : v < 0.9 ? 'Payout exigente.' : 'Reparte más de lo que gana: insostenible si persiste.', alert: (v) => v > 1 && 'Payout superior al 100 %.' },
];

export const fmtRatio = (v, f) => (!isNum(v) ? '—' : f === 'pct' ? (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %' : f === 'x' ? v.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '×' : v.toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));

export function evaluateRatios(m) {
  return RATIOS.map((r) => {
    let cur = null; try { cur = r.cur(m); } catch {}
    let hist = []; try { hist = r.hist(m) || []; } catch {}
    const avg5 = hist.length >= 3 ? mean(hist.slice(-5).map((p) => p.v)) : null;
    const avg10 = hist.length >= 8 ? mean(hist.slice(-10).map((p) => p.v)) : null;
    let alert = false; try { alert = isNum(cur) ? r.alert(cur, m) : false; } catch {}
    let interp = ''; try { interp = r.interp(isNum(cur) ? cur : null, avg5, m); } catch {}
    return { ...r, value: isNum(cur) ? cur : null, hist, avg5, avg10, alert, interp };
  });
}

function fx(v, d) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }); }
