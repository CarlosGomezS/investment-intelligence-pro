// Proveedor Alpha Vantage (respaldo). Normaliza sus respuestas al modelo canónico (nombres de FMP).
import { getJSON } from './http.js?v=e6c88f56';
import { config } from '../config.js?v=e6c88f56';

const H = () => config.get().cacheHours;
const n = (v) => (v === undefined || v === null || v === 'None' || v === '-' || v === '' ? null : Number(v));
const q = (fn, params, ttl, v) => getJSON('av', '', { function: fn, ...params }, ttl, v);

function incomeRow(r, sym, cur) {
  const rev = n(r.totalRevenue), ni = n(r.netIncome);
  return {
    date: r.fiscalDateEnding, symbol: sym, reportedCurrency: r.reportedCurrency || cur, fiscalYear: (r.fiscalDateEnding || '').slice(0, 4), period: 'FY',
    revenue: rev, costOfRevenue: n(r.costOfRevenue) ?? n(r.costofGoodsAndServicesSold), grossProfit: n(r.grossProfit),
    researchAndDevelopmentExpenses: n(r.researchAndDevelopment), sellingGeneralAndAdministrativeExpenses: n(r.sellingGeneralAndAdministrative),
    operatingExpenses: n(r.operatingExpenses), operatingIncome: n(r.operatingIncome), ebit: n(r.ebit), ebitda: n(r.ebitda),
    interestExpense: n(r.interestExpense), incomeBeforeTax: n(r.incomeBeforeTax), incomeTaxExpense: n(r.incomeTaxExpense),
    netIncome: ni, depreciationAndAmortization: n(r.depreciationAndAmortization), eps: null, epsDiluted: null,
    weightedAverageShsOut: null, weightedAverageShsOutDil: null, _source: 'Alpha Vantage',
  };
}
function balanceRow(r, sym) {
  const debt = (n(r.shortLongTermDebtTotal) ?? ((n(r.shortTermDebt) || 0) + (n(r.longTermDebt) || 0))) || null;
  const cash = n(r.cashAndCashEquivalentsAtCarryingValue);
  const csti = n(r.cashAndShortTermInvestments);
  return {
    date: r.fiscalDateEnding, symbol: sym, reportedCurrency: r.reportedCurrency, fiscalYear: (r.fiscalDateEnding || '').slice(0, 4), period: 'FY',
    totalCurrentAssets: n(r.totalCurrentAssets), totalNonCurrentAssets: n(r.totalNonCurrentAssets), cashAndCashEquivalents: cash,
    shortTermInvestments: n(r.shortTermInvestments), cashAndShortTermInvestments: csti, longTermInvestments: n(r.longTermInvestments),
    netReceivables: n(r.currentNetReceivables), inventory: n(r.inventory), propertyPlantEquipmentNet: n(r.propertyPlantEquipment),
    goodwill: n(r.goodwill), intangibleAssets: n(r.intangibleAssets), totalAssets: n(r.totalAssets), totalCurrentLiabilities: n(r.totalCurrentLiabilities),
    shortTermDebt: n(r.shortTermDebt) ?? n(r.currentDebt), longTermDebt: n(r.longTermDebt), totalLiabilities: n(r.totalLiabilities),
    totalStockholdersEquity: n(r.totalShareholderEquity), totalDebt: debt, netDebt: debt != null ? debt - (csti ?? cash ?? 0) : null,
    commonStockSharesOutstanding: n(r.commonStockSharesOutstanding), retainedEarnings: n(r.retainedEarnings), _source: 'Alpha Vantage',
  };
}
function cashRow(r, sym) {
  const ocf = n(r.operatingCashflow), capex = n(r.capitalExpenditures);
  return {
    date: r.fiscalDateEnding, symbol: sym, reportedCurrency: r.reportedCurrency, fiscalYear: (r.fiscalDateEnding || '').slice(0, 4), period: 'FY',
    operatingCashFlow: ocf, netCashProvidedByOperatingActivities: ocf, capitalExpenditure: capex != null ? -Math.abs(capex) : null,
    freeCashFlow: ocf != null && capex != null ? ocf - Math.abs(capex) : null, netCashProvidedByInvestingActivities: n(r.cashflowFromInvestment),
    netCashProvidedByFinancingActivities: n(r.cashflowFromFinancing), commonDividendsPaid: n(r.dividendPayoutCommonStock) != null ? -Math.abs(n(r.dividendPayoutCommonStock)) : null,
    commonStockRepurchased: n(r.paymentsForRepurchaseOfCommonStock) != null ? -Math.abs(n(r.paymentsForRepurchaseOfCommonStock)) : null,
    commonStockIssuance: n(r.proceedsFromIssuanceOfCommonStock), stockBasedCompensation: null, acquisitionsNet: null,
    depreciationAndAmortization: n(r.depreciationDepletionAndAmortization), netIncome: n(r.netIncome), _source: 'Alpha Vantage',
  };
}

export const alphavantage = {
  id: 'av',
  name: 'Alpha Vantage',
  async search(query) {
    const r = await q('SYMBOL_SEARCH', { keywords: query }, H().static, (b) => b && b.bestMatches);
    return { ...r, data: (r.data.bestMatches || []).map((m) => ({ symbol: m['1. symbol'], name: m['2. name'], exchange: m['4. region'], currency: m['8. currency'], _source: 'Alpha Vantage' })) };
  },
  async profile(s) {
    const r = await q('OVERVIEW', { symbol: s }, H().fundamentals, (b) => b && b.Symbol);
    const o = r.data;
    return { ...r, data: {
      symbol: o.Symbol, companyName: o.Name, currency: o.Currency, exchange: o.Exchange, exchangeFullName: o.Exchange, country: o.Country,
      sector: o.Sector, industry: o.Industry, description: o.Description, marketCap: n(o.MarketCapitalization), beta: n(o.Beta),
      website: o.OfficialSite, cik: o.CIK, range: o['52WeekLow'] && o['52WeekHigh'] ? `${o['52WeekLow']}-${o['52WeekHigh']}` : null,
      sharesOutstanding: n(o.SharesOutstanding), lastDividend: n(o.DividendPerShare), _forwardPE: n(o.ForwardPE), _source: 'Alpha Vantage',
    } };
  },
  async quote(s) {
    const r = await q('GLOBAL_QUOTE', { symbol: s }, H().quote, (b) => b && b['Global Quote'] && b['Global Quote']['05. price']);
    const g = r.data['Global Quote'];
    return { ...r, data: { symbol: s, price: n(g['05. price']), change: n(g['09. change']), changePercentage: n(String(g['10. change percent']).replace('%', '')), volume: n(g['06. volume']), previousClose: n(g['08. previous close']), timestamp: g['07. latest trading day'] } };
  },
  async pricesDaily(s) {
    const r = await q('TIME_SERIES_DAILY', { symbol: s, outputsize: 'compact' }, H().prices, (b) => b && b['Time Series (Daily)']);
    const ts = r.data['Time Series (Daily)'];
    return { ...r, data: Object.keys(ts).sort().map((d) => ({ date: d, open: n(ts[d]['1. open']), high: n(ts[d]['2. high']), low: n(ts[d]['3. low']), close: n(ts[d]['4. close']), volume: n(ts[d]['5. volume']) })) };
  },
  async income(s, period = 'annual') {
    const r = await q('INCOME_STATEMENT', { symbol: s }, H().fundamentals, (b) => b && b.annualReports);
    const rows = period === 'quarter' ? r.data.quarterlyReports : r.data.annualReports;
    return { ...r, data: (rows || []).map((x) => incomeRow(x, s)) };
  },
  async balance(s, period = 'annual') {
    const r = await q('BALANCE_SHEET', { symbol: s }, H().fundamentals, (b) => b && b.annualReports);
    const rows = period === 'quarter' ? r.data.quarterlyReports : r.data.annualReports;
    return { ...r, data: (rows || []).map((x) => balanceRow(x, s)) };
  },
  async cashflow(s, period = 'annual') {
    const r = await q('CASH_FLOW', { symbol: s }, H().fundamentals, (b) => b && b.annualReports);
    const rows = period === 'quarter' ? r.data.quarterlyReports : r.data.annualReports;
    return { ...r, data: (rows || []).map((x) => cashRow(x, s)) };
  },
  async dividends(s) {
    const r = await q('DIVIDENDS', { symbol: s }, H().fundamentals, (b) => b && b.data);
    return { ...r, data: (r.data.data || []).map((d) => ({ date: d.ex_dividend_date, paymentDate: d.payment_date, recordDate: d.record_date, declarationDate: d.declaration_date, dividend: n(d.amount), adjDividend: n(d.amount) })) };
  },
  async earnings(s) {
    const r = await q('EARNINGS', { symbol: s }, H().fundamentals, (b) => b && b.quarterlyEarnings);
    return { ...r, data: (r.data.quarterlyEarnings || []).map((e) => ({ date: e.reportedDate, epsActual: n(e.reportedEPS), epsEstimated: n(e.estimatedEPS) })) };
  },
  async news(s, limit = 40) {
    const r = await q('NEWS_SENTIMENT', { tickers: s, limit }, H().quote * 10, (b) => b && b.feed);
    return { ...r, data: (r.data.feed || []).map((a) => ({ title: a.title, text: a.summary, url: a.url, site: a.source, publishedDate: `${a.time_published.slice(0, 4)}-${a.time_published.slice(4, 6)}-${a.time_published.slice(6, 8)} ${a.time_published.slice(9, 11)}:${a.time_published.slice(11, 13)}`, sentiment: a.overall_sentiment_label })) };
  },
};
