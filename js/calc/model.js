// Construye el modelo normalizado de una empresa a partir de las respuestas de los proveedores.
// Aquí se resuelven divisas (moneda de cotización vs. moneda de los estados), años fiscales y TTM.
import { isNum, div, asc, buildAnnual, deriveYear, cagrN, mean, median, stdev, lastAvg, yoy, closeAt, priceChanges, betaFrom, piotroski, altman, adjustSplits } from './finance.js?v=f598cc18';
import { wacc as waccCalc, analystGrowth } from './valuation.js?v=f598cc18';

const val = (r) => (r && r.ok ? r.data : null);
const prov = (r) => (r && r.ok ? { source: r.source, fetchedAt: r.fetchedAt, cached: r.cached, endpoint: r.endpoint } : { error: r && r.error ? r.error.code : 'missing', message: r && r.error ? r.error.message : '' });

export function buildModel(raw, fxRate = 1) {
  const profile = val(raw.profile) || {};
  const quote = val(raw.quote) || {};
  const price = quote.price ?? profile.price;
  const tradeCur = profile.currency || quote.currency || 'USD';
  const inc = asc(val(raw.income) || []), bal = asc(val(raw.balance) || []), cf = asc(val(raw.cashflow) || []);
  const repCur = (inc[inc.length - 1] || {}).reportedCurrency || tradeCur;
  const fx = repCur === tradeCur ? 1 : fxRate; // unidades de moneda de cotización por 1 unidad de moneda de reporte

  const years = buildAnnual(inc, bal, cf).map((y) => deriveYear(y));
  const splitsAdj = adjustSplits(years); // acciones y BPA comparables entre años
  const last = years[years.length - 1] || {};
  const prices = asc(val(raw.prices) || []);
  let ratiosHist = asc(val(raw.ratios) || []);
  let kmHist = asc(val(raw.keyMetrics) || []);
  const derived = [];
  const rTTM = val(raw.ratiosTTM) || {}, kTTM = val(raw.keyMetricsTTM) || {};

  // TTM: estados TTM del proveedor si existen; si no, último ejercicio anual (se indica en la interfaz).
  const iT = val(raw.incomeTTM), bT = val(raw.balanceTTM), cT = val(raw.cashflowTTM);
  const ttmYear = iT ? deriveYear({ year: 'TTM', i: iT, b: bT || (bal[bal.length - 1] || {}), c: cT || {} }) : null;
  const T = ttmYear && isNum(ttmYear.revenue) ? ttmYear : last;
  const ttmIsReal = !!(ttmYear && isNum(ttmYear.revenue));

  const shares = quote.sharesOutstanding ?? profile.sharesOutstanding ?? (isNum(profile.marketCap) && isNum(price) && price > 0 ? profile.marketCap / price : null) ?? last.shares;
  const marketCap = quote.marketCap ?? profile.marketCap ?? (isNum(shares) && isNum(price) ? shares * price : null);
  const netDebtT = isNum(T.netDebt) ? T.netDebt * fx : isNum(last.netDebt) ? last.netDebt * fx : null;
  const ev = isNum(marketCap) ? marketCap + (netDebtT || 0) : null;
  const X = (v) => (isNum(v) ? v * fx : null); // a moneda de cotización

  const estimates = asc(val(raw.estimates) || []);
  const lastFY = last.year;
  const nextEst = estimates.find((e) => String(e.date).slice(0, 4) > String(lastFY) && isNum(e.epsAvg));
  const forwardEps = nextEst ? X(nextEst.epsAvg) : null;

  const series = (f) => years.map((y) => y[f]);
  const rev = series('revenue'), ni = series('netIncome'), eps = series('eps'), fcf = series('fcf'), sh = series('shares');
  const growth = {
    rev1: cagrN(rev, 1), rev3: cagrN(rev, 3), rev5: cagrN(rev, 5), rev10: cagrN(rev, 10),
    ni3: cagrN(ni, 3), ni5: cagrN(ni, 5), ni10: cagrN(ni, 10),
    eps3: cagrN(eps, 3), eps5: cagrN(eps, 5), eps10: cagrN(eps, 10),
    fcf3: cagrN(fcf, 3), fcf5: cagrN(fcf, 5), fcf10: cagrN(fcf, 10),
    shares5: cagrN(sh, 5), shares1: cagrN(sh, 1),
    analystRev: analystGrowth(estimates, last.revenue, lastFY),
    analystEps: (() => { const f = estimates.filter((e) => String(e.date).slice(0, 4) > String(lastFY) && isNum(e.epsAvg)); if (!f.length || !isNum(last.eps) || last.eps <= 0) return null; const far = f[Math.min(f.length - 1, 2)]; const n = Number(String(far.date).slice(0, 4)) - Number(lastFY); return far.epsAvg > 0 && n > 0 ? (far.epsAvg / last.eps) ** (1 / n) - 1 : null; })(),
  };

  // Dividendos
  // Si el proveedor no da el dividendo ajustado, se ajusta con los splits conocidos (los de antes del split se dividen).
  const splitList = (val(raw.splits) || []).filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.denominator > 0 && s.numerator / s.denominator > 1);
  const divs = asc(val(raw.dividends) || []).filter((d) => isNum(d.adjDividend ?? d.dividend)).map((d) => {
    if (isNum(d.adjDividend) && d.adjDividend !== d.dividend) return d;
    const f = splitList.filter((s) => String(s.date) > String(d.date)).reduce((a, s) => a * (s.numerator / s.denominator), 1);
    return f > 1 ? { ...d, adjDividend: d.dividend / f } : d;
  });
  const byYear = {};
  for (const d of divs) { const y = String(d.date).slice(0, 4); byYear[y] = (byYear[y] || 0) + (d.adjDividend ?? d.dividend); }
  const curYear = String(new Date().getFullYear());
  const dpsYears = Object.keys(byYear).filter((y) => y < curYear).sort();
  const dpsSeries = dpsYears.map((y) => ({ year: y, dps: byYear[y] }));
  const last12 = divs.filter((d) => new Date(d.date) > new Date(Date.now() - 365 * 864e5)).reduce((a, d) => a + (d.adjDividend ?? d.dividend), 0);
  const dpsTTM = last12 || (isNum(profile.lastDividend) ? profile.lastDividend : 0);

  // Datos de mercado para el WACC (todos con su origen)
  const tr = asc(val(raw.treasury) || []); const rfReal = tr.length ? tr[tr.length - 1].year10 / 100 : null;
  const rfAssumed = !isNum(rfReal); const rf10 = rfAssumed ? 0.045 : rfReal;
  const rp = val(raw.riskPremium) || [];
  const country = profile.country || 'US';
  const rpRow = Array.isArray(rp) ? rp.find((r) => r.country === countryName(country)) || rp.find((r) => r.country === 'United States') : null;
  const erpAssumed = !rpRow; const erp = rpRow ? rpRow.totalEquityRiskPremium / 100 : 0.045;
  const costDebt = lastAvg(series('costOfDebt').filter((v) => isNum(v) && v > 0 && v < 0.25), 3);
  const spy = asc(val(raw.spy) || []);
  const betaCalc = !isNum(profile.beta) && prices.length > 500 && spy.length > 500 ? betaFrom(prices, spy) : null;
  const betaAssumed = !isNum(profile.beta) && !isNum(betaCalc);
  const betaRaw = isNum(profile.beta) ? profile.beta : isNum(betaCalc) ? betaCalc : 1;
  // Beta ajustada de Blume (0,67·beta + 0,33): la beta histórica tiende a volver a 1; evita costes de capital extremos.
  const beta = betaAssumed ? 1 : 0.67 * betaRaw + 0.33;
  if (isNum(betaCalc)) derived.push('beta');
  const w = waccCalc({ rf: rf10, beta, erp, costDebtPre: costDebt, taxRate: lastAvg(series('taxRate'), 3), equityValue: marketCap, debtValue: X(T.debt ?? last.debt) });

  // ---- Cálculos propios cuando el proveedor no da el dato (se marcan como «calculado») ----
  if ((!ratiosHist.length || !kmHist.length) && prices.length > 200) {
    const R = [], K = [];
    for (const y of years) {
      const p = closeAt(prices, String(y.date || '').slice(0, 10)); if (!p || !isNum(y.shares)) continue;
      const mc = p.close * y.shares, Xv = (v) => (isNum(v) ? v * fx : null);
      const evv = mc + (Xv(y.netDebt) || 0), dps = (dpsSeries.find((d) => d.year === y.year) || {}).dps;
      R.push({ fiscalYear: y.year, date: y.date, priceToEarningsRatio: div(p.close, Xv(y.eps)), priceToSalesRatio: div(mc, Xv(y.revenue)), priceToBookRatio: div(mc, Xv(y.equity)), dividendYield: isNum(dps) && dps / p.close < 0.25 ? dps / p.close : null, _derived: true });
      K.push({ fiscalYear: y.year, date: y.date, enterpriseValue: evv, evToEBITDA: div(evv, Xv(y.ebitda)), evToFreeCashFlow: div(evv, Xv(y.fcf)), freeCashFlowYield: div(Xv(y.fcf), mc), earningsYield: div(Xv(y.netIncome), mc), _derived: true });
    }
    if (!ratiosHist.length && R.length) { ratiosHist = R; derived.push('ratios históricos'); }
    if (!kmHist.length && K.length) { kmHist = K; derived.push('múltiplos históricos'); }
  }
  let change = val(raw.priceChange) || {};
  if (!Object.keys(change).length && prices.length > 2) { change = priceChanges(prices); derived.push('variaciones de precio'); }
  let scores = val(raw.scores) || {};
  if (!isNum(scores.piotroskiScore) && years.length >= 2) { const f = piotroski(years[years.length - 1], years[years.length - 2]); if (isNum(f)) { scores = { ...scores, piotroskiScore: f }; derived.push('Piotroski'); } }
  if (!isNum(scores.altmanZScore) && years.length) { const z = altman(years[years.length - 1], isNum(marketCap) ? marketCap / fx : null); if (isNum(z)) { scores = { ...scores, altmanZScore: z }; derived.push('Altman Z'); } }

  // PER coherente con el resto del análisis: precio / BPA del mismo periodo que los estados (TTM o último ejercicio).
  const peRatio = div(price, X(T.eps));
  const peProvider = isNum(rTTM.priceToEarningsRatioTTM) && fx === 1 ? rTTM.priceToEarningsRatioTTM : null;
  const periodLabel = ttmIsReal ? 'últimos 12 meses (TTM)' : `último ejercicio cerrado (${last.year || '—'}${last.date ? ', cierre ' + String(last.date).slice(0, 10) : ''})`;

  return {
    symbol: profile.symbol, profile, quote, price, tradeCur, repCur, fx, shares, marketCap, ev, netDebt: netDebtT,
    years, last, T, ttmIsReal, ratiosHist, kmHist, rTTM, kTTM, scores, estimates, forwardEps,
    priceTarget: val(raw.priceTarget) || {}, grades: val(raw.gradesConsensus) || {}, fmpDcf: val(raw.dcf) || {},
    change, growth, derived, splitsAdj, divs, dpsSeries, dpsTTM, splits: asc(val(raw.splits) || []), earnings: asc(val(raw.earnings) || []),
    market: { rf10, rfAssumed, rfDate: tr.length ? tr[tr.length - 1].date : null, erp, erpAssumed, erpCountry: rpRow ? rpRow.country : null, beta, betaRaw, betaAssumed, betaCalc: isNum(betaCalc), costDebt, wacc: w },
    pe: peRatio, peProvider, periodLabel, prov: Object.fromEntries(Object.entries(raw).map(([k, r]) => [k, prov(r)])), X,
    stats: { revVol: stdev(yoy(rev).filter(isNum)), gmStd: stdev(series('grossMargin').slice(-10)), roicAvg5: lastAvg(series('roic'), 5), roicMin5: Math.min(...series('roic').slice(-5).filter(isNum)), gmAvg5: lastAvg(series('grossMargin'), 5), omAvg5: lastAvg(series('operatingMargin'), 5) },
    median, mean,
  };
}

const COUNTRIES = { US: 'United States', ES: 'Spain', DE: 'Germany', FR: 'France', GB: 'United Kingdom', NL: 'Netherlands', IT: 'Italy', CH: 'Switzerland', JP: 'Japan', CN: 'China', TW: 'Taiwan', KR: 'South Korea', CA: 'Canada', IE: 'Ireland', SE: 'Sweden', DK: 'Denmark', NO: 'Norway', FI: 'Finland', BE: 'Belgium', PT: 'Portugal', AU: 'Australia', BR: 'Brazil', IN: 'India', HK: 'Hong Kong', MX: 'Mexico', IL: 'Israel', LU: 'Luxembourg', AT: 'Austria' };
export const countryName = (c) => COUNTRIES[c] || c;
