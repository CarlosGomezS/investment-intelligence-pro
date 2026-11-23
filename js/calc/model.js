// Construye el modelo normalizado de una empresa a partir de las respuestas de los proveedores.
// Aquí se resuelven divisas (moneda de cotización vs. moneda de los estados), años fiscales y TTM.
import { isNum, div, asc, buildAnnual, deriveYear, cagrN, mean, median, stdev, lastAvg, yoy, closeAt, priceChanges, betaFrom, piotroski, altman, adjustSplits } from './finance.js?v=85a54e71';
import { wacc as waccCalc, analystGrowth } from './valuation.js?v=85a54e71';

const val = (r) => (r && r.ok ? r.data : null);
const prov = (r) => (r && r.ok ? { source: r.source, fetchedAt: r.fetchedAt, cached: r.cached, endpoint: r.endpoint } : { error: r && r.error ? r.error.code : 'missing', message: r && r.error ? r.error.message : '' });

export function buildModel(raw, fxRate = 1) {
  const profile = val(raw.profile) || {};
  const quote = val(raw.quote) || {};
  const price = quote.price ?? profile.price;
  const tradeCur = profile.currency || quote.currency || 'USD';
  const inc = asc(val(raw.income) || []), bal = asc(val(raw.balance) || []), cf = asc(val(raw.cashflow) || []);
  const repCur = (inc[inc.length - 1] || {}).reportedCurrency || tradeCur;
  // Unidades de moneda de cotización por 1 unidad de moneda de reporte. Sin tipo de cambio válido NO se supone 1:
  // fx = null deja sin calcular todo lo que cruza precio con estados (valoración, PER, rentabilidades…).
  const fx = repCur === tradeCur ? 1 : isNum(fxRate) && fxRate > 0 ? fxRate : null;
  const fxMissing = fx === null;

  const ys0 = buildAnnual(inc, bal, cf);
  // Si el último ejercicio tiene cuenta de resultados pero su balance aún no ha llegado, se usa el último balance
  // disponible (marcado): así deuda, liquidez, WACC y alertas no se quedan en blanco ni suponen deuda 0
  let balanceFrom = null;
  if (ys0.length >= 2 && !ys0[ys0.length - 1].b && ys0[ys0.length - 2].b) { ys0[ys0.length - 1].b = ys0[ys0.length - 2].b; balanceFrom = ys0[ys0.length - 2].year; }
  const years = ys0.map((y) => deriveYear(y));
  if (balanceFrom && years.length) years[years.length - 1].balanceStale = true; // su balance es el del año anterior
  const splitsAdj = adjustSplits(years, raw.splits && raw.splits.ok ? val(raw.splits) || [] : null); // acciones y BPA comparables entre años
  const last = years[years.length - 1] || {};
  let prices = asc(val(raw.prices) || []);
  // Precios sin ajustar (Alpha Vantage gratuito): se ajustan con la lista REAL de splits, nunca por intuición
  if (raw.prices && raw.prices.unadjusted && raw.splits && raw.splits.ok) {
    const sp = (val(raw.splits) || []).filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.numerator > 0 && s.denominator > 0);
    if (sp.length) prices = prices.map((p) => { const f = sp.filter((s) => String(s.date) > String(p.date)).reduce((a, s) => a * (s.numerator / s.denominator), 1); return f === 1 ? p : { ...p, open: p.open / f, high: p.high / f, low: p.low / f, close: p.close / f }; });
  }
  let ratiosHist = asc(val(raw.ratios) || []);
  let kmHist = asc(val(raw.keyMetrics) || []);
  const derived = [];
  const rTTM = val(raw.ratiosTTM) || {}, kTTM = val(raw.keyMetricsTTM) || {};

  // TTM: estados TTM del proveedor si existen; si no, último ejercicio anual (se indica en la interfaz).
  const iT = val(raw.incomeTTM), bT = val(raw.balanceTTM), cT = val(raw.cashflowTTM);
  const ttmYear = iT ? deriveYear({ year: 'TTM', i: iT, b: bT || (bal[bal.length - 1] || {}), c: cT || {} }) : null;
  // TTM con algún estado sin llegar (p. ej. flujos de caja por tiempo de espera): esas partidas se toman del último anual
  const ttmFilled = [];
  if (ttmYear && isNum(ttmYear.revenue)) for (const [k, v] of Object.entries(last)) if (ttmYear[k] == null && v != null && !['year', 'eps', 'shares', 'fcfPerShare'].includes(k)) { ttmYear[k] = v; ttmFilled.push(k); } // lo que va por acción no se copia (podría ir sin ajustar a splits)
  const T = ttmYear && isNum(ttmYear.revenue) ? ttmYear : last;
  const ttmIsReal = !!(ttmYear && isNum(ttmYear.revenue));

  // Capitalización del proveedor: en bolsas que cotizan en subunidades (peniques…) puede venir en la unidad principal
  let mcProv = quote.marketCap ?? profile.marketCap;
  if (isNum(mcProv) && isNum(price) && price > 0 && /^(GBp|GBX|ILA|ZAc|ZAC)$/.test(tradeCur) && isNum(last.shares) && last.shares > 0) {
    const r = mcProv / price / last.shares; if (r > 0.005 && r < 0.02) mcProv *= 100; // salía 100 veces menor: estaba en libras
  }
  let shares = quote.sharesOutstanding ?? profile.sharesOutstanding ?? (isNum(mcProv) && isNum(price) && price > 0 ? mcProv / price : null) ?? last.shares;
  // Doble clase (GOOGL, META, BRK-B) o ADR (TSM, NVO): las acciones del perfil pueden ser de una sola clase o las
  // ordinarias, mientras el precio es de la clase cotizada o del ADR. Si acciones × precio difiere más de un 25 % de
  // la capitalización del proveedor, se usan las acciones equivalentes a esa capitalización (en vivo con el precio).
  let sharesNote = null;
  // La capitalización del proveedor es de un momento anterior: se compara con el precio DE ESE MOMENTO (el del perfil,
  // o el cierre del día en que se descargó), nunca con el de hoy; si no se sabe ese precio, no se toca nada
  // (así una subida o caída fuerte del día no se confunde con un problema de clases de acciones).
  const pRef = isNum(profile.price) && profile.price > 0 ? profile.price
    : raw.profile && raw.profile.fetchedAt && prices.length ? (closeAt(prices, new Date(raw.profile.fetchedAt - 864e5).toISOString().slice(0, 10)) || {}).close : null;
  if (isNum(shares) && isNum(pRef) && pRef > 0 && isNum(mcProv) && mcProv > 0) {
    const ratio = (shares * pRef) / mcProv;
    if (ratio > 1.25 || ratio < 0.8) { shares = mcProv / pRef; sharesNote = 'equivalentes a la capitalización (doble clase de acciones o ADR)'; }
  }
  // Split posterior al último ejercicio (p. ej. ejecutado este año): las acciones actuales son k veces las del último
  // informe. Se ajustan acciones y BPA de todos los años (y del TTM si viene sin ajustar) para que PER y múltiplos cuadren.
  {
    // También contrasplits y ADR (1 ADR = k acciones ordinarias): factores 1/k
    const COMMON = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50];
    const near = (r) => COMMON.find((c) => Math.abs(r / c - 1) < 0.12) || (() => { const c = COMMON.find((k) => Math.abs(r * k - 1) < 0.12); return c ? 1 / c : null; })();
    const fix = (y, f) => { if (isNum(y.shares)) y.shares *= f; if (isNum(y.eps)) y.eps /= f; if (isNum(y.fcfPerShare)) y.fcfPerShare /= f; };
    let f = isNum(shares) && isNum(last.shares) && last.shares > 0 && shares !== last.shares ? near(shares / last.shares) : null;
    // Con la lista real de splits: un factor > 1 tiene que corresponder a splits posteriores al último cierre
    // (si no, es una ampliación de capital o un desajuste de clases de acciones: no se toca). Un factor < 1 sin
    // contrasplit solo se acepta en ADR (1 ADR = k acciones ordinarias), donde la moneda de cuentas y cotización difiere.
    const known = raw.splits && raw.splits.ok ? (val(raw.splits) || []).filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.numerator > 0 && s.denominator > 0) : null;
    // ADR: emisor extranjero que cotiza en EE. UU. (incluye los que presentan cuentas en USD, como BP o Shell)
    const adr = !!profile.isAdr || repCur !== tradeCur || (!!profile.country && !/^(US|USA|United States)$/i.test(profile.country) && /NYSE|NASDAQ|AMEX|NEW YORK|\bUS\b/i.test(profile.exchange || profile.exchangeFullName || ''));
    const verify = (g, since) => {
      if (!g) return null;
      if (known) { const k = known.filter((s) => String(s.date) > String(since)).reduce((a, s) => a * (s.numerator / s.denominator), 1); return Math.abs(k / g - 1) < 0.12 || (g < 1 && adr) ? g : null; }
      // Sin lista: un salto hacia arriba con una emisión de acciones relevante es dilución, no split
      if (g > 1 && isNum(last.issuance) && isNum(last.equity) && last.equity > 0 && last.issuance > 0.2 * last.equity) return null;
      return g;
    };
    f = verify(f, last.date || last.year);
    if (f) { years.forEach((y) => fix(y, f)); splitsAdj.push({ year: String(Number(last.year) + 1), factor: f, recent: true }); }
    // El TTM pasa por la misma comprobación que los años
    if (ttmYear && ttmYear !== last && isNum(ttmYear.shares) && isNum(shares)) { const g = verify(near(shares / ttmYear.shares), ttmYear.date || last.date || last.year); if (g) fix(ttmYear, g); }
  }
  // En vivo: acciones × precio actual (la capitalización del perfil puede tener días de antigüedad)
  const marketCap = isNum(shares) && isNum(price) && price > 0 ? shares * price : mcProv ?? null;
  // Deuda neta: si el último balance no ha llegado, la del último balance disponible (nunca se supone 0 sin decirlo)
  const ndYear = [...years].reverse().find((y) => isNum(y.netDebt));
  const ndRep = isNum(T.netDebt) ? T.netDebt : ndYear ? ndYear.netDebt : null;
  const netDebtT = isNum(ndRep) && isNum(fx) ? ndRep * fx : null;
  const netDebtFrom = isNum(T.netDebt) ? (T === last ? last.year : 'TTM') : ndYear ? ndYear.year : null;
  const ev = isNum(marketCap) && isNum(netDebtT) ? marketCap + netDebtT : null; // sin deuda neta conocida no hay EV
  const X = (v) => (isNum(v) && isNum(fx) ? v * fx : null); // a moneda de cotización (null si falta el tipo de cambio)

  const estimates = asc(val(raw.estimates) || []);
  const lastFY = last.year;
  const nextEst = estimates.find((e) => String(e.date).slice(0, 4) > String(lastFY) && isNum(e.epsAvg));
  const forwardEps = nextEst ? X(nextEst.epsAvg) : null;

  // Series alineadas al calendario: si falta un ejercicio intermedio se deja un hueco (null), así un CAGR «a 5 años»
  // no mide 6 años por error
  const series = (f) => { const out = []; years.forEach((y, i) => { if (i > 0) { const gap = Number(y.year) - Number(years[i - 1].year); for (let k = 1; k < gap && gap < 30; k++) out.push(null); } out.push(y[f]); }); return out; };
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
  const splitList = (val(raw.splits) || []).filter((s) => isNum(s.numerator) && isNum(s.denominator) && s.denominator > 0 && s.numerator > 0 && s.numerator !== s.denominator); // splits y contrasplits
  const divs = asc(val(raw.dividends) || []).filter((d) => isNum(d.adjDividend ?? d.dividend)).map((d) => {
    if (isNum(d.adjDividend) && d.adjDividend !== d.dividend) return d;
    if (raw.dividends && /Alpha Vantage/.test(raw.dividends.source || '')) return d; // Alpha Vantage ya da los dividendos ajustados
    const f = splitList.filter((s) => String(s.date) > String(d.date)).reduce((a, s) => a * (s.numerator / s.denominator), 1);
    return f !== 1 ? { ...d, adjDividend: d.dividend / f } : d;
  });
  const byYear = {};
  for (const d of divs) { const y = String(d.date).slice(0, 4); byYear[y] = (byYear[y] || 0) + (d.adjDividend ?? d.dividend); }
  const curYear = String(new Date().getFullYear());
  const dpsYears = Object.keys(byYear).filter((y) => y < curYear).sort();
  const dpsSeries = dpsYears.map((y) => ({ year: y, dps: byYear[y] }));
  const last12 = divs.filter((d) => new Date(d.date) > new Date(Date.now() - 365 * 864e5)).reduce((a, d) => a + (d.adjDividend ?? d.dividend), 0);
  // El último dividendo del perfil solo como respaldo si no llegó el historial (si llegó y no hay pagos en 12 meses, es 0)
  let dpsTTM = last12 || (!(raw.dividends && raw.dividends.ok) && isNum(profile.lastDividend) ? profile.lastDividend : 0);
  // Cotización en subunidades (peniques…) con dividendos en la unidad principal (libras): se comprueban contra los
  // dividendos pagados del flujo de caja y, si salen 100 veces menores, se pasan a la moneda de cotización
  let dpsScale = 1;
  if (/^(GBp|GBX|ILA|ZAc|ZAC)$/.test(tradeCur) && dpsTTM > 0 && isNum(last.dividendsPaid) && last.dividendsPaid > 0 && isNum(fx) && isNum(last.shares) && last.shares > 0) {
    const expected = (last.dividendsPaid * fx) / last.shares; const r = dpsTTM / expected;
    if (r > 0.004 && r < 0.025) dpsScale = 100;
  }
  dpsTTM *= dpsScale;
  if (dpsScale !== 1) { for (const d of dpsSeries) d.dps *= dpsScale; for (let i = 0; i < divs.length; i++) divs[i] = { ...divs[i], adjDividend: (divs[i].adjDividend ?? divs[i].dividend) * dpsScale, dividend: divs[i].dividend * dpsScale }; }

  // Datos de mercado para el WACC (todos con su origen)
  const tr = asc(val(raw.treasury) || []); const rfReal = tr.length ? tr[tr.length - 1].year10 / 100 : null;
  const rfAssumed = !isNum(rfReal); const rf10 = rfAssumed ? 0.045 : rfReal;
  const rp = val(raw.riskPremium) || [];
  const country = profile.country || 'US';
  const rpRow = Array.isArray(rp) ? rp.find((r) => r.country === countryName(country)) || rp.find((r) => r.country === 'United States') : null;
  const erpAssumed = !rpRow; const erp = rpRow ? rpRow.totalEquityRiskPremium / 100 : 0.045;
  // Coste de la deuda: el histórico (intereses/deuda) puede ser de préstamos antiguos más baratos; nunca por debajo del bono a 10 años
  const costDebtHist = lastAvg(series('costOfDebt').filter((v) => isNum(v) && v > 0 && v < 0.25), 3);
  const spy = asc(val(raw.spy) || []);
  const betaCalc = !isNum(profile.beta) && prices.length > 500 && spy.length > 500 ? betaFrom(prices, spy) : null;
  const betaAssumed = !isNum(profile.beta) && !isNum(betaCalc);
  const betaRaw = isNum(profile.beta) ? profile.beta : isNum(betaCalc) ? betaCalc : 1;
  // Beta ajustada de Blume (0,67·beta + 0,33): la beta histórica tiende a volver a 1; evita costes de capital extremos.
  const beta = betaAssumed ? 1 : 0.67 * betaRaw + 0.33;
  if (isNum(betaCalc)) derived.push('beta');
  const costDebt = isNum(costDebtHist) ? Math.max(costDebtHist, rf10) : null;
  const taxAvg = lastAvg(series('taxRate'), 3);
  const w = waccCalc({ rf: rf10, beta, erp, costDebtPre: costDebt, taxRate: taxAvg, equityValue: marketCap, debtValue: X(T.debt ?? last.debt) });

  // ---- Cálculos propios cuando el proveedor no da el dato (se marcan como «calculado») ----
  // Con cuentas en otra moneda no se derivan: aplicar el tipo de cambio de hoy a beneficios de hace 10 años los falsearía
  const fxExact = fx === 1 || (/^(GBp|GBX|ILA|ZAc|ZAC)$/.test(tradeCur) && ({ GBp: 'GBP', GBX: 'GBP', ILA: 'ILS', ZAc: 'ZAR', ZAC: 'ZAR' })[tradeCur] === repCur); // peniques/libras: conversión fija ×100
  if ((!ratiosHist.length || !kmHist.length) && prices.length > 200 && fxExact) {
    const R = [], K = [];
    for (const y of years) {
      const p = closeAt(prices, String(y.date || '').slice(0, 10)); if (!p || !isNum(y.shares)) continue;
      const mc = p.close * y.shares, Xv = (v) => (isNum(v) && isNum(fx) ? v * fx : null);
      const evv = isNum(y.netDebt) ? mc + Xv(y.netDebt) : null, dps = /* sin deuda neta de ese año no hay EV */ (dpsSeries.find((d) => d.year === y.year) || {}).dps;
      R.push({ fiscalYear: y.year, date: y.date, priceToEarningsRatio: div(p.close, Xv(y.eps)), priceToSalesRatio: div(mc, Xv(y.revenue)), priceToBookRatio: div(mc, Xv(y.equity)), dividendYield: isNum(dps) && dps / p.close < 0.25 ? dps / p.close : null, _derived: true });
      K.push({ fiscalYear: y.year, date: y.date, enterpriseValue: evv, evToEBITDA: div(evv, Xv(y.ebitda)), evToFreeCashFlow: div(evv, Xv(y.fcf)), freeCashFlowYield: div(Xv(y.fcf), mc), earningsYield: div(Xv(y.netIncome), mc), _derived: true });
    }
    if (!ratiosHist.length && R.length) { ratiosHist = R; derived.push('ratios históricos'); }
    if (!kmHist.length && K.length) { kmHist = K; derived.push('múltiplos históricos'); }
  }
  let change = val(raw.priceChange) || {};
  if (!Object.keys(change).length && prices.length > 2) { change = priceChanges(prices); derived.push('variaciones de precio'); }
  let scores = val(raw.scores) || {};
  // Con el balance copiado del año anterior, el F-Score regalaría puntos (deuda y liquidez «sin cambios»): no se calcula
  if (!isNum(scores.piotroskiScore) && years.length >= 2 && !years[years.length - 1].balanceStale) { const f = piotroski(years[years.length - 1], years[years.length - 2]); if (isNum(f)) { scores = { ...scores, piotroskiScore: f }; derived.push('Piotroski'); } }
  if (!isNum(scores.altmanZScore) && years.length) { const z = altman(years[years.length - 1], isNum(marketCap) && isNum(fx) ? marketCap / fx : null); if (isNum(z)) { scores = { ...scores, altmanZScore: z }; derived.push('Altman Z'); } }

  // PER coherente con el resto del análisis: precio / BPA del mismo periodo que los estados (TTM o último ejercicio).
  const peRatio = div(price, X(T.eps));
  const peProvider = isNum(rTTM.priceToEarningsRatioTTM) && fx === 1 ? rTTM.priceToEarningsRatioTTM : null;
  const periodLabel = ttmIsReal ? 'últimos 12 meses (TTM)' : `último ejercicio cerrado (${last.year || '—'}${last.date ? ', cierre ' + String(last.date).slice(0, 10) : ''})`;

  return {
    symbol: profile.symbol, profile, quote, price, tradeCur, repCur, fx, fxMissing, ttmFilled, netDebtFrom, balanceFrom, sharesNote, shares, marketCap, ev, netDebt: netDebtT,
    years, last, T, ttmIsReal, prices, ratiosHist, kmHist, rTTM, kTTM, scores, estimates, forwardEps,
    priceTarget: val(raw.priceTarget) || {}, grades: val(raw.gradesConsensus) || {}, fmpDcf: val(raw.dcf) || {},
    change, growth, derived, splitsAdj, divs, dpsSeries, dpsTTM, splits: asc(val(raw.splits) || []), earnings: asc(val(raw.earnings) || []),
    market: { rf10, rfAssumed, rfDate: tr.length ? tr[tr.length - 1].date : null, erp, erpAssumed, erpCountry: rpRow ? rpRow.country : null, beta, betaRaw, betaAssumed, betaCalc: isNum(betaCalc), costDebt, taxAvg, wacc: w },
    pe: peRatio, peProvider, periodLabel, prov: Object.fromEntries(Object.entries(raw).map(([k, r]) => [k, prov(r)])), X,
    stats: { revVol: stdev(yoy(rev).filter(isNum)), gmStd: stdev(series('grossMargin').slice(-10)), roicAvg5: lastAvg(series('rc'), 5), roicMin5: Math.min(...series('rc').slice(-5).filter(isNum)), roicIsRoce: !!last.negCapital, gmAvg5: lastAvg(series('grossMargin'), 5), omAvg5: lastAvg(series('operatingMargin'), 5) },
    median, mean,
  };
}

const COUNTRIES = { US: 'United States', ES: 'Spain', DE: 'Germany', FR: 'France', GB: 'United Kingdom', NL: 'Netherlands', IT: 'Italy', CH: 'Switzerland', JP: 'Japan', CN: 'China', TW: 'Taiwan', KR: 'South Korea', CA: 'Canada', IE: 'Ireland', SE: 'Sweden', DK: 'Denmark', NO: 'Norway', FI: 'Finland', BE: 'Belgium', PT: 'Portugal', AU: 'Australia', BR: 'Brazil', IN: 'India', HK: 'Hong Kong', MX: 'Mexico', IL: 'Israel', LU: 'Luxembourg', AT: 'Austria' };
export const countryName = (c) => COUNTRIES[c] || c;
