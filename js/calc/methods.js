// Métodos de inversión de autores reconocidos, aplicados con sus reglas publicadas.
// Cada método devuelve: nota 0-100, veredicto, comprobaciones (con el valor real de la empresa), precio de entrada,
// objetivo y regla de salida/stop SEGÚN EL MÉTODO. Donde el autor no fija un stop de precio, se dice así.
// Solo se usan datos reales del modelo de la empresa; si falta un dato, la comprobación queda «sin dato» (no cuenta como cumplida).
import { isNum, mean, stdev, median } from './finance.js?v=e06fb4a0';

const last = (a, n) => a.slice(Math.max(0, a.length - n));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lin = (x, x0, x1) => clamp((x - x0) / (x1 - x0), 0, 1); // 0..1
const C = (t, ok, v, rule) => ({ t, ok: ok == null ? null : !!ok, v, rule });
const pctS = (v, d = 1) => (isNum(v) ? (v * 100).toFixed(d).replace('.', ',') + ' %' : 'sin dato');
// Bancos, aseguradoras, brókeres, gestoras, inmobiliarias (REIT) y eléctricas: su balance no se lee igual (caja, deuda, circulante)
const FIN = /financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i;
const nS = (v, d = 1) => (isNum(v) ? v.toFixed(d).replace('.', ',') : 'sin dato');

/** Último valor disponible de una partida (si el último balance no ha llegado, el anterior) */
const lastVal = (m, k) => { const y = [...(m.years || [])].reverse().find((x) => isNum(x[k])); return y ? y[k] : null; };

function base(S) {
  const m = S.m, Y = m.years || [], s = (f) => Y.map((y) => y[f]);
  const sector = `${m.profile.sector || ''} ${m.profile.industry || ''}`;
  return { m, Y, s, sector, price: m.price, iv: S.val && S.val.composite ? S.val.composite.value : null, mos: S.val && S.val.composite ? S.val.composite.mos : null };
}

export const METHODS = {
  buffett: {
    name: 'Buffett · foso con cocodrilos',
    author: 'Warren Buffett (Berkshire Hathaway)',
    summary: 'Negocios con un «foso» ancho y duradero que protege rentabilidades altas, poca deuda, beneficios constantes y comprados con margen de seguridad. Para mantener muchos años.',
    rules: [
      'Rentabilidad del capital (ROIC; ROCE si el capital es negativo por recompras) ≥ 15 % en al menos el 80 % de los años disponibles (mín. 5).',
      'Poca o ninguna deuda: deuda neta ≤ 2 × EBITDA (o caja neta).',
      'Beneficio neto positivo todos los años y BPA creciendo en 5 años.',
      'Márgenes estables (señal de poder de precios): desviación del margen bruto ≤ 5 puntos en 10 años (operativo si no hay bruto).',
      'Genera caja: FCF positivo todos los años y FCF/beneficio medio ≥ 80 %.',
      'No diluye al accionista: acciones en circulación sin aumentar en 5 años.',
      'Precio: margen de seguridad ≥ 25 % frente al valor intrínseco central de la app.',
    ],
    exit: 'Buffett no usa stop de precio ni objetivo: su periodo favorito de tenencia es «para siempre». Se vende si se rompe el foso (rentabilidad del capital por debajo del coste de capital) o si la cotización se dispara muy por encima del valor intrínseco.',
    thresholdsNote: 'Los umbrales numéricos (15 %, 2×, 5 puntos, 80 %) son la forma en que la app convierte en números los criterios cualitativos de Buffett.',
    evaluate(S) {
      const { m, Y, s, iv, mos, price } = base(S);
      const rc = last(s('rc').filter(isNum), 10);
      const c1 = rc.length >= 5 ? rc.filter((v) => v >= 0.15).length / rc.length >= 0.8 : null;
      const nde = m.last.netDebtToEbitda, nd = lastVal(m, 'netDebt');
      // EBITDA negativo con deuda: suspenso claro, no «sin dato»
      const c2 = m.last.ebitdaNegWithDebt ? false : isNum(nd) && nd <= 0 ? true : isNum(nde) ? nde <= 2 && nde >= 0 : null;
      const ni = last(s('netIncome').filter(isNum), 10);
      const c3 = ni.length >= 5 ? ni.every((v) => v > 0) && isNum(m.growth.eps5) && m.growth.eps5 > 0 : null;
      const gm = last(s('grossMargin').filter(isNum), 10), om = last(s('operatingMargin').filter(isNum), 10);
      const mg = gm.length >= 5 ? gm : om; const sd = mg.length >= 5 ? stdev(mg) : null;
      const c4 = isNum(sd) ? sd <= 0.05 : null;
      const fcf = last(s('fcf').filter(isNum), 10), conv = last(s('fcfConversion').filter((v) => isNum(v) && Math.abs(v) < 5), 10);
      const c5 = fcf.length >= 5 ? fcf.every((v) => v > 0) && isNum(mean(conv)) && mean(conv) >= 0.8 : null;
      const c6 = isNum(m.growth.shares5) ? m.growth.shares5 <= 0.005 : null;
      const c7 = isNum(mos) ? mos >= 0.25 : null;
      const checks = [
        C('Rentabilidad del capital alta y sostenida', c1, rc.length ? `${rc.filter((v) => v >= 0.15).length} de ${rc.length} años ≥ 15 % (media ${pctS(mean(rc))})` : 'sin dato', this.rules[0]),
        C('Poca deuda', c2, m.last.ebitdaNegWithDebt ? 'EBITDA negativo con deuda' : isNum(nd) && nd <= 0 ? 'caja neta' : `deuda neta/EBITDA ${nS(nde)}×`, this.rules[1]),
        C('Beneficios constantes y crecientes', c3, ni.length ? `${ni.filter((v) => v > 0).length} de ${ni.length} años con beneficio · BPA 5a ${pctS(m.growth.eps5)}/año` : 'sin dato', this.rules[2]),
        C('Márgenes estables', c4, isNum(sd) ? `desviación ${nS(sd * 100)} puntos (${gm.length >= 5 ? 'bruto' : 'operativo'})` : 'sin dato', this.rules[3]),
        C('Genera caja', c5, fcf.length ? `${fcf.filter((v) => v > 0).length} de ${fcf.length} años con FCF positivo · conversión ${pctS(mean(conv), 0)}` : 'sin dato', this.rules[4]),
        C('No diluye', c6, `acciones ${pctS(m.growth.shares5)}/año en 5 años`, this.rules[5]),
        C('Margen de seguridad', c7, isNum(mos) ? `${pctS(mos)} (valor ${nS(iv, 2)} vs precio ${nS(price, 2)})` : 'sin valor intrínseco', this.rules[6]),
      ];
      const fin = FIN.test(base(S).sector);
      if (fin) checks.unshift(C('Sector analizable con estos criterios', false, `${base(S).sector.trim() || 'financiero'}: FCF, deuda neta/EBITDA y DCF no tienen sentido en bancos, aseguradoras, inmobiliarias o eléctricas`, 'Analízala en su ficha con ROE, solvencia regulatoria y valor contable.'));
      const W = [25, 15, 15, 15, 15, 15];
      const quality = [c1, c2, c3, c4, c5, c6].reduce((a, c, i) => a + (c ? W[i] : 0), 0);
      const priceSc = isNum(mos) ? lin(mos, -0.5, 0.35) * 100 : 0;
      const score = Math.round(0.7 * quality + 0.3 * priceSc);
      const qOk = c1 && [c2, c3, c4, c5, c6].filter(Boolean).length >= 4;
      const verdict = fin ? 'no' : qOk && c7 ? 'entra' : qOk ? 'vigilar' : 'no';
      return { score: fin ? Math.min(score, 40) : score, verdict, checks, entry: isNum(iv) ? iv * 0.75 : null, entryNote: 'valor intrínseco − 25 %', target: iv, targetNote: 'valor intrínseco (referencia; el método no vende por objetivo)', stop: null, stopNote: 'sin stop de precio: se vende si la tesis (el foso) se rompe', horizon: 'años (largo plazo)' };
    },
  },

  graham: {
    name: 'Graham · inversor defensivo',
    author: 'Benjamin Graham, «El inversor inteligente», cap. 14',
    summary: 'Los 7 criterios del inversor defensivo: empresas grandes, financieramente sólidas, con historial largo de beneficios y dividendos, a precio moderado.',
    rules: [
      'Tamaño adecuado: ventas ≥ 770 M USD (los 100 M$ de Graham, de 1972, ajustados por IPC).',
      'Solidez: activo corriente ≥ 2 × pasivo corriente y deuda a largo plazo ≤ capital circulante neto.',
      'Estabilidad: beneficio positivo en cada uno de los últimos 10 años.',
      'Dividendo ininterrumpido durante 20 años (se verifican los años que dan tus fuentes).',
      'Crecimiento: BPA medio de los 3 últimos años al menos un tercio mayor que el de hace 10 años.',
      'PER ≤ 15 sobre el beneficio medio de los 3 últimos años.',
      'Precio/valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5).',
    ],
    exit: 'Regla de venta de Graham (entrevistas de 1976): vender al ganar un 50 % o, si no se alcanza, al final del segundo año natural desde la compra, sea cual sea el precio. No usa stop de precio.',
    thresholdsNote: 'El ajuste del tamaño por inflación es un cálculo de la app (IPC EE. UU. 1972→2025 ≈ ×7,7).',
    evaluate(S) {
      const { m, Y, s, price } = base(S);
      const X = m.X;
      const rev = X(m.last.revenue);
      const usdR = m.tradeCur === 'USD' ? 1 : S.usdRate; // tipo a dólares (lo descarga Métodos)
      const usd = isNum(usdR);
      const g1 = isNum(rev) && usd ? rev * usdR >= 7.7e8 : null; // el umbral está en dólares
      const ca = lastVal(m, 'currentAssets'), cl = lastVal(m, 'currentLiabilities');
      const cr = isNum(ca) && isNum(cl) && cl > 0 ? ca / cl : null, wc = isNum(ca) && isNum(cl) ? ca - cl : null;
      const ltd = lastVal(m, 'longTermDebt');
      const g2 = isNum(cr) && isNum(wc) && isNum(ltd) ? cr >= 2 && ltd <= wc : isNum(cr) && cr < 2 ? false : null; // sin dato de deuda a largo no se aprueba
      const ni = last(s('netIncome').filter(isNum), 10);
      const g3 = ni.length >= 10 ? ni.every((v) => v > 0) : ni.length && ni.some((v) => v <= 0) ? false : null;
      const dpAll = last(Y.map((y) => y.dividendsPaid), 20); const dp = dpAll.filter((v) => v != null);
      // Un año sin la partida puede ser un año sin dividendo: no se da por pagado
      const g4 = dp.some((v) => !(v > 0)) ? false : dpAll.length >= 10 && dpAll.every((v) => v != null && v > 0) ? true : null;
      const eps = s('eps').filter(isNum); const w = last(eps, 10);
      const e3 = mean(last(eps, 3)), e0 = w.length >= 7 ? mean(w.slice(0, 3)) : null;
      const g5 = isNum(e3) && isNum(e0) && e0 > 0 ? e3 >= e0 * 1.33 : null;
      const eps3 = isNum(e3) ? X(e3) : null;
      const pe3 = isNum(eps3) && eps3 > 0 ? price / eps3 : null;
      const g6 = isNum(pe3) ? pe3 <= 15 : eps3 != null ? false : null;
      const eqL = lastVal(m, 'equity'); const bvps = isNum(eqL) && isNum(m.last.shares) && m.last.shares > 0 ? X(eqL) / m.last.shares : null;
      const pb = isNum(bvps) && bvps > 0 ? price / bvps : null;
      const g7 = isNum(pb) ? pb <= 1.5 || (isNum(pe3) && pe3 * pb <= 22.5) : null;
      const gnum = isNum(eps3) && eps3 > 0 && isNum(bvps) && bvps > 0 ? Math.sqrt(22.5 * eps3 * bvps) : null;
      const checks = [
        C('Tamaño adecuado', g1, `ventas ${isNum(rev) ? (rev / 1e9).toFixed(1).replace('.', ',') + ' mil M ' + m.tradeCur : 'sin dato'}${!usd ? ' (sin tipo de cambio a USD: no se puede comparar)' : m.tradeCur !== 'USD' ? ` ≈ ${(rev * usdR / 1e9).toFixed(1).replace('.', ',')} mil M USD` : ''}`, this.rules[0]),
        C('Situación financiera fuerte', g2, `liquidez ${nS(cr, 2)} · deuda LP ${isNum(ltd) && isNum(wc) ? (ltd <= wc ? '≤' : '>') + ' capital circulante' : 'sin dato'}`, this.rules[1]),
        C('Beneficios estables 10 años', g3, `${ni.filter((v) => v > 0).length} de ${ni.length} años con beneficio${ni.length < 10 ? ' (tus fuentes no dan 10 años)' : ''}`, this.rules[2]),
        C('Historial de dividendos', g4, `${dp.filter((v) => v > 0).length} de ${dpAll.length} años con dividendo informado${dpAll.length > dp.length ? ` (${dpAll.length - dp.length} sin dato)` : ''} · Graham pide 20`, this.rules[3]),
        C('Crecimiento del BPA ≥ 33 %', g5, isNum(e0) ? `BPA medio ${nS(e0, 2)} → ${nS(e3, 2)} (${pctS(e3 / e0 - 1, 0)})` : 'menos de 7 años de BPA', this.rules[4]),
        C('PER moderado', g6, `PER sobre BPA medio 3 años: ${nS(pe3)}`, this.rules[5]),
        C('Precio/valor contable moderado', g7, `P/VC ${nS(pb, 2)}${isNum(pe3) && isNum(pb) ? ` · PER×P/VC ${nS(pe3 * pb)}` : ''}`, this.rules[6]),
      ];
      const finG = FIN.test(base(S).sector);
      if (finG) checks.unshift(C('Sector analizable', false, 'financiera, inmobiliaria o eléctrica: el criterio de liquidez de Graham no aplica', 'Graham trataba aparte bancos y eléctricas.'));
      const passed = [g1, g2, g3, g4, g5, g6, g7].filter(Boolean).length;
      const score = finG ? Math.min(40, Math.round((passed / 7) * 100)) : Math.round((passed / 7) * 100);
      const verdict = finG ? 'no' : passed === 7 ? 'entra' : passed >= 5 && g6 !== false && g7 !== false ? 'vigilar' : 'no';
      return { score, verdict, checks, entry: gnum, entryNote: 'número de Graham √(22,5 × BPA × valor contable): precio máximo', target: isNum(gnum) ? Math.min(gnum, price) * 1.5 : null, targetNote: '+50 % sobre la compra', stop: null, stopNote: 'sin stop de precio: venta obligada al final del 2.º año natural', horizon: 'máx. 2 años' };
    },
  },

  greenblatt: {
    name: 'Greenblatt · fórmula mágica',
    author: 'Joel Greenblatt, «El pequeño libro que bate al mercado»',
    summary: 'Clasifica todas las empresas por dos números: rentabilidad del beneficio (EBIT / valor de empresa) y rendimiento del capital (EBIT / (capital circulante + activo fijo neto)). Compra las mejor clasificadas en conjunto.',
    rules: [
      'Excluye bancos, aseguradoras, brókeres, gestoras, inmobiliarias (REIT) y eléctricas (estructura financiera distinta).',
      'Rentabilidad del beneficio = EBIT / valor de empresa (más alta = más barata).',
      'Rendimiento del capital = EBIT / (capital circulante neto + activo fijo neto) (más alto = mejor negocio). Capital circulante sin caja ni deuda a corto.',
      'Se ordena por la suma de ambos puestos dentro del universo analizado; se compran las primeras (20-30 en cartera).',
    ],
    exit: 'Se mantiene cada posición un año y se vuelve a pasar la fórmula. No usa stop de precio ni objetivo.',
    thresholdsNote: 'La nota es relativa al universo que analizas: cambia si cambias la lista de empresas.',
    prepare(all) {
      const rows = all.map((r) => {
        const { m, sector } = base(r.S);
        const excluded = FIN.test(sector);
        const Y0 = m.T; // mismo periodo para los dos ratios (TTM si existe; si no, último ejercicio)
        const ebitR = Y0.ebit ?? m.last.ebit, ebit = m.X(ebitR);
        const ey = isNum(ebit) && isNum(m.ev) && m.ev > 0 ? ebit / m.ev : null;
        // Capital circulante operativo: sin la caja (no hace falta para operar) ni la deuda a corto (es financiación)
        const ca = Y0.currentAssets ?? m.last.currentAssets, cl = Y0.currentLiabilities ?? m.last.currentLiabilities;
        const cash = Y0.cash ?? m.last.cash ?? 0, std = Y0.shortTermDebt ?? m.last.shortTermDebt ?? 0;
        const wc = isNum(ca) && isNum(cl) ? (ca - cash) - (cl - std) : null;
        const ppe = Y0.ppe ?? m.last.ppe;
        const cap = isNum(wc) && isNum(ppe) ? Math.max(0, wc) + ppe : null;
        const roc = isNum(ebitR) && isNum(cap) && cap > 0 ? ebitR / cap : null;
        return { r, excluded, ey, roc, wc, ppe };
      });
      const ok = rows.filter((x) => !x.excluded && isNum(x.ey) && isNum(x.roc));
      const rk = (k) => { const s = [...ok].sort((a, b) => b[k] - a[k]); s.forEach((x, i) => (x['rank_' + k] = i + 1)); };
      rk('ey'); rk('roc');
      ok.forEach((x) => (x.sum = x.rank_ey + x.rank_roc));
      const sorted = [...ok].sort((a, b) => a.sum - b.sum); sorted.forEach((x, i) => (x.pos = i + 1));
      for (const x of rows) x.r._gb = { ...x, n: ok.length };
    },
    evaluate(S, r) {
      const g = r._gb || {}; const { m } = base(S); const rf = m.market.rf10;
      const checks = [
        C('Sector admitido', !g.excluded, g.excluded ? 'financiera o eléctrica: excluida' : 'sí', this.rules[0]),
        C('Rentabilidad del beneficio', isNum(g.ey) ? g.ey > (rf || 0.04) : null, isNum(g.ey) ? `${pctS(g.ey)} (puesto ${g.rank_ey || '—'} de ${g.n}) · bono 10a ${pctS(rf)}` : 'sin dato', this.rules[1]),
        C('Rendimiento del capital', isNum(g.roc) ? g.roc >= 0.25 : null, isNum(g.roc) ? `${pctS(g.roc, 0)} (puesto ${g.rank_roc || '—'} de ${g.n})` : 'sin dato (falta activo fijo o capital circulante)', this.rules[2]),
        C('Clasificación conjunta', isNum(g.pos) ? g.pos <= Math.max(1, Math.ceil(g.n * 0.3)) : null, isNum(g.pos) ? `puesto ${g.pos} de ${g.n}` : 'no clasificada', this.rules[3]),
      ];
      const score = isNum(g.pos) ? (g.n > 1 ? Math.round(100 * (1 - (g.pos - 1) / (g.n - 1))) : 100) : 0;
      const verdict = !g.excluded && isNum(g.pos) && g.pos <= Math.max(1, Math.ceil(g.n * 0.3)) && checks[1].ok ? 'entra' : isNum(g.pos) && g.pos <= Math.ceil(g.n * 0.5) ? 'vigilar' : 'no';
      return { score, verdict, checks, entry: verdict === 'entra' ? m.price : null, entryNote: 'precio actual (método de clasificación, no de precio objetivo)', target: null, targetNote: 'sin objetivo: se revisa a los 12 meses', stop: null, stopNote: 'sin stop de precio', horizon: '12 meses y rotar' };
    },
  },

  lynch: {
    name: 'Lynch · crecimiento a precio razonable (PEGY)',
    author: 'Peter Lynch, «Un paso por delante de Wall Street»',
    summary: 'Una empresa a precio justo tiene un PER igual a su crecimiento. Lynch suma la rentabilidad por dividendo al crecimiento: PER / (crecimiento del BPA + dividendo).',
    rules: [
      'PEGY = PER / (crecimiento anual del BPA en 5 años % + rentabilidad por dividendo %), con la suma limitada a 30 para no premiar rebotes puntuales.',
      'PEGY ≤ 0,5 muy atractivo · ≤ 1 razonable · > 1 caro.',
      'Solo aplicable con beneficio y crecimiento positivos.',
      'Precio justo = BPA × (crecimiento % + dividendo %), es decir, el precio con PEGY = 1.',
    ],
    exit: 'Lynch vende cuando cambia la «historia» de la empresa (el motivo de compra deja de cumplirse) o cuando el PER se dispara muy por encima del crecimiento. No usa stop de precio.',
    thresholdsNote: 'Se usa el crecimiento histórico del BPA a 5 años; Lynch también usaba previsiones, que la app no inventa.',
    evaluate(S) {
      const { m, price } = base(S);
      const eps = m.X(m.T.eps ?? m.last.eps), pe = isNum(eps) && eps > 0 ? price / eps : null;
      const g = m.growth.eps5;
      const dy0 = isNum(m.rTTM && m.rTTM.dividendYieldTTM) ? m.rTTM.dividendYieldTTM : isNum(m.dpsTTM) && price ? m.dpsTTM / price : 0;
      const dy = isNum(dy0) && dy0 >= 0 && dy0 < 0.25 ? dy0 : 0; // > 25 % = dato sin ajustar a splits: no se suma
      const gy = isNum(g) ? (g + (dy || 0)) * 100 : null;
      const okG = isNum(pe) && isNum(g) && g > 0;
      const gyC = isNum(gy) ? Math.min(gy, 30) : null; // mismo tope (30) para el PEGY y el precio justo: coherentes entre sí
      const pegy = okG && gyC > 0 ? pe / gyC : null;
      const fair = okG && gyC > 0 ? eps * gyC : null;
      const checks = [
        C('Beneficio y crecimiento positivos', isNum(pe) && isNum(g) && g > 0, `PER ${nS(pe)} · BPA 5a ${pctS(g)}/año · dividendo ${pctS(dy, 2)}`, this.rules[2]),
        C('PEGY ≤ 1', isNum(pegy) ? pegy <= 1 : null, `PEGY ${nS(pegy, 2)}`, this.rules[1]),
        C('PEGY ≤ 0,5 (muy atractivo)', isNum(pegy) ? pegy <= 0.5 : null, `PEGY ${nS(pegy, 2)}`, this.rules[1]),
      ];
      if (FIN.test(base(S).sector)) checks.push(C('Aviso de sector', null, 'financiera o inmobiliaria: el BPA puede ser muy volátil', 'Compruébala en su ficha.'));
      const score = isNum(pegy) ? Math.round(pegy <= 0.5 ? 100 : pegy <= 1 ? 100 - (pegy - 0.5) * 80 : Math.max(0, 60 - (pegy - 1) * 60)) : 0;
      const verdict = !okG ? 'no' : pegy <= 1 ? 'entra' : pegy <= 1.5 ? 'vigilar' : 'no';
      return { score, verdict, checks, entry: fair, entryNote: 'precio con PEGY = 1 (crecimiento limitado al 30 %)', target: fair, targetNote: 'precio justo (PEGY = 1)', stop: null, stopNote: 'sin stop de precio: se vende si cambia la historia', horizon: '1-5 años' };
    },
  },

  piotroski: {
    name: 'Piotroski · F-Score en empresas baratas',
    author: 'Joseph Piotroski (2000), Journal of Accounting Research',
    summary: 'Entre el 20 % de empresas más baratas por valor contable, compra las de mejor salud financiera (F-Score 8-9 sobre 9).',
    rules: [
      'Universo: el 20 % con menor precio/valor contable de las empresas analizadas.',
      'F-Score de 9 pruebas: rentabilidad (4), deuda y liquidez (3) y eficiencia (2).',
      'Compra: F-Score 8 o 9.',
    ],
    exit: 'En el estudio se mantiene cada posición 12 meses y se rehace la selección. No usa stop de precio.',
    thresholdsNote: 'El 20 % se calcula sobre el universo que analizas en la app, no sobre todo el mercado.',
    prepare(all) {
      // Bancos y aseguradoras cotizan siempre a P/VC bajo: no compiten por el 20 % barato con el resto
      const v = all.map((r) => { const { m, sector } = base(r.S); const eq = lastVal(m, 'equity'); const bv = isNum(eq) && eq > 0 ? m.X(eq) : null; return { r, pb: !FIN.test(sector) && isNum(bv) && isNum(m.marketCap) ? m.marketCap / bv : null, fin: FIN.test(sector) }; });
      const ok = v.filter((x) => isNum(x.pb)).sort((a, b) => a.pb - b.pb);
      const cut = Math.max(1, Math.ceil(ok.length * 0.2));
      ok.forEach((x, i) => (x.r._pi = { pb: x.pb, cheap: i < cut, pos: i + 1, n: ok.length }));
      v.filter((x) => !isNum(x.pb)).forEach((x) => (x.r._pi = { pb: null, cheap: false, n: ok.length }));
    },
    evaluate(S, r) {
      const { m } = base(S); const p = r._pi || {}; const f = m.scores.piotroskiScore;
      const checks = [
        C('Entre el 20 % más barato (P/VC)', p.cheap, isNum(p.pb) ? `P/VC ${nS(p.pb, 2)} (puesto ${p.pos} de ${p.n})` : FIN.test(base(S).sector) ? 'financiera: se compara aparte' : 'sin valor contable positivo', this.rules[0]),
        C('F-Score ≥ 8', isNum(f) ? f >= 8 : null, isNum(f) ? `${f}/9` : 'sin dato', this.rules[2]),
      ];
      if (FIN.test(base(S).sector)) checks.push(C('Aviso de sector', null, 'financiera o inmobiliaria: varias pruebas del F-Score (liquidez, margen bruto) no se leen igual', 'Compruébala en su ficha.'));
      const score = isNum(f) ? Math.round((f / 9) * (p.cheap ? 100 : 60)) : 0;
      const verdict = p.cheap && f >= 8 ? 'entra' : f >= 8 || (p.cheap && f >= 6) ? 'vigilar' : 'no';
      return { score, verdict, checks, entry: verdict === 'entra' ? m.price : null, entryNote: 'precio actual (método de selección)', target: null, targetNote: 'sin objetivo: se revisa a los 12 meses', stop: null, stopNote: 'sin stop de precio', horizon: '12 meses y rotar' };
    },
  },
};

/** Evalúa un método sobre todas las empresas analizadas y devuelve la lista ordenada por nota. */
export function rankMethod(id, results) {
  const M = METHODS[id];
  const ok = results.filter((r) => r.S && r.S.m);
  if (M.prepare) M.prepare(ok);
  const order = { entra: 0, vigilar: 1, no: 2 };
  return ok.map((r) => ({ r, res: M.evaluate(r.S, r) })).sort((a, b) => order[a.res.verdict] - order[b.res.verdict] || b.res.score - a.res.score);
}

export { median };
