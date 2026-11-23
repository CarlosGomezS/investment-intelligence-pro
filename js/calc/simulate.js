// Simulaciones de rentabilidad: histórica (con y sin reinversión de dividendos) y prospectiva por supuestos.
import { isNum } from './finance.js?v=38c5f79f';

/** Rentabilidad histórica: precios ajustados por dividendo (= reinversión) frente a precios sin ajustar. */
export function historical(adjAsc, rawAsc, indexAsc, years, amount = 10000) {
  const start = new Date(); start.setFullYear(start.getFullYear() - years);
  const s = start.toISOString().slice(0, 10);
  const pick = (arr) => { const a = (arr || []).filter((p) => p.date >= s && isNum(p.close)); return a.length > 20 ? a : null; };
  // Misma fecha de inicio para las columnas, pero una serie CORTA (p. ej. 100 días de Alpha Vantage) no recorta a las
  // demás: se descarta y se avisa. El índice tampoco recorta a la acción: si no llega tan atrás, se queda sin dato.
  const A0 = pick(adjAsc), R0 = pick(rawAsc);
  const span = (a) => (a ? (new Date(a[a.length - 1].date) - new Date(a[0].date)) / (365.25 * 864e5) : 0);
  const long = [A0, R0].filter((a) => a && span(a) >= years * 0.8);
  // Si ninguna llega al 80 %, se queda la más larga y las que cubran al menos la mitad que ella (100 días nunca recortan 5 años)
  const maxSpan = Math.max(span(A0), span(R0));
  const base = long.length ? long : [A0, R0].filter((a) => a && span(a) >= maxSpan * 0.5);
  const first = base.map((a) => a[0].date).sort().pop() || s;
  const from = (arr) => { const a = (arr || []).filter((p) => p.date >= first && isNum(p.close)); return a.length > 20 ? a : null; };
  const keep = (a0) => (a0 && base.includes(a0) ? from(a0) : null);
  const A = keep(A0), R = keep(R0);
  const I1 = from(indexAsc), I = I1 && (new Date(I1[0].date) - new Date(first)) / 864e5 < 31 ? I1 : null;
  const dropped = [A0 && !A ? 'con dividendos' : null, R0 && !R ? 'solo precio' : null, indexAsc && indexAsc.length && !I ? 'S&P 500' : null].filter(Boolean);
  const yrs = (a) => Math.max(1 / 365, (new Date(a[a.length - 1].date) - new Date(a[0].date)) / (365.25 * 864e5));
  const res = (a) => (a ? { final: amount * (a[a.length - 1].close / a[0].close), cagr: yrs(a) >= 1 ? (a[a.length - 1].close / a[0].close) ** (1 / yrs(a)) - 1 : null, /* con menos de un año no se anualiza */ from: a[0].date, years: yrs(a) } : null);
  const out = { drip: res(A), noDrip: res(R), index: res(I), amount, years, dropped };
  out.actualYears = (out.drip || out.noDrip || {}).years ?? null;
  out.from = (out.drip || out.noDrip || {}).from ?? null;
  out.partial = isNum(out.actualYears) && out.actualYears < years * 0.95;
  return out;
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
