// Tras completar una fila de balance con partidas de otra fuente, los totales que calculamos NOSOTROS (deuda total con
// la parte a corto supuesta en 0, caja + inversiones, deuda neta) se recalculan con las partidas nuevas: si no,
// quedarían congelados con lo que faltaba. Los totales publicados por la fuente base no se tocan.
const n = (v) => typeof v === 'number' && Number.isFinite(v);
const FIELDS = ['shortTermDebt', 'longTermDebt', 'cashAndCashEquivalents', 'shortTermInvestments', 'cashAndShortTermInvestments'];
export function reconcileBalance(row, filled, derivedNet) {
  if (!filled.some((k) => FIELDS.includes(k))) return row;
  if (filled.includes('shortTermInvestments') && !n(row.cashAndShortTermInvestments) && n(row.cashAndCashEquivalents) && n(row.shortTermInvestments)) row.cashAndShortTermInvestments = row.cashAndCashEquivalents + row.shortTermInvestments;
  if (row.debtShortTermAssumedZero && n(row.shortTermDebt) && n(row.longTermDebt)) { row.totalDebt = row.shortTermDebt + row.longTermDebt; row.debtShortTermAssumedZero = false; }
  else if (!n(row.totalDebt) && n(row.shortTermDebt) && n(row.longTermDebt)) row.totalDebt = row.shortTermDebt + row.longTermDebt;
  if (derivedNet || !n(row.netDebt)) { const c = n(row.cashAndShortTermInvestments) ? row.cashAndShortTermInvestments : row.cashAndCashEquivalents; row.netDebt = n(row.totalDebt) && n(c) ? row.totalDebt - c : null; }
  return row;
}
