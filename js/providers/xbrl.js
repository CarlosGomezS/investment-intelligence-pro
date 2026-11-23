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
    researchAndDevelopmentExpenses: [...G('ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost', 'ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost'), ...I('ResearchAndDevelopmentExpense')],
    sellingGeneralAndAdministrativeExpenses: [...G('SellingGeneralAndAdministrativeExpense'), ...I('SellingGeneralAndAdministrativeExpense', 'AdministrativeExpense')],
    sellingAndMarketingExpenses: [...G('SellingAndMarketingExpense', 'MarketingAndAdvertisingExpense'), ...I('DistributionCosts', 'SellingExpense')],
    generalAndAdministrativeExpenses: [...G('GeneralAndAdministrativeExpense'), ...I('AdministrativeExpense')],
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
    // Deuda: se suman sus componentes en el posproceso (ver más abajo); aquí cada uno por separado
    debtCurrentTotal: [...G('DebtCurrent'), ...I('CurrentBorrowings', 'ShorttermBorrowings')],
    ltdCurrent: [...G('LongTermDebtCurrent'), ...I('CurrentPortionOfLongtermBorrowings')],
    stBorrowings: [...G('ShortTermBorrowings')],
    commercialPaper: [...G('CommercialPaper')],
    longTermDebt: [...G('LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'), ...I('NoncurrentBorrowings', 'LongtermBorrowings')],
    longTermDebtTotal: [...G('LongTermDebt')], // en US-GAAP incluye la parte a corto
    leaseCurrent: [...G('OperatingLeaseLiabilityCurrent'), ...I('CurrentLeaseLiabilities')],
    leaseNoncurrent: [...G('OperatingLeaseLiabilityNoncurrent'), ...I('NoncurrentLeaseLiabilities')],
    financeLease: [...G('FinanceLeaseLiability')],
    deferredRevenue: [...G('ContractWithCustomerLiabilityCurrent', 'DeferredRevenueCurrent'), ...I('CurrentContractLiabilities')],
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
  // Una sola moneda: algunos 20-F dan cifras en moneda local y su equivalente en USD con la misma fecha
  // Unidades normalizadas: «usd», «USD», «iso4217:USD» y «iso4217:EUR / xbrli:shares» se comparan por su moneda en mayúsculas
  const cur0 = (u) => String(u || '').split('/')[0].trim().replace(/^iso4217:/i, '').toUpperCase();
  const money = (u) => u && !/shares|pure|\//i.test(String(u));
  const cnt = {}; for (const f of facts) if (money(f.unit) && /Revenue|Assets$|ProfitLoss|NetIncomeLoss/.test(f.concept)) cnt[cur0(f.unit)] = (cnt[cur0(f.unit)] || 0) + 1;
  const mainUnit = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
  const by = new Map(); // concepto → (fecha fin → hecho)
  for (const f of facts) {
    const v = n(f.val); if (v == null || !Number.isFinite(v)) continue;
    if (mainUnit && money(f.unit) && cur0(f.unit) !== mainUnit) continue;
    // Importes por acción (USD/shares, TWD/shares…): solo los de la moneda principal
    if (mainUnit && /\//.test(String(f.unit)) && !/^pure/i.test(String(f.unit)) && cur0(f.unit) !== mainUnit) continue;
    const isFlow = !!f.start;
    if (isFlow) { const d = days(f.start, f.end); if (d < 330 || d > 400) continue; }
    if (!by.has(f.concept)) by.set(f.concept, new Map());
    const m = by.get(f.concept), prev = m.get(f.end);
    // Más reciente; con la misma fecha de presentación, el mayor en valor absoluto (el total, no un desglose)
    if (!prev || (f.filed || '') > (prev.filed || '') || ((f.filed || '') === (prev.filed || '') && Math.abs(v) > Math.abs(prev.val))) m.set(f.end, { ...f, val: v });
  }
  const pick = (cands) => { const out = new Map(); for (const c of cands) { const m = by.get(c); if (!m) continue; for (const [end, f] of m) if (!out.has(end)) out.set(end, f); } return out; };
  // Fechas de cierre anual: las del concepto de ingresos/beneficio (flujos) y activos (balance)
  const anchorFlows = [...pick([...MAP.income.revenue, ...MAP.income.netIncome]).keys()];
  const anchorBal = [...pick(MAP.balance.totalAssets).keys()];
  const ends = [...new Set(anchorFlows)].sort().reverse().slice(0, maxYears);
  const bEnds = [...new Set(anchorBal)].filter((e) => ends.some((x) => Math.abs(days(x, e)) < 15)).sort().reverse().slice(0, maxYears);
  const near = (m, end) => { if (m.has(end)) return m.get(end); for (const [e, f] of m) if (Math.abs(days(e, end)) < 15) return f; return null; };
  const cur = (fs) => { for (const f of fs) if (f && f.unit && !/shares|pure|\//i.test(String(f.unit))) return String(f.unit).trim().replace(/^iso4217:/i, '').toUpperCase(); return null; };
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
    if (r.sellingGeneralAndAdministrativeExpenses == null && (r.sellingAndMarketingExpenses != null || r.generalAndAdministrativeExpenses != null)) r.sellingGeneralAndAdministrativeExpenses = (r.sellingAndMarketingExpenses || 0) + (r.generalAndAdministrativeExpenses || 0);
    // BPA: se respeta el publicado (doble clase de acciones, preferentes…); solo si falta se calcula beneficio / acciones
    for (const [k, sh] of [['eps', 'weightedAverageShsOut'], ['epsDiluted', 'weightedAverageShsOutDil']]) {
      if (r[k] == null && r.netIncome != null && r[sh]) r[k] = r.netIncome / r[sh];
    }
    return r;
  });
  const balance = mk('balance', bEnds).map((r) => {
    // Deuda a corto: el total si se publica; si no, la suma de sus partes (vencimientos a corto + préstamos + pagarés)
    r.shortTermDebt = r.debtCurrentTotal != null ? r.debtCurrentTotal : [r.ltdCurrent, r.stBorrowings, r.commercialPaper].some((x) => x != null) ? (r.ltdCurrent || 0) + (r.stBorrowings || 0) + (r.commercialPaper || 0) : null;
    // Deuda a largo: la no corriente; si solo hay el total US-GAAP (que incluye la parte a corto), se le resta esa parte
    // Si no se publica la parte a corto por separado, se resta la deuda corriente total (que la incluye) para no contarla dos veces
    // De la deuda corriente total solo se resta lo que está dentro de LongTermDebt (no pagarés ni préstamos a corto)
    const ltdCur = r.ltdCurrent ?? (r.debtCurrentTotal != null ? Math.max(0, r.debtCurrentTotal - (r.commercialPaper || 0) - (r.stBorrowings || 0)) : 0);
    if (r.longTermDebt == null && r.longTermDebtTotal != null) r.longTermDebt = Math.max(0, r.longTermDebtTotal - ltdCur);
    // Arrendamientos (NIIF 16 / ASC 842): son deuda a efectos de apalancamiento
    const lease = [r.leaseCurrent, r.leaseNoncurrent, r.financeLease].some((x) => x != null) ? (r.leaseCurrent || 0) + (r.leaseNoncurrent || 0) + (r.financeLease || 0) : null;
    r.capitalLeaseObligations = lease;
    // Arrendamientos a corto con la deuda a corto y el resto con la de largo (cuentan en liquidez y en Graham)
    if (r.leaseCurrent != null) r.shortTermDebt = (r.shortTermDebt || 0) + r.leaseCurrent;
    if (r.leaseNoncurrent != null || r.financeLease != null) r.longTermDebt = (r.longTermDebt || 0) + (r.leaseNoncurrent || 0) + (r.financeLease || 0);
    r.totalDebt = r.shortTermDebt == null && r.longTermDebt == null ? null : (r.shortTermDebt || 0) + (r.longTermDebt || 0);
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
