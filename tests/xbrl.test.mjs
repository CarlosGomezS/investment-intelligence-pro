// Normalización de hechos XBRL (SEC US-GAAP y ESEF IFRS) al modelo canónico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toStatements } from '../js/providers/xbrl.js';

test('SEC US-GAAP: años, cambio de concepto, flujos anuales y balance', () => {
  const F = [
    // 2023 con concepto antiguo, 2024 con el nuevo: debe rellenar ambos años
    { concept: 'us-gaap:Revenues', start: '2023-01-01', end: '2023-12-31', val: 900, unit: 'USD', filed: '2024-02-01' },
    { concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-01-01', end: '2024-12-31', val: 1000, unit: 'USD', filed: '2025-02-01' },
    // un trimestre no debe colarse como año
    { concept: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', start: '2024-10-01', end: '2024-12-31', val: 260, unit: 'USD', filed: '2025-02-01' },
    // reexpresión posterior gana
    { concept: 'us-gaap:NetIncomeLoss', start: '2024-01-01', end: '2024-12-31', val: 100, unit: 'USD', filed: '2025-02-01' },
    { concept: 'us-gaap:NetIncomeLoss', start: '2024-01-01', end: '2024-12-31', val: 110, unit: 'USD', filed: '2026-02-01' },
    { concept: 'us-gaap:OperatingIncomeLoss', start: '2024-01-01', end: '2024-12-31', val: 150, unit: 'USD' },
    { concept: 'us-gaap:DepreciationDepletionAndAmortization', start: '2024-01-01', end: '2024-12-31', val: 30, unit: 'USD' },
    { concept: 'us-gaap:EarningsPerShareDiluted', start: '2024-01-01', end: '2024-12-31', val: 1.1, unit: 'USD/shares' },
    { concept: 'us-gaap:Assets', end: '2024-12-31', val: 2000, unit: 'USD' },
    { concept: 'us-gaap:CashAndCashEquivalentsAtCarryingValue', end: '2024-12-31', val: 50, unit: 'USD' },
    { concept: 'us-gaap:LongTermDebtNoncurrent', end: '2024-12-31', val: 300, unit: 'USD' },
    { concept: 'us-gaap:LongTermDebtCurrent', end: '2024-12-31', val: 20, unit: 'USD' },
    { concept: 'us-gaap:NetCashProvidedByUsedInOperatingActivities', start: '2024-01-01', end: '2024-12-31', val: 180, unit: 'USD' },
    { concept: 'us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', start: '2024-01-01', end: '2024-12-31', val: 40, unit: 'USD' },
    { concept: 'us-gaap:PaymentsOfDividends', start: '2024-01-01', end: '2024-12-31', val: 25, unit: 'USD' },
  ];
  const { income, balance, cashflow } = toStatements(F, 'TEST');
  assert.equal(income.length, 2);
  assert.equal(income[0].fiscalYear, '2024');
  assert.equal(income[0].revenue, 1000);
  assert.equal(income[1].revenue, 900);
  assert.equal(income[0].netIncome, 110);
  assert.equal(income[0].ebitda, 180);
  assert.equal(income[0].epsDiluted, 1.1);
  assert.equal(income[0].reportedCurrency, 'USD');
  assert.equal(balance[0].totalDebt, 320);
  assert.equal(balance[0].netDebt, 270);
  assert.equal(cashflow[0].freeCashFlow, 140);
  assert.equal(cashflow[0].capitalExpenditure, -40);
  assert.equal(cashflow[0].commonDividendsPaid, -25);
});

test('ESEF IFRS en euros', () => {
  const F = [
    { concept: 'ifrs-full:Revenue', start: '2025-02-01', end: '2026-01-31', val: '38000', unit: 'iso4217:EUR' },
    { concept: 'ifrs-full:ProfitLossAttributableToOwnersOfParent', start: '2025-02-01', end: '2026-01-31', val: '6000', unit: 'iso4217:EUR' },
    { concept: 'ifrs-full:Assets', end: '2026-01-31', val: '40000', unit: 'iso4217:EUR' },
    { concept: 'ifrs-full:CashFlowsFromUsedInOperatingActivities', start: '2025-02-01', end: '2026-01-31', val: '9000', unit: 'iso4217:EUR' },
    { concept: 'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', start: '2025-02-01', end: '2026-01-31', val: '-2000', unit: 'iso4217:EUR' },
  ];
  const { income, balance, cashflow } = toStatements(F, 'ITX.MC');
  assert.equal(income[0].revenue, 38000);
  assert.equal(income[0].reportedCurrency, 'EUR');
  assert.equal(income[0].fiscalYear, '2026');
  assert.equal(balance[0].totalAssets, 40000);
  assert.equal(cashflow[0].freeCashFlow, 7000);
});
