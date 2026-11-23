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
  // Se emparejan balance y flujos con la cuenta de resultados por FECHA DE CIERRE (±45 días), no por la etiqueta del
  // año: hay fuentes que llaman «2024» al ejercicio cerrado en enero de 2025 y otras «2025».
  const key = (r) => String(r.fiscalYear || String(r.date).slice(0, 4));
  const t = (r) => (r && r.date ? new Date(r.date).getTime() : null);
  const map = new Map();
  for (const r of asc(income)) { const k = key(r); map.set(k, { year: k, i: r }); }
  const rowsI = [...map.values()];
  for (const [name, rows] of [['b', balance], ['c', cash]]) for (const r of asc(rows)) {
    const tr = t(r);
    const y = tr ? rowsI.find((x) => t(x.i) && Math.abs(t(x.i) - tr) < 45 * 864e5) : null;
    const target = y || (!tr || !rowsI.some((x) => t(x.i)) ? map.get(key(r)) : null);
    if (target) target[name] = r;
  }
  return [...map.values()].sort((a, b) => a.year.localeCompare(b.year)).filter((y) => y.i);
}

/** Métricas derivadas por año calculadas a partir de los estados (fuente de verdad propia, auditable). */
export function deriveYear(y, taxFallback = 0.21) {
  let i = y.i || {}; const b = y.b || {}, c = y.c || {};
  // Si el parser no trae beneficio neto o bruto, se calculan de partidas presentes (BAI − impuestos; ventas − coste)
  if (!isNum(i.netIncome) && isNum(i.incomeBeforeTax) && isNum(i.incomeTaxExpense)) i = { ...i, netIncome: i.incomeBeforeTax - i.incomeTaxExpense, _niCalc: true };
  if (!isNum(i.grossProfit) && isNum(i.revenue) && isNum(i.costOfRevenue)) i = { ...i, grossProfit: i.revenue - i.costOfRevenue };
  const ebit = i.ebit ?? i.operatingIncome;
  const tax = div(i.incomeTaxExpense, i.incomeBeforeTax);
  const t = isNum(tax) && tax >= 0 && tax < 0.6 ? tax : taxFallback;
  const debt = b.totalDebt ?? (isNum(b.shortTermDebt) || isNum(b.longTermDebt) ? (b.shortTermDebt || 0) + (b.longTermDebt || 0) : null);
  const cash = b.cashAndShortTermInvestments ?? b.cashAndCashEquivalents;
  const invested = isNum(b.totalStockholdersEquity) && isNum(debt) ? b.totalStockholdersEquity + debt - (cash || 0) : null;
  const ocf = c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities;
  // El capex se resta siempre (hay fuentes que lo dan positivo y otras negativo)
  const fcf = c.freeCashFlow ?? (isNum(ocf) && isNum(c.capitalExpenditure) ? ocf - Math.abs(c.capitalExpenditure) : null);
  const shares = i.weightedAverageShsOutDil ?? i.weightedAverageShsOut ?? b.commonStockSharesOutstanding;
  const ebitda = i.ebitda ?? (isNum(ebit) && isNum(i.depreciationAndAmortization) ? ebit + i.depreciationAndAmortization : null);
  const capEmployed = isNum(b.totalAssets) && isNum(b.totalCurrentLiabilities) ? b.totalAssets - b.totalCurrentLiabilities : null;
  return {
    year: y.year, date: i.date, src: i._from || 'base', revenue: i.revenue, grossProfit: i.grossProfit, operatingIncome: i.operatingIncome, ebit, ebitda, netIncome: i.netIncome,
    // BPA publicado salvo error grosero (unidades, acciones sin ajustar): doble clase o preferentes justifican pequeñas diferencias
    eps: (() => { const rep = i.epsDiluted ?? i.eps, calc = div(i.netIncome, shares); const q = isNum(rep) && isNum(calc) && calc !== 0 ? Math.abs(rep / calc) : null; return isNum(q) && (q > 5 || q < 0.2) ? calc : rep ?? calc; })(), /* solo errores groseros (unidades, splits sin ajustar); un signo distinto puede ser legítimo (minoritarios, preferentes) */ shares, fcf, ocf,
    capex: c.capitalExpenditure, debt, cash, netDebt: b.netDebt ?? (isNum(debt) ? debt - (cash || 0) : null), equity: b.totalStockholdersEquity,
    assets: b.totalAssets, inventory: b.inventory, receivables: b.netReceivables ?? b.accountsReceivables, deferredRevenue: b.deferredRevenue ?? null, goodwill: b.goodwill, ppe: b.propertyPlantEquipmentNet ?? null, retainedEarnings: b.retainedEarnings ?? null, liabilities: b.totalLiabilities ?? (isNum(b.totalAssets) && isNum(b.totalStockholdersEquity) ? b.totalAssets - b.totalStockholdersEquity : null),
    currentAssets: b.totalCurrentAssets, currentLiabilities: b.totalCurrentLiabilities, shortTermDebt: b.shortTermDebt, longTermDebt: b.longTermDebt,
    interestExpense: isNum(i.interestExpense) ? Math.abs(i.interestExpense) : null, dividendsPaid: isNum(c.commonDividendsPaid) ? Math.abs(c.commonDividendsPaid) : (isNum(c.netDividendsPaid) ? Math.abs(c.netDividendsPaid) : null),
    buybacks: isNum(c.commonStockRepurchased) ? Math.abs(c.commonStockRepurchased) : null, issuance: c.commonStockIssuance ?? null,
    acquisitions: isNum(c.acquisitionsNet) ? Math.abs(c.acquisitionsNet) : null, sbc: c.stockBasedCompensation ?? null, rnd: i.researchAndDevelopmentExpenses,
    grossMargin: div(i.grossProfit, i.revenue), operatingMargin: div(i.operatingIncome, i.revenue), netMargin: div(i.netIncome, i.revenue),
    fcfMargin: div(fcf, i.revenue), roe: isNum(b.totalStockholdersEquity) && b.totalStockholdersEquity > 0 ? div(i.netIncome, b.totalStockholdersEquity) : null, roa: div(i.netIncome, b.totalAssets),
    roic: isNum(invested) && invested > 0 ? div(isNum(ebit) ? ebit * (1 - t) : null, invested) : null, roce: isNum(capEmployed) && capEmployed > 0 ? div(ebit, capEmployed) : null, taxRate: t,
    negCapital: isNum(invested) && invested <= 0,
    // Rentabilidad del capital usada en puntuación y foso: ROIC; si el capital invertido es negativo, ROCE
    rc: isNum(invested) && invested > 0 ? div(isNum(ebit) ? ebit * (1 - t) : null, invested) : isNum(capEmployed) && capEmployed > 0 ? div(ebit, capEmployed) : null,
    // Denominadores negativos invierten el signo: sin EBITDA positivo el ratio no tiene sentido (se marca aparte)
    netDebtToEbitda: isNum(ebitda) && ebitda > 0 ? div(b.netDebt ?? (isNum(debt) ? debt - (cash || 0) : null), ebitda) : null,
    ebitdaNegWithDebt: isNum(ebitda) && ebitda <= 0 && (b.netDebt ?? (isNum(debt) ? debt - (cash || 0) : 0)) > 0, debtToEquity: isNum(b.totalStockholdersEquity) && b.totalStockholdersEquity > 0 ? div(debt, b.totalStockholdersEquity) : null,
    currentRatio: div(b.totalCurrentAssets, b.totalCurrentLiabilities), interestCoverage: isNum(i.interestExpense) && i.interestExpense !== 0 ? div(ebit, Math.abs(i.interestExpense)) : null,
    fcfConversion: isNum(i.netIncome) && i.netIncome > 0 ? div(fcf, i.netIncome) : null, incomeQuality: isNum(i.netIncome) && i.netIncome > 0 ? div(ocf, i.netIncome) : null, capexToOcf: isNum(ocf) && ocf > 0 ? div(isNum(c.capitalExpenditure) ? Math.abs(c.capitalExpenditure) : null, ocf) : null,
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

/**
 * Ajuste por splits: si el número de acciones salta de un año a otro por un factor típico de split
 * (2, 3, 4, 5, 8, 10, 15, 20… o el inverso) sin que el negocio lo justifique, se reexpresan los años
 * anteriores (acciones × factor, BPA ÷ factor). Devuelve la lista de splits detectados.
 */
/** Factor acumulado de splits posteriores a un año fiscal (para ajustar acciones y BPA de años anteriores). */
export function splitFactor(splitsAdj, year) {
  let f = 1; for (const s of splitsAdj || []) if (Number(year) < Number(s.year)) f *= s.factor; return f;
}
const SHARE_F = ['weightedAverageShsOut', 'weightedAverageShsOutDil', 'commonStockSharesOutstanding'];
const PERSHARE_F = ['eps', 'epsDiluted', 'epsdiluted'];
/** Copia de las filas de un estado con acciones y BPA ajustados a los splits detectados (no toca los importes). */
export function splitAdjustRows(rows, splitsAdj) {
  if (!splitsAdj || !splitsAdj.length) return rows;
  return rows.map((r) => {
    const f = r._ttm ? 1 : splitFactor(splitsAdj, r.fiscalYear || String(r.date).slice(0, 4));
    if (f === 1) return r;
    const o = { ...r, _splitAdj: f };
    for (const k of SHARE_F) if (isNum(o[k])) o[k] *= f;
    for (const k of PERSHARE_F) if (isNum(o[k])) o[k] /= f;
    return o;
  });
}

/**
 * Ajuste por fecha (trimestres): factor = splits posteriores a la fecha de la fila. Solo se aplica si la fila está
 * realmente sin ajustar (sus acciones × factor se parecen a las de la fila más reciente); así no se ajusta dos veces
 * lo que la fuente ya da ajustado.
 */
export function splitAdjustRowsByDate(rows, splits, refShares) {
  const sp = (splits || []).filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.numerator > 0 && s.denominator > 0);
  if (!sp.length || !rows.length) return rows;
  const shOf = (r) => r.weightedAverageShsOutDil ?? r.weightedAverageShsOut;
  const ref = isNum(refShares) ? refShares : shOf(rows[rows.length - 1]);
  return rows.map((r) => {
    const f = sp.filter((s) => String(s.date) > String(r.date)).reduce((a, s) => a * (s.numerator / s.denominator), 1);
    if (f === 1 || !isNum(shOf(r)) || !isNum(ref)) return r;
    // Solo si al ajustar queda MÁS cerca de la fila reciente (y casi igual): si ya venía ajustada, se deja
    const after = (shOf(r) * f) / ref, before = shOf(r) / ref;
    if (!(after > 0.7 && after < 1.4 && Math.abs(Math.log(after)) < Math.abs(Math.log(before)))) return r;
    const o = { ...r, _splitAdj: f };
    for (const k of SHARE_F) if (isNum(o[k])) o[k] *= f;
    for (const k of PERSHARE_F) if (isNum(o[k])) o[k] /= f;
    return o;
  });
}

export function adjustSplits(years, knownSplits = null) {
  const COMMON = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50];
  const found = [];
  // Lista real de splits del proveedor (si se tiene). Cada split se usa una sola vez.
  let known = Array.isArray(knownSplits) ? knownSplits.filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.numerator > 0 && s.denominator > 0).map((s) => ({ date: String(s.date), f: s.numerator / s.denominator })).sort((x, y) => x.date.localeCompare(y.date)) : null;
  const near = (r, x) => Math.abs(r / x - 1) < 0.12;
  for (let i = years.length - 1; i > 0; i--) {
    const a = years[i], b = years[i - 1];
    if (!isNum(a.shares) || !isNum(b.shares) || b.shares <= 0) continue;
    const r = a.shares / b.shares;
    let f = null, used = [];
    if (known) {
      const from = String(b.date || b.year), to = String(a.date || `${a.year}-12-31`);
      // 1) Splits ocurridos entre los dos cierres (caso normal: misma fuente sin ajustar)
      const inside = known.filter((s) => s.date > from && s.date <= to);
      const kIn = inside.reduce((x, s) => x * s.f, 1);
      if (inside.length && near(r, kIn)) { f = kIn; used = inside; }
      // 2) Años de fuentes distintas (p. ej. SEC reexpresada a medias junto a FMP ajustada): el salto es el producto
      //    de los splits POSTERIORES más recientes que una tiene y la otra no (productos desde el más reciente hacia atrás).
      else if ((a.src || '') !== (b.src || '')) {
        const after = known.filter((s) => s.date > from);
        let acc = 1; const run = [];
        for (let j = after.length - 1; j >= 0; j--) { acc *= after[j].f; run.push(after[j]); if (near(r, acc)) { f = acc; used = [...run]; break; } }
      }
    } else {
      for (const c of COMMON) { if (near(r, c)) f = c; else if (Math.abs(r * c - 1) < 0.12) f = 1 / c; }
      // Confirmación: el beneficio neto no cambia en esa proporción (si cambiara, sería otra cosa)
      const ni = isNum(a.netIncome) && isNum(b.netIncome) && b.netIncome > 0 ? a.netIncome / b.netIncome : 1;
      if (f && Math.abs(ni / f - 1) < 0.25 && f !== 1) f = null;
      // Emitió acciones por un importe relevante: el salto es dilución, no un split
      if (f && isNum(a.issuance) && a.issuance > 0 && isNum(a.equity) && a.equity > 0 && a.issuance > 0.2 * a.equity) f = null;
    }
    if (!f) continue;
    if (used.length) known = known.filter((s) => !used.includes(s)); // un split no se aplica dos veces
    found.push({ year: a.year, factor: f });
    for (let j = 0; j < i; j++) {
      const y = years[j];
      if (isNum(y.shares)) y.shares *= f;
      if (isNum(y.eps)) y.eps /= f;
      if (isNum(y.fcfPerShare)) y.fcfPerShare /= f;
    }
  }
  return found;
}
