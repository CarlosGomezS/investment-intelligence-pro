// Conversión de hechos XBRL (US-GAAP de la SEC o IFRS de los informes ESEF europeos) al modelo canónico.
// Entrada: lista de hechos {concept, start, end, val, unit, filed}. Salida: filas anuales de los tres estados.
// Para cada partida se prueban varios conceptos en orden; un año se rellena con el primero que lo tenga.

const G = (...c) => c.map((x) => 'us-gaap:' + x);
const I = (...c) => c.map((x) => 'ifrs-full:' + x);

export const MAP = {
  income: {
    revenue: [...G('RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet'), ...I('Revenue', 'RevenueFromContractsWithCustomers')],
    costOfRevenue: [...G('CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'), ...I('CostOfSales')],
    grossProfit: [...G('GrossProfit'), ...I('GrossProfit')],
    researchAndDevelopmentExpenses: [...G('ResearchAndDevelopmentExpense'), ...I('ResearchAndDevelopmentExpense')],
    sellingGeneralAndAdministrativeExpenses: [...G('SellingGeneralAndAdministrativeExpense'), ...I('SellingGeneralAndAdministrativeExpense', 'AdministrativeExpense')],
    operatingExpenses: [...G('OperatingExpenses', 'CostsAndExpenses')],
    operatingIncome: [...G('OperatingIncomeLoss'), ...I('ProfitLossFromOperatingActivities')],
    interestExpense: [...G('InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'), ...I('FinanceCosts', 'InterestExpense')],
    incomeBeforeTax: [...G('IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'), ...I('ProfitLossBeforeTax')],
    incomeTaxExpense: [...G('IncomeTaxExpenseBenefit'), ...I('IncomeTaxExpenseContinuingOperations')],
    netIncome: [...G('NetIncomeLoss', 'ProfitLoss'), ...I('ProfitLossAttributableToOwnersOfParent', 'ProfitLoss')],
    eps: [...G('EarningsPerShareBasic'), ...I('BasicEarningsLossPerShare')],
    epsDiluted: [...G('EarningsPerShareDiluted'), ...I('DilutedEarningsLossPerShare')],
    weightedAverageShsOut: [...G('WeightedAverageNumberOfSharesOutstandingBasic'), ...I('WeightedAverageShares')],
    weightedAverageShsOutDil: [...G('WeightedAverageNumberOfDilutedSharesOutstanding'), ...I('AdjustedWeightedAverageShares')],
    depreciationAndAmortization: [...G('DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'), ...I('DepreciationAndAmortisationExpense', 'DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss', 'AdjustmentsForDepreciationAndAmortisationExpense')],
  },
  balance: {
    totalCurrentAssets: [...G('AssetsCurrent'), ...I('CurrentAssets')],
    totalNonCurrentAssets: [...G('AssetsNoncurrent'), ...I('NoncurrentAssets')],
    cashAndCashEquivalents: [...G('CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'), ...I('CashAndCashEquivalents')],
    shortTermInvestments: [...G('ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'), ...I('CurrentFinancialAssetsAtFairValueThroughProfitOrLoss', 'OtherCurrentFinancialAssets')],
    netReceivables: [...G('AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'), ...I('TradeAndOtherCurrentReceivables', 'CurrentTradeReceivables')],
    inventory: [...G('InventoryNet'), ...I('Inventories')],
    propertyPlantEquipmentNet: [...G('PropertyPlantAndEquipmentNet'), ...I('PropertyPlantAndEquipment')],
    goodwill: [...G('Goodwill'), ...I('Goodwill')],
    intangibleAssets: [...G('IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'), ...I('IntangibleAssetsOtherThanGoodwill')],
    longTermInvestments: [...G('LongTermInvestments', 'MarketableSecuritiesNoncurrent')],
    totalAssets: [...G('Assets'), ...I('Assets')],
    totalCurrentLiabilities: [...G('LiabilitiesCurrent'), ...I('CurrentLiabilities')],
    shortTermDebt: [...G('LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'CommercialPaper'), ...I('CurrentBorrowings', 'ShorttermBorrowings', 'CurrentPortionOfLongtermBorrowings')],
    longTermDebt: [...G('LongTermDebtNoncurrent', 'LongTermDebt'), ...I('NoncurrentBorrowings', 'LongtermBorrowings')],
    totalLiabilities: [...G('Liabilities'), ...I('Liabilities')],
    retainedEarnings: [...G('RetainedEarningsAccumulatedDeficit'), ...I('RetainedEarnings')],
    totalStockholdersEquity: [...G('StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'), ...I('EquityAttributableToOwnersOfParent', 'Equity')],
  },
  cashflow: {
    operatingCashFlow: [...G('NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'), ...I('CashFlowsFromUsedInOperatingActivities')],
    netCashProvidedByInvestingActivities: [...G('NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'), ...I('CashFlowsFromUsedInInvestingActivities')],
    netCashProvidedByFinancingActivities: [...G('NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'), ...I('CashFlowsFromUsedInFinancingActivities')],
    capex: [...G('PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'), ...I('PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PurchaseOfPropertyPlantAndEquipment')],
    capexIntangibles: [...I('PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities')],
    dividends: [...G('PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'), ...I('DividendsPaidClassifiedAsFinancingActivities', 'DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities')],
    buybacks: [...G('PaymentsForRepurchaseOfCommonStock'), ...I('PaymentsToAcquireOrRedeemEntitysShares')],
    issuance: [...G('ProceedsFromIssuanceOfCommonStock'), ...I('ProceedsFromIssuingShares')],
    acquisitions: [...G('PaymentsToAcquireBusinessesNetOfCashAcquired'), ...I('CashFlowsUsedInObtainingControlOfSubsidiariesOrOtherBusinessesClassifiedAsInvestingActivities')],
    stockBasedCompensation: [...G('ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'), ...I('AdjustmentsForSharebasedPayments')],
  },
};

const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
const n = (v) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v));

/**
 * facts: [{concept, start?, end, val, unit, filed?}]
 * Devuelve {income, balance, cashflow} en orden descendente de fecha (como los demás proveedores).
 */
export function toStatements(facts, symbol, maxYears = 15) {
  const by = new Map(); // concepto → (fecha fin → hecho)
  for (const f of facts) {
    const v = n(f.val); if (v == null || !Number.isFinite(v)) continue;
    const isFlow = !!f.start;
    if (isFlow) { const d = days(f.start, f.end); if (d < 330 || d > 400) continue; }
    if (!by.has(f.concept)) by.set(f.concept, new Map());
    const m = by.get(f.concept), prev = m.get(f.end);
    if (!prev || (f.filed || '') > (prev.filed || '')) m.set(f.end, { ...f, val: v });
  }
  const pick = (cands) => { const out = new Map(); for (const c of cands) { const m = by.get(c); if (!m) continue; for (const [end, f] of m) if (!out.has(end)) out.set(end, f); } return out; };
  // Fechas de cierre anual: las del concepto de ingresos/beneficio (flujos) y activos (balance)
  const anchorFlows = [...pick([...MAP.income.revenue, ...MAP.income.netIncome]).keys()];
  const anchorBal = [...pick(MAP.balance.totalAssets).keys()];
  const ends = [...new Set(anchorFlows)].sort().reverse().slice(0, maxYears);
  const bEnds = [...new Set(anchorBal)].filter((e) => ends.some((x) => Math.abs(days(x, e)) < 15)).sort().reverse().slice(0, maxYears);
  const near = (m, end) => { if (m.has(end)) return m.get(end); for (const [e, f] of m) if (Math.abs(days(e, end)) < 15) return f; return null; };
  const cur = (fs) => { for (const f of fs) if (f && f.unit && !/shares|pure/i.test(String(f.unit))) return String(f.unit).replace(/^iso4217:/, ''); return null; };
  const mk = (sec, list) => list.map((end) => {
    const row = { date: end, symbol, fiscalYear: end.slice(0, 4), period: 'FY' }, used = [];
    for (const [k, cands] of Object.entries(MAP[sec])) { const f = near(pick(cands), end); row[k] = f ? f.val : null; if (f) used.push(f); }
    row.reportedCurrency = cur(used);
    return row;
  });
  const income = mk('income', ends).map((r) => {
    if (r.grossProfit == null && r.revenue != null && r.costOfRevenue != null) r.grossProfit = r.revenue - r.costOfRevenue;
    r.ebit = r.operatingIncome; r.ebitda = r.operatingIncome != null && r.depreciationAndAmortization != null ? r.operatingIncome + Math.abs(r.depreciationAndAmortization) : null;
    if (r.interestExpense != null) r.interestExpense = Math.abs(r.interestExpense);
    return r;
  });
  const balance = mk('balance', bEnds).map((r) => {
    const debt = (r.shortTermDebt || 0) + (r.longTermDebt || 0);
    r.totalDebt = r.shortTermDebt == null && r.longTermDebt == null ? null : debt;
    r.cashAndShortTermInvestments = r.cashAndCashEquivalents != null ? r.cashAndCashEquivalents + (r.shortTermInvestments || 0) : null;
    r.netDebt = r.totalDebt != null ? r.totalDebt - (r.cashAndShortTermInvestments || 0) : null;
    return r;
  });
  const cashflow = mk('cashflow', ends).map((r) => {
    const capex = r.capex != null ? Math.abs(r.capex) + Math.abs(r.capexIntangibles || 0) : null;
    r.capitalExpenditure = capex != null ? -capex : null;
    r.freeCashFlow = r.operatingCashFlow != null && capex != null ? r.operatingCashFlow - capex : null;
    r.netCashProvidedByOperatingActivities = r.operatingCashFlow;
    r.commonDividendsPaid = r.dividends != null ? -Math.abs(r.dividends) : null;
    r.commonStockRepurchased = r.buybacks != null ? -Math.abs(r.buybacks) : null;
    r.commonStockIssuance = r.issuance;
    r.acquisitionsNet = r.acquisitions != null ? -Math.abs(r.acquisitions) : null;
    return r;
  });
  return { income, balance, cashflow };
}
