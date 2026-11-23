// ROIC.AI API v2 (gratis: 5 peticiones/minuto, cobertura mundial, 2 años de estados anuales).
// Respaldo para empresas fuera de EE. UU. Acepta ticker o ISIN como identificador.
import { getJSON } from './http.js?v=5b306087';
import { config } from '../config.js?v=5b306087';
import { hint } from './hints.js?v=5b306087';

const H = () => config.get().cacheHours;
const n = (v) => (v == null || v === '' ? null : Number(v));
const id = (s) => { const h = hint(s); return (h && h.isin) || s; };
const arr = (b) => (Array.isArray(b) ? b : b && Array.isArray(b.data) ? b.data : []);
const q = (path, params, ttl) => getJSON('roic', path, params, ttl, (b) => arr(b).length > 0 || (b && b.symbol));

const pickDate = (r) => r.date || r.period_end_date;
const pickFY = (r) => String(r.fiscal_year || pickDate(r).slice(0, 4));

export const roic = {
  id: 'roic', name: 'ROIC.AI',
  async search(query) {
    const r = await q('tickers/search', { query, limit: 10 }, H().static);
    return { ...r, data: arr(r.data).filter((x) => !x.type || /Common|ADR|Depositary/i.test(x.type)).map((x) => ({ symbol: x.symbol, name: x.name, exchange: x.exchange, exchangeFullName: x.exchange_name, _source: 'ROIC.AI' })) };
  },
  async profile(s) {
    const r = await q(`company/profile/${encodeURIComponent(id(s))}`, {}, H().fundamentals);
    const p = Array.isArray(r.data) ? r.data[0] : r.data;
    return { ...r, data: { symbol: s, companyName: p.name, exchange: p.exchange, sector: p.sector, industry: p.industry, description: p.description, ceo: p.ceo, fullTimeEmployees: p.employees, ipoDate: p.ipo_date, website: p.website, country: p.country, currency: p.currency, _source: 'ROIC.AI' } };
  },
  async pricesDaily(s, from) {
    const r = await q(`stock-prices/${encodeURIComponent(id(s))}`, { limit: 5000, date_start: from && from > '1990' ? from : undefined, order: 'ASC' }, H().prices);
    return { ...r, data: arr(r.data).map((p) => ({ date: p.date, open: n(p.open), high: n(p.high), low: n(p.low), close: n(p.close), volume: n(p.volume) })).sort((a, b) => a.date.localeCompare(b.date)) };
  },
  async quote(s) {
    const r = await q(`stock-prices/latest/${encodeURIComponent(id(s))}`, {}, H().quote);
    const p = arr(r.data)[0] || r.data;
    return { ...r, data: { symbol: s, price: n(p.close), change: n(p.change), changePercentage: n(p.change_percent), volume: n(p.volume) } };
  },
  async income(s) {
    const r = await q(`fundamental/income-statement/${encodeURIComponent(id(s))}`, { period: 'annual', limit: 10 }, H().fundamentals);
    return { ...r, data: arr(r.data).map((x) => ({
      date: pickDate(x), symbol: s, fiscalYear: pickFY(x), period: 'FY', reportedCurrency: x.currency,
      revenue: n(x.is_sales_revenue_turnover ?? x.is_sales_and_services_revenues), costOfRevenue: n(x.is_cogs ?? x.is_cog_and_services_sold), grossProfit: n(x.is_gross_profit),
      operatingExpenses: n(x.is_operating_expn), sellingGeneralAndAdministrativeExpenses: n(x.is_sg_and_a_expense), researchAndDevelopmentExpenses: n(x.is_operating_expenses_r_and_d),
      operatingIncome: n(x.is_oper_income), ebit: n(x.ebit ?? x.is_oper_income), ebitda: n(x.ebitda), interestExpense: x.is_int_expense != null ? Math.abs(n(x.is_int_expense)) : null,
      incomeBeforeTax: n(x.is_pretax_income), incomeTaxExpense: n(x.is_inc_tax_exp), netIncome: n(x.is_net_income), eps: n(x.eps), epsDiluted: n(x.diluted_eps),
      weightedAverageShsOut: n(x.is_avg_num_sh_for_eps), weightedAverageShsOutDil: n(x.is_sh_for_diluted_eps), depreciationAndAmortization: n(x.is_depr_exp), _source: 'ROIC.AI',
    })) };
  },
  async balance(s) {
    const r = await q(`fundamental/balance-sheet/${encodeURIComponent(id(s))}`, { period: 'annual', limit: 10 }, H().fundamentals);
    return { ...r, data: arr(r.data).map((x) => {
      const std = n(x.bs_st_borrow), ltd = n(x.bs_lt_borrow), cash = n(x.bs_cash_near_cash_item), sti = n(x.bs_mkt_sec_other_st_invest);
      return { date: pickDate(x), symbol: s, fiscalYear: pickFY(x), period: 'FY', reportedCurrency: x.currency,
        cashAndCashEquivalents: cash, shortTermInvestments: sti, cashAndShortTermInvestments: n(x.bs_c_and_ce_and_sti_detailed) ?? (cash != null ? cash + (sti || 0) : null),
        netReceivables: n(x.bs_acct_note_rcv), inventory: n(x.bs_inventories), totalCurrentAssets: n(x.bs_cur_asset_report), propertyPlantEquipmentNet: n(x.bs_net_fix_asset),
        goodwill: n(x.bs_goodwill), intangibleAssets: n(x.bs_other_intangible_assets_detailed ?? x.bs_disclosed_intangibles), longTermInvestments: n(x.bs_lt_invest ?? x.bs_long_term_investments),
        totalNonCurrentAssets: n(x.bs_tot_non_cur_asset), totalAssets: n(x.bs_tot_asset), totalCurrentLiabilities: n(x.bs_cur_liab), shortTermDebt: std, longTermDebt: ltd,
        totalLiabilities: n(x.bs_tot_liab), totalStockholdersEquity: n(x.bs_eqty_bef_minority_int_detailed ?? x.bs_total_equity),
        totalDebt: std == null && ltd == null ? null : (std || 0) + (ltd || 0), retainedEarnings: n(x.bs_pure_retained_earnings), netDebt: n(x.net_debt), commonStockSharesOutstanding: n(x.bs_sh_out), _source: 'ROIC.AI' };
    }) };
  },
  async cashflow(s) {
    const r = await q(`fundamental/cash-flow/${encodeURIComponent(id(s))}`, { period: 'annual', limit: 10 }, H().fundamentals);
    return { ...r, data: arr(r.data).map((x) => ({
      date: pickDate(x), symbol: s, fiscalYear: pickFY(x), period: 'FY', reportedCurrency: x.currency,
      operatingCashFlow: n(x.cf_cash_from_oper), netCashProvidedByOperatingActivities: n(x.cf_cash_from_oper), netCashProvidedByInvestingActivities: n(x.cf_cash_from_inv_act),
      netCashProvidedByFinancingActivities: n(x.cf_cash_from_fin_act), capitalExpenditure: x.cf_cap_expenditures != null ? -Math.abs(n(x.cf_cap_expenditures)) : null,
      freeCashFlow: n(x.cf_free_cash_flow), commonDividendsPaid: n(x.cf_dvd_paid), commonStockRepurchased: n(x.cf_decr_cap_stock ?? x.cf_proc_fr_repurch_eqty_detailed),
      stockBasedCompensation: n(x.cf_stock_based_compensation), depreciationAndAmortization: n(x.cf_depr_amort), netIncome: n(x.cf_net_inc), _source: 'ROIC.AI',
    })) };
  },
};
