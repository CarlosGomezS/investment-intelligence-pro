// Modelos de valoración intrínseca. Todas las entradas son explícitas: nada se inventa aquí.
import { isNum, div, mean, median, cagr } from './finance.js?v=171d25de';

/** WACC por CAPM. Tasas en tanto por uno. */
export function wacc({ rf, beta, erp, costDebtPre, taxRate, equityValue, debtValue }) {
  if (![rf, beta, erp].every(isNum)) return null;
  const ke = rf + beta * erp;
  const kd = isNum(costDebtPre) ? costDebtPre * (1 - (isNum(taxRate) ? taxRate : 0.21)) : null;
  const E = isNum(equityValue) && equityValue > 0 ? equityValue : 0;
  const D = isNum(debtValue) && debtValue > 0 ? debtValue : 0;
  const we = E > 0 ? E / (E + D) : 1, wd = 1 - we; // sin capitalización conocida no se pondera solo con deuda
  const w = we * ke + wd * (kd ?? ke);
  return { ke, kd, we, wd, wacc: w };
}

/**
 * DCF de FCF a la empresa en dos etapas.
 * Años 1-5 crecen a `growth`; si years=10, los años 6-10 convergen linealmente hacia `terminalGrowth`.
 * Valor terminal por Gordon: FCF_n·(1+g)/(WACC−g).
 */
export function dcf({ fcf0, growth, years = 5, terminalGrowth = 0.025, discount, netDebt, shares }) {
  if (![fcf0, growth, discount, shares].every(isNum) || shares <= 0) return null;
  if (!isNum(netDebt)) return { error: 'Falta la deuda neta (balance no disponible): no se supone cero' };
  if (!(discount > 0) || !(growth > -1) || !(terminalGrowth > -1)) return { error: 'Supuestos no válidos: el WACC debe ser positivo y los crecimientos mayores que −100 %' };
  if (discount <= terminalGrowth) return { error: 'El WACC debe ser mayor que el crecimiento terminal' };
  const rows = []; let f = fcf0, pvSum = 0;
  for (let t = 1; t <= years; t++) {
    const g = years <= 5 || t <= 5 ? growth : growth + ((terminalGrowth - growth) * (t - 5)) / (years - 5);
    f = f * (1 + g);
    const df = 1 / (1 + discount) ** t;
    rows.push({ t, g, fcf: f, df, pv: f * df });
    pvSum += f * df;
  }
  const tv = (f * (1 + terminalGrowth)) / (discount - terminalGrowth);
  const pvTv = tv / (1 + discount) ** years;
  const ev = pvSum + pvTv;
  const equity = ev - netDebt;
  return { rows, pvSum, tv, pvTv, ev, equity, perShare: equity / shares, tvShare: pvTv / ev };
}

/** Matriz de sensibilidad del valor por acción a WACC (filas) y crecimiento terminal (columnas). */
export function sensitivity(base, waccs, tgs) {
  return waccs.map((w) => tgs.map((g) => { const r = dcf({ ...base, discount: w, terminalGrowth: g }); return r && !r.error ? r.perShare : null; }));
}

/** Modelo de Gordon (DDM). Solo válido si ke > g y el dividendo es positivo. */
export function ddm({ dps, growth, ke }) {
  if (![dps, growth, ke].every(isNum) || dps <= 0) return null;
  if (ke <= growth) return { error: 'El coste del capital debe superar el crecimiento del dividendo' };
  const d1 = dps * (1 + growth);
  return { d1, value: d1 / (ke - growth) };
}

/** Precio implícito por múltiplo: métrica por acción × múltiplo de referencia. */
export const impliedByPE = (eps, pe) => (isNum(eps) && eps > 0 && isNum(pe) && pe > 0 ? eps * pe : null);

/** Precio implícito por múltiplo de EV (EV/EBITDA, EV/FCF): (métrica·múltiplo − deuda neta)/acciones. */
export function impliedByEV(metric, multiple, netDebt, shares) {
  if (![metric, multiple, shares, netDebt].every(isNum) || metric <= 0 || multiple <= 0 || shares <= 0) return null; // sin deuda neta conocida no se supone 0
  return (metric * multiple - netDebt) / shares;
}

// Valor 0 (la deuda supera al valor de la empresa): margen −100 %, no «sin dato»
export const marginOfSafety = (intrinsic, price) => (isNum(intrinsic) && isNum(price) ? (intrinsic > 0 ? (intrinsic - price) / intrinsic : intrinsic === 0 && price > 0 ? -1 : null) : null);
export const upside = (intrinsic, price) => (isNum(intrinsic) && isNum(price) && price > 0 ? intrinsic / price - 1 : null);

/** Escenarios estándar a partir del caso base (supuestos documentados en la interfaz). */
export function scenarios(base) {
  const S = [
    { id: 'pesimista', label: 'Pesimista', growth: Math.max(-0.95, base.growth - Math.abs(base.growth) * 0.5), discount: base.discount + 0.01, terminalGrowth: Math.max(0.01, base.terminalGrowth - 0.005) },
    { id: 'base', label: 'Base', growth: base.growth, discount: base.discount, terminalGrowth: base.terminalGrowth },
    { id: 'optimista', label: 'Optimista', growth: base.growth + Math.abs(base.growth) * 0.5, discount: Math.max(base.terminalGrowth + 0.02, base.discount - 0.01), terminalGrowth: base.terminalGrowth + 0.005 },
  ];
  return S.map((s) => ({ ...s, result: dcf({ ...base, ...s }) }));
}

/**
 * Crecimiento base sugerido para el DCF. Regla documentada:
 * mediana de (CAGR 5a del FCF, CAGR 5a de ventas, crecimiento anual de ventas previsto por analistas),
 * acotada entre −10 % y 30 %. Devuelve también de dónde sale cada componente.
 */
export function suggestGrowth({ fcfCagr5, revCagr5, analystRevGrowth, rev1, rev10 }) {
  const parts = [['FCF histórico (CAGR 5a)', fcfCagr5], ['Ventas históricas (CAGR 5a)', revCagr5], ['Ventas previstas por analistas', analystRevGrowth]].filter(([, v]) => isNum(v));
  if (!parts.length) return { value: null, parts };
  let m = median(parts.map(([, v]) => v));
  // Tope de normalización: no proyectar más que el mayor de (último año, CAGR 10a, previsión de analistas).
  // Evita extrapolar rebotes desde años anómalos (p. ej. 2020) cuando el crecimiento ya se ha moderado.
  const ref = [rev1, rev10, analystRevGrowth].filter(isNum);
  let capped = null;
  if (ref.length && m > Math.max(...ref)) { capped = Math.max(...ref); m = capped; }
  // Empresas en declive: se proyecta el declive (hasta −10 % anual), no un 0 % optimista
  return { value: Math.min(0.3, Math.max(-0.1, m)), parts, capped };
}

/** Crecimiento anual medio de ventas previsto por analistas desde el último año real. */
export function analystGrowth(estimatesAsc, lastRevenue, lastYear) {
  const fut = (estimatesAsc || []).filter((e) => String(e.date).slice(0, 4) > String(lastYear) && isNum(e.revenueAvg));
  if (!fut.length || !isNum(lastRevenue)) return null;
  const far = fut[Math.min(fut.length - 1, 2)];
  const yrs = Number(String(far.date).slice(0, 4)) - Number(lastYear);
  return cagr(lastRevenue, far.revenueAvg, yrs);
}

export { mean };
export const ratioAvg = (rows, field, n) => mean(rows.slice(-n).map((r) => r[field]).filter((v) => isNum(v) && v > 0 && v < 500));
export const ev = (marketCap, netDebt) => (isNum(marketCap) ? marketCap + (isNum(netDebt) ? netDebt : 0) : null);
export { div };
