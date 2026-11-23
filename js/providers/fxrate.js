// Tipo de cambio de la moneda de los estados financieros a la de cotización.
// Maneja subunidades: peniques británicos (GBp/GBX), agorot israelíes (ILA) y céntimos sudafricanos (ZAc): 1 GBP = 100 GBp.
import { data } from './index.js?v=171d25de';

const SUB = { GBp: ['GBP', 100], GBX: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100] };
const norm = (c) => SUB[c] || [c, 1];

/** Devuelve { rate, res } con rate = unidades de cotización por 1 unidad de reporte, o { rate: null, error }. */
export async function fxRate(rep, trade) {
  if (!rep || !trade || rep === trade) return { rate: 1 };
  const [rb, rm] = norm(rep), [tb, tm] = norm(trade);
  if (rb === tb) return { rate: tm / rm, res: { ok: true, data: { price: tm / rm }, source: 'subunidad de la misma moneda', endpoint: '', fetchedAt: Date.now() } };
  try {
    const f = await data.fx(`${rb}${tb}`);
    const p = f.data && f.data.price;
    if (!(p > 0)) return { rate: null, error: { code: 'not_found', message: 'tipo de cambio no disponible' } };
    return { rate: (p * tm) / rm, res: { ok: true, ...f } };
  } catch (e) { return { rate: null, error: e }; }
}
