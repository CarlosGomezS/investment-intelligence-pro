// Simulaciones de rentabilidad: histórica (con y sin reinversión de dividendos) y prospectiva por supuestos.
import { isNum } from './finance.js?v=ca0e8ce3';

/** Rentabilidad histórica: precios ajustados por dividendo (= reinversión) frente a precios sin ajustar. */
export function historical(adjAsc, rawAsc, indexAsc, years, amount = 10000) {
  const start = new Date(); start.setFullYear(start.getFullYear() - years);
  const s = start.toISOString().slice(0, 10);
  const pick = (arr) => { const a = (arr || []).filter((p) => p.date >= s && isNum(p.close)); return a.length > 20 ? a : null; };
  const A = pick(adjAsc), R = pick(rawAsc), I = pick(indexAsc);
  const res = (a) => (a ? { final: amount * (a[a.length - 1].close / a[0].close), cagr: (a[a.length - 1].close / a[0].close) ** (1 / years) - 1, from: a[0].date } : null);
  return { drip: res(A), noDrip: res(R), index: res(I), amount, years };
}

/**
 * Proyección: BPA crece a `epsGrowth`, al final se vende al `exitPE`.
 * Dividendos = BPA·payout; con DRIP se reinvierten al precio de cada año (precio = BPA·PER interpolado).
 */
export function forward({ price, eps, epsGrowth, exitPE, payout = 0, years = 10, drip = true, amount = 10000 }) {
  if (![price, eps, epsGrowth, exitPE].every(isNum) || price <= 0 || eps <= 0) return null;
  const pe0 = price / eps;
  let shares = amount / price, cashDiv = 0, e = eps;
  const rows = [];
  for (let t = 1; t <= years; t++) {
    e *= 1 + epsGrowth;
    const pe = pe0 + ((exitPE - pe0) * t) / years;
    const p = e * pe, d = e * payout * shares;
    if (drip) shares += d / p; else cashDiv += d;
    rows.push({ t, eps: e, pe, price: p, value: shares * p + cashDiv });
  }
  const fin = rows[rows.length - 1].value;
  return { rows, final: fin, cagr: (fin / amount) ** (1 / years) - 1, multiple: fin / amount };
}
