// Funciones financieras puras (sin DOM ni red): se prueban en tests/finance.test.mjs.
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const div = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
export const sum = (xs) => xs.filter(isNum).reduce((a, b) => a + b, 0);
export const mean = (xs) => { const v = xs.filter(isNum); return v.length ? sum(v) / v.length : null; };
export const median = (xs) => { const v = xs.filter(isNum).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
export const stdev = (xs) => { const v = xs.filter(isNum); if (v.length < 2) return null; const m = mean(v); return Math.sqrt(sum(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ordena filas por fecha ascendente (los proveedores las devuelven descendentes). */
export const asc = (rows) => (rows || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));

/** Tasa de crecimiento anual compuesta. Devuelve null si inicio o final no son positivos. */
export function cagr(first, last, years) {
  if (!isNum(first) || !isNum(last) || !isNum(years) || years <= 0 || first <= 0 || last <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** CAGR sobre los últimos `n` años de una serie anual ascendente de valores. */
export function cagrN(values, n) {
  if (!values || values.length < n + 1) return null;
  return cagr(values[values.length - 1 - n], values[values.length - 1], n);
}

/** Variación interanual de cada punto respecto al anterior (null si no hay base positiva comparable). */
export function yoy(values) {
  return values.map((v, i) => (i === 0 || !isNum(v) || !isNum(values[i - 1]) || values[i - 1] === 0 ? null : (v - values[i - 1]) / Math.abs(values[i - 1])));
}

/** Media de los últimos n valores disponibles. */
export const lastAvg = (values, n) => { const v = values.filter(isNum); return v.length >= Math.min(n, 2) ? mean(v.slice(-n)) : null; };

/** Suma de los 4 últimos trimestres (TTM) de un campo. Requiere 4 trimestres consecutivos. */
export function ttm(quartersAsc, field) {
  if (!quartersAsc || quartersAsc.length < 4) return null;
  const last4 = quartersAsc.slice(-4).map((q) => q[field]);
  return last4.every(isNum) ? sum(last4) : null;
}

/** Máxima caída desde máximos de una serie de precios. */
export function maxDrawdown(closes) {
  let peak = -Infinity, mdd = 0;
  for (const c of closes) { if (!isNum(c)) continue; peak = Math.max(peak, c); mdd = Math.min(mdd, c / peak - 1); }
  return closes.length ? mdd : null;
}

/** Volatilidad anualizada a partir de cierres diarios. */
export function volatility(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) if (isNum(closes[i]) && isNum(closes[i - 1]) && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  const s = stdev(r); return s == null ? null : s * Math.sqrt(252);
}

/** Interpolación lineal por tramos para puntuar: pts = [[x, score], ...] con x creciente. */
export function lin(v, pts) {
  if (!isNum(v)) return null;
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

/** Construye series alineadas por año fiscal a partir de los tres estados. */
export function buildAnnual(income, balance, cash) {
  const key = (r) => r.fiscalYear || String(r.date).slice(0, 4);
  const map = new Map();
  for (const [name, rows] of [['i', income], ['b', balance], ['c', cash]]) for (const r of asc(rows)) { const k = key(r); if (!map.has(k)) map.set(k, { year: k }); map.get(k)[name] = r; }
  return [...map.values()].sort((a, b) => a.year.localeCompare(b.year)).filter((y) => y.i);
}

/** Métricas derivadas por año calculadas a partir de los estados (fuente de verdad propia, auditable). */
export function deriveYear(y, taxFallback = 0.21) {
  const i = y.i || {}, b = y.b || {}, c = y.c || {};
  const ebit = i.ebit ?? i.operatingIncome;
  const tax = div(i.incomeTaxExpense, i.incomeBeforeTax);
  const t = isNum(tax) && tax >= 0 && tax < 0.6 ? tax : taxFallback;
  const debt = b.totalDebt ?? (isNum(b.shortTermDebt) || isNum(b.longTermDebt) ? (b.shortTermDebt || 0) + (b.longTermDebt || 0) : null);
  const cash = b.cashAndShortTermInvestments ?? b.cashAndCashEquivalents;
  const invested = isNum(b.totalStockholdersEquity) && isNum(debt) ? b.totalStockholdersEquity + debt - (cash || 0) : null;
  const fcf = c.freeCashFlow ?? (isNum(c.operatingCashFlow) && isNum(c.capitalExpenditure) ? c.operatingCashFlow + c.capitalExpenditure : null);
  const shares = i.weightedAverageShsOutDil ?? i.weightedAverageShsOut ?? b.commonStockSharesOutstanding;
  const ebitda = i.ebitda ?? (isNum(ebit) && isNum(i.depreciationAndAmortization) ? ebit + i.depreciationAndAmortization : null);
  const capEmployed = isNum(b.totalAssets) && isNum(b.totalCurrentLiabilities) ? b.totalAssets - b.totalCurrentLiabilities : null;
  return {
    year: y.year, date: i.date, revenue: i.revenue, grossProfit: i.grossProfit, operatingIncome: i.operatingIncome, ebit, ebitda, netIncome: i.netIncome,
    eps: i.epsDiluted ?? i.eps ?? div(i.netIncome, shares), shares, fcf, ocf: c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities,
    capex: c.capitalExpenditure, debt, cash, netDebt: b.netDebt ?? (isNum(debt) ? debt - (cash || 0) : null), equity: b.totalStockholdersEquity,
    assets: b.totalAssets, inventory: b.inventory, receivables: b.netReceivables ?? b.accountsReceivables, goodwill: b.goodwill, retainedEarnings: b.retainedEarnings ?? null, liabilities: b.totalLiabilities ?? (isNum(b.totalAssets) && isNum(b.totalStockholdersEquity) ? b.totalAssets - b.totalStockholdersEquity : null),
    currentAssets: b.totalCurrentAssets, currentLiabilities: b.totalCurrentLiabilities, shortTermDebt: b.shortTermDebt, longTermDebt: b.longTermDebt,
    interestExpense: isNum(i.interestExpense) ? Math.abs(i.interestExpense) : null, dividendsPaid: isNum(c.commonDividendsPaid) ? Math.abs(c.commonDividendsPaid) : (isNum(c.netDividendsPaid) ? Math.abs(c.netDividendsPaid) : null),
    buybacks: isNum(c.commonStockRepurchased) ? Math.abs(c.commonStockRepurchased) : null, issuance: c.commonStockIssuance ?? null,
    acquisitions: isNum(c.acquisitionsNet) ? Math.abs(c.acquisitionsNet) : null, sbc: c.stockBasedCompensation ?? null, rnd: i.researchAndDevelopmentExpenses,
    grossMargin: div(i.grossProfit, i.revenue), operatingMargin: div(i.operatingIncome, i.revenue), netMargin: div(i.netIncome, i.revenue),
    fcfMargin: div(fcf, i.revenue), roe: div(i.netIncome, b.totalStockholdersEquity), roa: div(i.netIncome, b.totalAssets),
    roic: div(isNum(ebit) ? ebit * (1 - t) : null, invested), roce: div(ebit, capEmployed), taxRate: t,
    netDebtToEbitda: div(b.netDebt ?? (isNum(debt) ? debt - (cash || 0) : null), ebitda), debtToEquity: div(debt, b.totalStockholdersEquity),
    currentRatio: div(b.totalCurrentAssets, b.totalCurrentLiabilities), interestCoverage: isNum(i.interestExpense) && i.interestExpense !== 0 ? div(ebit, Math.abs(i.interestExpense)) : null,
    fcfConversion: div(fcf, i.netIncome), incomeQuality: div(c.operatingCashFlow, i.netIncome), capexToOcf: div(isNum(c.capitalExpenditure) ? Math.abs(c.capitalExpenditure) : null, c.operatingCashFlow),
    fcfPerShare: div(fcf, shares), costOfDebt: div(isNum(i.interestExpense) ? Math.abs(i.interestExpense) : null, debt),
  };
}

/** Último cierre en o antes de una fecha (serie ascendente). */
export function closeAt(pricesAsc, date) {
  let lo = 0, hi = pricesAsc.length - 1, ans = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (pricesAsc[mid].date <= date) { ans = pricesAsc[mid]; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Variaciones de precio por periodo (en %), calculadas del histórico. */
export function priceChanges(pricesAsc) {
  if (!pricesAsc || pricesAsc.length < 2) return {};
  const L = pricesAsc[pricesAsc.length - 1], last = new Date(L.date);
  const back = (days) => { const d = new Date(last); d.setDate(d.getDate() - days); const ds = d.toISOString().slice(0, 10); const p = closeAt(pricesAsc, ds); return p && pricesAsc[0].date <= ds ? (L.close / p.close - 1) * 100 : null; };
  const ytdBase = closeAt(pricesAsc, `${last.getFullYear() - 1}-12-31`);
  return { '1D': (L.close / pricesAsc[pricesAsc.length - 2].close - 1) * 100, '5D': back(7), '1M': back(30), '3M': back(91), '6M': back(182), ytd: ytdBase ? (L.close / ytdBase.close - 1) * 100 : null, '1Y': back(365), '3Y': back(1095), '5Y': back(1826), '10Y': back(3652), max: (L.close / pricesAsc[0].close - 1) * 100, _derived: true };
}

/** Beta frente a un índice con rentabilidades mensuales (hasta 5 años). */
export function betaFrom(stockAsc, indexAsc) {
  const monthly = (a) => { const m = new Map(); for (const p of a) m.set(p.date.slice(0, 7), p.close); return m; };
  const S = monthly(stockAsc.slice(-1300)), I = monthly(indexAsc.slice(-1300));
  const keys = [...S.keys()].filter((k) => I.has(k)).sort();
  const rs = [], ri = [];
  for (let i = 1; i < keys.length; i++) { rs.push(S.get(keys[i]) / S.get(keys[i - 1]) - 1); ri.push(I.get(keys[i]) / I.get(keys[i - 1]) - 1); }
  if (rs.length < 24) return null;
  const ms = mean(rs), mi = mean(ri);
  let cov = 0, vi = 0; for (let i = 0; i < rs.length; i++) { cov += (rs[i] - ms) * (ri[i] - mi); vi += (ri[i] - mi) ** 2; }
  return vi ? cov / vi : null;
}

/** Piotroski F-Score (9 pruebas) con los dos últimos ejercicios. */
export function piotroski(a, b) {
  if (!a || !b) return null;
  const t = [
    isNum(a.netIncome) ? a.netIncome > 0 : null, isNum(a.ocf) ? a.ocf > 0 : null, isNum(a.roa) && isNum(b.roa) ? a.roa > b.roa : null, isNum(a.ocf) && isNum(a.netIncome) ? a.ocf > a.netIncome : null,
    isNum(a.longTermDebt) && isNum(b.longTermDebt) && isNum(a.assets) && isNum(b.assets) ? a.longTermDebt / a.assets <= b.longTermDebt / b.assets : null,
    isNum(a.currentRatio) && isNum(b.currentRatio) ? a.currentRatio > b.currentRatio : null,
    isNum(a.shares) && isNum(b.shares) ? a.shares <= b.shares * 1.005 : null,
    isNum(a.grossMargin) && isNum(b.grossMargin) ? a.grossMargin > b.grossMargin : null,
    isNum(a.revenue) && isNum(b.revenue) && isNum(a.assets) && isNum(b.assets) ? a.revenue / a.assets > b.revenue / b.assets : null,
  ];
  const known = t.filter((x) => x !== null);
  return known.length >= 7 ? Math.round(known.filter(Boolean).length * 9 / known.length) : null;
}

/** Altman Z-Score clásico. */
export function altman(y, marketCap) {
  const ta = y.assets; if (!isNum(ta) || ta <= 0) return null;
  const wc = isNum(y.currentAssets) && isNum(y.currentLiabilities) ? y.currentAssets - y.currentLiabilities : null;
  if (![wc, y.retainedEarnings, y.ebit, marketCap, y.liabilities, y.revenue].every(isNum) || y.liabilities <= 0) return null;
  return 1.2 * wc / ta + 1.4 * y.retainedEarnings / ta + 3.3 * y.ebit / ta + 0.6 * marketCap / y.liabilities + 1.0 * y.revenue / ta;
}
