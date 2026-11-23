// Alligator de Bill Williams y fractales, sobre velas diarias. Indicador técnico: no tiene relación con el
// «cocodrilo paciente» de Buffett (método fundamental en methods.js).
// Definición estándar (MetaTrader, StockCharts, Barchart):
//   precio mediano = (máximo + mínimo) / 2
//   Mandíbula = SMMA(13) desplazada 8 velas · Dientes = SMMA(8) desplazada 5 · Labios = SMMA(5) desplazada 3
//   Fractal inferior: vela cuyo mínimo es menor que el de las dos anteriores y las dos siguientes (superior: al revés).
// Uso de Williams: solo se opera cuando el cocodrilo «come» (líneas separadas y ordenadas); entrada al romper el
// fractal por encima de los dientes, stop tras el fractal contrario y salida cuando las líneas vuelven a juntarse.
import { isNum } from './finance.js?v=f2479787';

export function smma(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  let s = 0; for (let i = 0; i < n; i++) s += values[i];
  out[n - 1] = s / n;
  for (let i = n; i < values.length; i++) out[i] = (out[i - 1] * (n - 1) + values[i]) / n;
  return out;
}

export function fractals(bars) {
  const up = [], down = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const h = bars[i].high, l = bars[i].low;
    if ([-2, -1, 1, 2].every((k) => h > bars[i + k].high)) up.push({ i, date: bars[i].date, price: h });
    if ([-2, -1, 1, 2].every((k) => l < bars[i + k].low)) down.push({ i, date: bars[i].date, price: l });
  }
  return { up, down };
}

/** Estado del cocodrilo en la última vela y niveles técnicos de entrada y stop. bars: [{date, high, low, close}] ascendente. */
export function alligator(rows) {
  const bars = [...(rows || [])].filter((b) => isNum(b.close)).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-300).map((b) => ({ date: b.date, close: b.close, high: isNum(b.high) ? b.high : b.close, low: isNum(b.low) ? b.low : b.close }));
  if (bars.length < 40) return null;
  const med = bars.map((b) => (b.high + b.low) / 2);
  const J = smma(med, 13), T = smma(med, 8), L = smma(med, 5);
  const n = bars.length - 1;
  const jaw = J[n - 8], teeth = T[n - 5], lips = L[n - 3];
  if (![jaw, teeth, lips].every(isNum)) return null;
  const close = bars[n].close;
  const spread = (Math.max(jaw, teeth, lips) - Math.min(jaw, teeth, lips)) / close;
  let state;
  if (lips > teeth && teeth > jaw && spread > 0.005) state = close > lips ? 'come al alza' : 'al alza, precio retrocede';
  else if (lips < teeth && teeth < jaw && spread > 0.005) state = 'come a la baja';
  else state = 'dormido';
  const { up, down } = fractals(bars);
  const lastUp = up.length && up[up.length - 1].i >= n - 63 ? up[up.length - 1] : null; // misma antigüedad máxima que el stop (3 meses)
  // Stop: el fractal inferior más reciente bajo el precio, solo de los últimos 3 meses (un soporte de hace un año no sirve)
  const lastDown = [...down].reverse().find((f) => f.price < close && f.i >= n - 63) || null;
  // Entrada de Williams: rotura del último fractal superior, solo con el cocodrilo comiendo al alza y si aún no se ha roto
  const entry = state.startsWith('come al alza') || state.startsWith('al alza') ? (lastUp && lastUp.price > teeth && lastUp.price > close ? lastUp.price : null) : null;
  return { state, jaw, teeth, lips, close, date: bars[n].date, entry, entryDate: lastUp ? lastUp.date : null, stop: lastDown ? lastDown.price : null, stopDate: lastDown ? lastDown.date : null, spread };
}
