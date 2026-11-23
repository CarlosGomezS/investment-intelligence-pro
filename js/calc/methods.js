// Métodos de inversión de autores reconocidos, aplicados con sus reglas publicadas.
// Cada método devuelve: nota 0-100, veredicto, comprobaciones (con el valor real de la empresa), precio de entrada,
// objetivo y regla de salida/stop SEGÚN EL MÉTODO. Donde el autor no fija un stop de precio, se dice así.
// Solo se usan datos reales del modelo de la empresa; si falta un dato, la comprobación queda «sin dato» (no cuenta como cumplida).
import { isNum, mean, stdev, median, cagrN } from './finance.js?v=1369edf7';

const last = (a, n) => a.slice(Math.max(0, a.length - n));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lin = (x, x0, x1) => clamp((x - x0) / (x1 - x0), 0, 1); // 0..1
const C = (t, ok, v, rule) => ({ t, ok: ok == null ? null : !!ok, v, rule });
const pctS = (v, d = 1) => (isNum(v) ? (v * 100).toFixed(d).replace('.', ',') + ' %' : 'sin dato');
// Bancos, aseguradoras, brókeres, gestoras, inmobiliarias (REIT) y eléctricas: su balance no se lee igual (caja, deuda, circulante)
const GB_MIN = 20; // empresas clasificadas mínimas para que el ranking de Greenblatt signifique algo
const PIO_MIN = 20; // empresas comparables mínimas para que el quintil barato de Piotroski signifique algo
const FIN = /financ|bank|banco|insur|asegur|capital market|broker|asset manag|real estate|reit|inmobil|utilit|eléctric/i;
const nS = (v, d = 1) => (isNum(v) ? v.toFixed(d).replace('.', ',') : 'sin dato');

/** Último valor disponible de una partida (si el último balance no ha llegado, el anterior) */
const cagrOf = (arr, n) => cagrN(arr, n);
/** Respuestas del usuario a los criterios que no se pueden medir con datos (por empresa, en este navegador). */
const MK = 'iip.methods.manual.v1';
export const manualStore = {
  all() { try { return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(MK)) || '{}'); } catch { return {}; } },
  get(sym) { return this.all()[sym] || {}; },
  set(sym, k, v) { const a = this.all(); a[sym] = { ...(a[sym] || {}), [k]: v }; if (v == null) delete a[sym][k]; try { localStorage.setItem(MK, JSON.stringify(a)); } catch {} },
};
const lastVal = (m, k) => { const y = [...(m.years || [])].reverse().find((x) => isNum(x[k])); return y ? y[k] : null; };

function base(S) {
  const m = S.m, Y = m.years || [], s = (f) => Y.map((y) => y[f]);
  const sector = `${m.profile.sector || ''} ${m.profile.industry || ''}`;
  return { m, Y, s, sector, price: m.price, iv: S.val && S.val.composite ? S.val.composite.value : null, mos: S.val && S.val.composite ? S.val.composite.mos : null };
}

export const METHODS = {
  buffett: {
    name: 'Buffett · foso duradero',
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
    thresholdsNote: 'Los umbrales numéricos (15 %, 2×, 5 puntos, 80 %) son la forma en que la app convierte en números los criterios cualitativos de Buffett. El foso en sí (de dónde viene la ventaja) lo confirmas tú en el detalle.',
    manual: [{ key: 'foso', label: 'Sé de dónde viene su ventaja competitiva (marca, escala, red, costes de cambio…) y no se está erosionando' }],
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
      // El margen de seguridad solo cuenta si la valoración es fiable (alta o media); si no, «sin dato»
      const rel = S.val && S.val.reliability ? S.val.reliability.level : null;
      const c7 = isNum(mos) && !['baja', 'muy baja', 'no valorable'].includes(rel) ? mos >= 0.25 : null;
      const checks = [
        C('Rentabilidad del capital alta y sostenida', c1, rc.length ? `${rc.filter((v) => v >= 0.15).length} de ${rc.length} años ≥ 15 % (media ${pctS(mean(rc))})` : 'sin dato', this.rules[0]),
        C('Poca deuda', c2, m.last.ebitdaNegWithDebt ? 'EBITDA negativo con deuda' : isNum(nd) && nd <= 0 ? 'caja neta' : `deuda neta/EBITDA ${nS(nde)}×`, this.rules[1]),
        C('Beneficios constantes y crecientes', c3, ni.length ? `${ni.filter((v) => v > 0).length} de ${ni.length} años con beneficio · BPA 5a ${pctS(m.growth.eps5)}/año` : 'sin dato', this.rules[2]),
        C('Márgenes estables', c4, isNum(sd) ? `desviación ${nS(sd * 100)} puntos (${gm.length >= 5 ? 'bruto' : 'operativo'})` : 'sin dato', this.rules[3]),
        C('Genera caja', c5, fcf.length ? `${fcf.filter((v) => v > 0).length} de ${fcf.length} años con FCF positivo · conversión ${pctS(mean(conv), 0)}` : 'sin dato', this.rules[4]),
        C('No diluye', c6, `acciones ${pctS(m.growth.shares5)}/año en 5 años`, this.rules[5]),
        C('Margen de seguridad', c7, isNum(mos) ? `${pctS(mos)} (valor ${nS(iv, 2)} vs precio ${nS(price, 2)})${rel ? ` · fiabilidad de la valoración: ${rel}` : ''}` : 'sin valor intrínseco', this.rules[6]),
      ];
      const fin = FIN.test(base(S).sector);
      // Los números muestran las huellas de un foso, no el foso: de dónde viene la ventaja lo juzga el usuario
      const uF = manualStore.get(m.symbol).foso;
      checks.push(C('Tú: sabes de dónde viene su ventaja y no se erosiona', uF ?? null, uF == null ? 'pendiente: márcalo en el detalle' : uF ? 'confirmado por ti' : 'has indicado que no', 'Marca, escala, efecto red, costes de cambio o licencias que los rivales no puedan copiar en años. Rentabilidades altas unos años no bastan.'));
      if (fin) checks.unshift(C('Sector analizable con estos criterios', false, `${base(S).sector.trim() || 'financiero'}: FCF, deuda neta/EBITDA y DCF no tienen sentido en bancos, aseguradoras, inmobiliarias o eléctricas`, 'Analízala en su ficha con ROE, solvencia regulatoria y valor contable.'));
      const W = [25, 15, 15, 15, 15, 15];
      const quality = [c1, c2, c3, c4, c5, c6].reduce((a, c, i) => a + (c ? W[i] : 0), 0);
      const priceSc = isNum(mos) && c7 !== null ? lin(mos, -0.5, 0.35) * 100 : 0; // con valoración poco fiable el precio no suma
      const score = Math.round(0.7 * quality + 0.3 * priceSc);
      const qOk = c1 && [c2, c3, c4, c5, c6].filter(Boolean).length >= 4;
      const verdict = fin || uF === false ? 'no' : qOk && c7 ? 'entra' : qOk ? 'vigilar' : 'no';
      return { score: fin ? Math.min(score, 40) : uF === false ? Math.min(score, 20) : score, verdict, checks, entry: isNum(iv) ? iv * 0.75 : null, entryNote: 'valor intrínseco − 25 %', target: iv, targetNote: 'valor intrínseco (referencia; el método no vende por objetivo)', stop: null, stopNote: 'sin stop de precio: se vende si la tesis (el foso) se rompe', horizon: 'años (largo plazo)' };
    },
  },

  cocodrilo: {
    name: 'Buffett · cocodrilo paciente (4 factores y pánico)',
    author: 'Warren Buffett, según «5 sencillas estrategias» (canal Arte de invertir) y sus cartas a los accionistas',
    summary: 'Vigila una lista corta de negocios excepcionales y espera quieto, como un cocodrilo. Compra con fuerza solo cuando cumplen los 4 factores (negocio previsible, foso en buen estado, directiva que cuida al accionista y precio razonable), sobre todo si el pánico del mercado los ha hundido por un problema temporal.',
    rules: [
      'Negocio previsible: ventas y BPA creciendo a 5 años (y a 10 si hay datos), beneficios los 5 últimos años y como mucho 2 años de caída de ventas en los últimos 10 (mín. 5 años de cuentas).',
      'Foso en buen estado: rentabilidad del capital media ≥ 15 % (mín. 5 años) y sin erosión: la media de los 3 últimos años ≥ 80 % de la media larga y el margen bruto (u operativo) reciente no más de 2 puntos por debajo de su media.',
      'Directiva que cuida al accionista: no diluye (acciones sin subir más de un 0,5 % anual en 5 años) y devuelve al menos el 50 % del FCF de 5 años en dividendos y recompras, o reinvierte con rentabilidad del capital ≥ 15 % y ventas creciendo ≥ 8 % anual.',
      'Precio razonable (no hace falta ganga): PER actual no superior a su media histórica y rentabilidad FCF no inferior a su media histórica (mín. 3 años de historia). Si el crecimiento se ha frenado frente a cuando cotizaba a esos múltiplos, la comparación no vale y se usa el margen de seguridad (≥ 0 con valoración de fiabilidad alta o media).',
      'Oportunidad de pánico (suma, no es obligatoria): cotiza al menos un 30 % por debajo de su máximo de 52 semanas.',
      '¿Problema temporal o permanente? Indicios en los datos: ventas del último periodo sin caer más de un 10 %, sigue con beneficios y el foso no se erosiona. La respuesta de fondo la das tú.',
      'Entiendes el negocio y su demanda seguirá dentro de 10-20 años (sin sector en declive): lo confirmas tú.',
    ],
    exit: 'Sin stop de precio ni objetivo: Buffett mantiene mientras el negocio conserve el foso. Se vende si el foso se rompe, si el problema resulta permanente o si el precio se dispara muy por encima de lo razonable.',
    thresholdsNote: 'El vídeo da las ideas; los umbrales numéricos (15 %, 80 %, 2 puntos, 50 %, 30 %) son la forma en que la app las convierte en reglas medibles con datos reales. Lo que no se puede medir con datos (entender el negocio, si el problema es temporal) lo marcas tú en el detalle de cada empresa.',
    manual: [
      { key: 'entiendo', label: 'Entiendo el negocio y su demanda seguirá dentro de 10-20 años' },
      { key: 'temporal', label: 'Si ha caído, creo que el problema es temporal (no estructural)' },
    ],
    evaluate(S) {
      const { m, Y, s, iv, mos, price } = base(S);
      const fin = FIN.test(base(S).sector);
      const user = manualStore.get(m.symbol);
      const T = m.T || {};
      // 1. Previsibilidad
      const rev = s('revenue').filter(isNum), ni5 = last(s('netIncome').filter(isNum), 5);
      const drops = last(Y, 10).map((y, i, a) => (i && isNum(y.revenue) && isNum(a[i - 1].revenue) ? y.revenue < a[i - 1].revenue : null)).filter((v) => v !== null);
      const g = m.growth || {};
      // Con 5 ejercicios exactos (plan gratuito) hay 4 intervalos: se mide el crecimiento a 4 años y se indica
      const epsS = s('eps').filter(isNum), nG = rev.length >= 6 ? 5 : 4;
      const gRev = nG === 5 ? g.rev5 : cagrN(rev, 4), gEps = nG === 5 ? g.eps5 : epsS.length >= 5 ? cagrN(epsS, 4) : null;
      // Pérdidas o demasiadas caídas de ventas suspenden aunque no se pueda calcular el CAGR (con base o final negativos no existe)
      const c1 = rev.length < 5 ? null : ni5.some((v) => v <= 0) || drops.filter(Boolean).length > 2 ? false : isNum(gRev) && isNum(gEps) ? gRev > 0 && gEps > 0 && (!isNum(g.rev10) || g.rev10 > 0) && ni5.length >= 5 : null;
      // 2. Foso en buen estado (sin erosión)
      const rc = last(s('rc').filter(isNum), 10), rcAvg = rc.length >= 5 ? mean(rc) : null, rc3 = rc.length >= 5 ? mean(last(rc, 3)) : null;
      const gm = last(s('grossMargin').filter(isNum), 10), om = last(s('operatingMargin').filter(isNum), 10), mg = gm.length >= 5 ? gm : om;
      const mgAvg = mg.length >= 5 ? mean(mg) : null, mg3 = mg.length >= 5 ? mean(last(mg, 3)) : null;
      const c2 = isNum(rcAvg) && isNum(mgAvg) ? rcAvg >= 0.15 && rc3 >= 0.8 * rcAvg && mg3 >= mgAvg - 0.02 : null;
      // 3. Directiva / asignación de capital
      const Y5 = last(Y, 5);
      // Mismos años en el numerador y en el denominador: solo ejercicios con FCF y con dato de dividendos o recompras
      const retY = Y5.filter((y) => isNum(y.fcf) && (isNum(y.dividendsPaid) || isNum(y.buybacks)));
      const ret = retY.reduce((a, y) => a + (y.dividendsPaid || 0) + (y.buybacks || 0), 0);
      const fcf5 = retY.reduce((a, y) => a + y.fcf, 0);
      const payout = retY.length >= 3 && fcf5 > 0 ? ret / fcf5 : null;
      // Mismo horizonte que el criterio 1: con 5 ejercicios, 4 años
      const shS = s('shares').filter((v) => isNum(v) && v > 0);
      const gSh = nG === 5 ? g.shares5 : shS.length >= 5 ? cagrN(shS, 4) : null;
      const noDil = isNum(gSh) ? gSh <= 0.005 : null;
      const reinv = isNum(rc3) && isNum(gRev) ? rc3 >= 0.15 && gRev >= 0.08 : null;
      const c3 = noDil === false ? false : noDil === null ? null : (isNum(payout) && payout >= 0.5) || reinv === true ? true : payout === null && reinv === null ? null : false;
      // 4. Precio razonable frente a su propia historia
      const peH = last(m.ratiosHist || [], 5).map((r) => r.priceToEarningsRatio).filter((v) => isNum(v) && v > 0 && v < 300);
      const fyH = last(m.kmHist || [], 5).map((r) => r.freeCashFlowYield).filter((v) => isNum(v) && v > -1 && v < 1);
      // Mismos topes que la valoración: un PER histórico de 100× no es «razonable» por ser su media (máx. 35×, FCF ≥ 1/35)
      const peAvgRaw = peH.length >= 3 ? mean(peH) : null, fyAvgRaw = fyH.length >= 3 ? mean(fyH) : null;
      const peAvg = isNum(peAvgRaw) ? Math.min(peAvgRaw, 35) : null, fyAvg = isNum(fyAvgRaw) ? Math.max(fyAvgRaw, 1 / 35) : null;
      const capNote = (isNum(peAvgRaw) && peAvgRaw > 35) || (isNum(fyAvgRaw) && fyAvgRaw < 1 / 35) ? ' (media histórica topada a PER 35× / FCF 2,9 %)' : '';
      const pe = isNum(m.pe) && m.pe > 0 ? m.pe : null, fy = isNum(T.fcf) && isNum(m.marketCap) && m.marketCap > 0 ? m.X(T.fcf) / m.marketCap : null;
      const gThen = rev.length >= 8 ? cagrOf(rev.slice(0, -2), 5) : null, gNow = median([g.rev1, g.rev3].filter(isNum));
      const slowed = isNum(gThen) && isNum(gNow) && gThen > 0.05 && gNow < 0.6 * gThen;
      const rel = S.val && S.val.reliability ? S.val.reliability.level : null;
      const parts = [];
      if (!slowed && isNum(pe) && isNum(peAvg)) parts.push(pe <= peAvg);
      if (!slowed && isNum(fy) && isNum(fyAvg) && fyAvg > 0) parts.push(fy >= fyAvg);
      let c4 = parts.length ? parts.every(Boolean) : null, c4how = 'historia';
      if (c4 === null && isNum(mos) && !['baja', 'muy baja', 'no valorable'].includes(rel)) { c4 = mos >= 0; c4how = 'margen'; }
      // 5. Pánico: caída desde el máximo de 52 semanas (precios ajustados a splits)
      const cl = (m.prices || []).slice(-252).map((p) => p.close).filter(isNum);
      const hi = cl.length >= 200 ? Math.max(...cl) : null; // casi un año de sesiones: con 6 meses no es «máximo de 52 semanas»
      const dd = isNum(hi) && isNum(price) && hi > 0 ? price / hi - 1 : null;
      const panic = isNum(dd) ? dd <= -0.3 : null;
      // 6. Indicios de problema temporal (solo con caída fuerte)
      const yy = Y.filter((y) => isNum(y.revenue)), revChg = yy.length >= 2 && yy[yy.length - 2].revenue > 0 ? yy[yy.length - 1].revenue / yy[yy.length - 2].revenue - 1 : null;
      const niNow = isNum(T.netIncome) ? T.netIncome : lastVal(m, 'netIncome');
      const c6 = panic ? (isNum(revChg) && isNum(niNow) && c2 !== null ? revChg >= -0.1 && niNow > 0 && c2 : null) : null;
      const P = (v, d) => pctS(v, d);
      const checks = [
        C('Negocio previsible', c1, rev.length >= 5 ? `ventas ${P(gRev)}/año (${nG}a${nG === 4 ? ': solo hay 5 ejercicios' : ''})${isNum(g.rev10) ? `, ${P(g.rev10)} (10a)` : ''} · BPA ${P(gEps)}/año · ${ni5.filter((v) => v > 0).length} de ${ni5.length} años con beneficio · ${drops.filter(Boolean).length} años de caída de ventas de ${drops.length}` : `solo ${rev.length} años de cuentas (mín. 5)`, this.rules[0]),
        C('Foso en buen estado (sin erosión)', c2, isNum(rcAvg) ? `rentabilidad del capital media ${P(rcAvg)}, últimos 3 años ${P(rc3)} · margen ${gm.length >= 5 ? 'bruto' : 'operativo'} medio ${P(mgAvg)}, últimos 3 años ${P(mg3)}` : 'menos de 5 años de datos', this.rules[1]),
        C('Directiva que cuida al accionista', c3, `acciones ${P(gSh)}/año (${nG}a) · devuelto en 5 años: ${isNum(payout) ? P(payout, 0) + ' del FCF en dividendos y recompras' : 'sin dato de dividendos y recompras'}${reinv ? ' · reinvierte con alta rentabilidad y crecimiento' : ''}`, this.rules[2]),
        C('Precio razonable', c4, c4how === 'historia' ? (slowed ? 'el crecimiento se ha frenado: sus múltiplos pasados no sirven y la valoración no es fiable para sustituirlos' : `PER ${isNum(pe) ? nS(pe) + '×' : 'sin dato'} vs media ${isNum(peAvg) ? nS(peAvg) + '×' : 'sin historia'} · rentabilidad FCF ${P(fy)} vs media ${isNum(fyAvg) ? P(fyAvg) : 'sin historia'}${capNote}`) : `${slowed ? 'múltiplos históricos descartados porque el crecimiento se ha frenado' : 'sin historia de múltiplos'}: margen de seguridad ${P(mos)} (fiabilidad ${rel || '—'})`, this.rules[3]),
        C('Oportunidad de pánico (caída ≥ 30 %)', panic, isNum(dd) ? `${P(dd)} desde el máximo de 52 semanas (${nS(hi, 2)})` : 'sin precios de un año', this.rules[4]),
      ];
      if (panic) checks.push(C('Indicios de problema temporal', c6, isNum(revChg) ? `ventas ${P(revChg)} en el último ejercicio · ${isNum(niNow) && niNow > 0 ? 'con beneficios' : 'en pérdidas'} · foso ${c2 ? 'intacto' : c2 === false ? 'dañado' : 'sin dato'}` : 'sin dato', this.rules[5]));
      checks.push(C('Tú: entiendes el negocio y seguirá existiendo', user.entiendo ?? null, user.entiendo == null ? 'pendiente: márcalo en el detalle' : user.entiendo ? 'confirmado por ti' : 'has indicado que no', this.rules[6]));
      if (panic) checks.push(C('Tú: el problema es temporal', user.temporal ?? null, user.temporal == null ? 'pendiente: márcalo en el detalle' : user.temporal ? 'confirmado por ti' : 'has indicado que es permanente', this.rules[5]));
      if (fin) checks.unshift(C('Sector analizable con estos criterios', false, `${base(S).sector.trim() || 'financiero'}: FCF y rentabilidad del capital no se leen igual en bancos, aseguradoras, inmobiliarias o eléctricas`, 'Analízala en su ficha con ROE, solvencia y valor contable.'));
      const sc = (c1 ? 25 : 0) + (c2 ? 25 : 0) + (c3 ? 20 : 0) + (c4 ? 30 : 0) + (panic && c1 && c2 && c6 !== false ? 10 : 0); // sin bono si los datos apuntan a deterioro
      const userNo = user.entiendo === false || (panic && user.temporal === false);
      const core = c1 && c2 && c3;
      // Caída con indicios de deterioro (ventas hundiéndose, pérdidas o foso dañado): no entra salvo que tú confirmes que es temporal
      const deterioro = panic && c6 === false && user.temporal !== true;
      const verdict = fin || userNo ? 'no' : core && c4 && !deterioro ? 'entra' : core ? 'vigilar' : 'no';
      // Entrada: precio al que volvería a su PER medio o a su rentabilidad FCF media (la más exigente)
      const lv = [];
      if (!slowed && isNum(pe) && isNum(peAvg)) lv.push(price * (peAvg / pe));
      if (!slowed && isNum(fy) && fy > 0 && isNum(fyAvg) && fyAvg > 0) lv.push(price * (fy / fyAvg));
      const entry = lv.length ? Math.min(...lv) : isNum(iv) && c4how === 'margen' ? iv : null;
      return {
        score: Math.min(fin ? 40 : userNo ? 20 : 100, sc), verdict, checks,
        entry, entryNote: lv.length ? 'precio con el que vuelve a su PER medio y a su rentabilidad FCF media (el más bajo)' : 'valor intrínseco central (sin historia de múltiplos)',
        target: iv, targetNote: 'valor intrínseco central (referencia: Buffett no vende por objetivo)',
        stop: null, stopNote: 'sin stop de precio: se vende si el foso se rompe o el problema resulta permanente',
        horizon: deterioro && core && c4 ? 'esperar: la caída muestra deterioro en los datos' : core && !c4 ? 'lista corta: esperar precio' : 'años (largo plazo)',
        manualKeys: panic ? ['entiendo', 'temporal'] : ['entiendo'],
      };
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
      // 20 años de dividendo ininterrumpido: con el historial de pagos (suele llegar más atrás) o, si no, con los flujos
      // de caja. Si no se pueden ver 20 años completos, «no verificable» (nunca aprobado con menos).
      const lastClosed = new Date().getFullYear() - 1;
      const dYears = new Set((m.dpsSeries || []).filter((x) => x.dps > 0).map((x) => +x.year));
      let run = 0; for (let y = lastClosed; dYears.has(y); y--) run++;
      const dpAll = last(Y.map((y) => y.dividendsPaid), 20); const dp = dpAll.filter((v) => v != null);
      const hasHist = dYears.size > 0;
      // Confirmado que no paga: el proveedor respondió con una lista vacía de dividendos y no hay pagos en los flujos
      const listEmpty = S.raw && S.raw.dividends && S.raw.dividends.ok && Array.isArray(S.raw.dividends.data) && !S.raw.dividends.data.length;
      // …o, sin lista, al menos 5 años de flujos de caja sin ningún pago, sin último dividendo en la ficha y sin rentabilidad por dividendo
      const cfYears = Y.filter((y) => isNum(y.ocf)).slice(-10);
      const cfNoPay = cfYears.length >= 5 && cfYears.every((y) => !(y.dividendsPaid > 0)) && !(m.profile.lastDividend > 0) && !((m.rTTM || {}).dividendYieldTTM > 0);
      const noDiv = !hasHist && !dp.some((v) => v > 0) && (listEmpty || cfNoPay);
      const g4 = noDiv ? false : hasHist ? (run >= 20 ? true : Math.min(...dYears) <= lastClosed - 19 ? false : run === dYears.size ? null : false)
        : dp.some((v) => !(v > 0)) ? false : dpAll.length >= 20 && dpAll.every((v) => v != null && v > 0) ? true : null;
      const eps = s('eps').filter(isNum); const w = last(eps, 10);
      const e3 = mean(last(eps, 3)), e0 = w.length >= 10 ? mean(w.slice(0, 3)) : null; // Graham pide una ventana de 10 años: con menos, no verificable
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
        C('Historial de dividendos', g4, hasHist ? `${run} años seguidos pagando hasta ${lastClosed}${g4 === null ? ` (el historial disponible solo llega a ${Math.min(...dYears)}: no verificable)` : ''} · Graham pide 20` : noDiv ? 'no paga dividendo' : `${dp.filter((v) => v > 0).length} de ${dpAll.length} años con dividendo en los flujos de caja${g4 === null ? ' (menos de 20: no verificable)' : ''} · Graham pide 20`, this.rules[3]),
        C('Crecimiento del BPA ≥ 33 %', g5, isNum(e0) ? `BPA medio ${nS(e0, 2)} → ${nS(e3, 2)} (${pctS(e3 / e0 - 1, 0)})` : `solo ${w.length} años de BPA (Graham pide 10): no verificable`, this.rules[4]),
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
      'Rendimiento del capital = EBIT / (capital circulante neto + activo fijo neto) (más alto = mejor negocio). Capital circulante sin caja ni deuda a corto; si es negativo cuenta como 0 (si no, el denominador podría acercarse a cero y el rendimiento salir absurdo).',
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
        // Sin caja no se resta cero. Deuda a corto: publicada, o deuda total − largo plazo; si no, sin dato
        const cash = Y0.cash ?? m.last.cash;
        const dT = Y0.debt ?? m.last.debt, dL = Y0.longTermDebt ?? m.last.longTermDebt;
        const std = Y0.shortTermDebt ?? m.last.shortTermDebt ?? (isNum(dT) && isNum(dL) && dT >= dL ? dT - dL : null);
        const wc = isNum(ca) && isNum(cl) && isNum(cash) && isNum(std) ? (ca - cash) - (cl - std) : null;
        const ppe = Y0.ppe ?? m.last.ppe;
        const cap = isNum(wc) && isNum(ppe) ? Math.max(0, wc) + ppe : null;
        const roc = isNum(ebitR) && isNum(cap) && cap > 0 ? ebitR / cap : null;
        return { r, excluded, ey, roc, wc, ppe };
      });
      // Solo compiten empresas con EBIT y capital positivos (las que pierden dinero no inflan el ranking del resto)
      const ok = rows.filter((x) => !x.excluded && isNum(x.ey) && isNum(x.roc) && x.ey > 0 && x.roc > 0);
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
      const ebitPos = isNum(g.ey) && g.ey > 0;
      // Con pocas empresas clasificadas, quedar «1.ª de 1» no significa nada: como mucho «vigilar» y solo si cumple
      // por sí misma rentabilidad del beneficio > bono y rendimiento del capital ≥ 25 %
      const smallU = g.n < GB_MIN;
      if (smallU) checks.push(C('Universo suficiente', false, `solo ${g.n} empresas clasificadas (mínimo ${GB_MIN}): el ranking no es representativo`, 'Greenblatt clasifica cientos o miles de empresas. Analiza un universo más amplio en Métodos.'));
      const top = isNum(g.pos) && g.pos <= Math.max(1, Math.ceil(g.n * 0.3));
      const verdict = g.excluded || !ebitPos ? 'no' : smallU ? (checks[1].ok && checks[2].ok ? 'vigilar' : 'no') : top && checks[1].ok ? 'entra' : isNum(g.pos) && g.pos <= Math.ceil(g.n * 0.5) ? 'vigilar' : 'no';
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
    thresholdsNote: `El 20 % se calcula sobre el universo que analizas en la app, no sobre todo el mercado. Con menos de ${PIO_MIN} empresas comparables se exige además P/VC ≤ 1.`,
    prepare(all) {
      // Bancos y aseguradoras cotizan siempre a P/VC bajo: no compiten por el 20 % barato con el resto
      const v = all.map((r) => { const { m, sector } = base(r.S); const eq = lastVal(m, 'equity'); const bv = isNum(eq) && eq > 0 ? m.X(eq) : null; return { r, pb: !FIN.test(sector) && isNum(bv) && isNum(m.marketCap) ? m.marketCap / bv : null, fin: FIN.test(sector) }; });
      const ok = v.filter((x) => isNum(x.pb)).sort((a, b) => a.pb - b.pb);
      // Con pocas empresas, «el 20 % más barato» no dice nada (1 de 1 es siempre la más barata). Por debajo de
      // PIO_MIN empresas comparables se exige además P/VC ≤ 1 (criterio prudente: las empresas del quintil barato del
      // estudio original cotizaban típicamente por debajo de su valor contable).
      const small = ok.length < PIO_MIN;
      const cut = Math.max(1, Math.ceil(ok.length * 0.2));
      ok.forEach((x, i) => (x.r._pi = { pb: x.pb, cheap: i < cut && (!small || x.pb <= 1), pos: i + 1, n: ok.length, small }));
      v.filter((x) => !isNum(x.pb)).forEach((x) => (x.r._pi = { pb: null, cheap: false, n: ok.length, small: ok.length < PIO_MIN }));
    },
    evaluate(S, r) {
      const { m } = base(S); const p = r._pi || {}; const f = m.scores.piotroskiScore, rg = m.scores.piotroskiRange;
      // Con pruebas sin dato no se inventa la nota: aprueba si incluso en el peor caso llega a 8; suspende si ni en el mejor
      const fOk = isNum(f) ? f >= 8 : rg ? (rg.min >= 8 ? true : rg.max < 8 ? false : null) : null;
      const checks = [
        C(p.small ? 'Barata por valor contable (P/VC ≤ 1; universo pequeño)' : 'Entre el 20 % más barato (P/VC)', p.cheap, isNum(p.pb) ? `P/VC ${nS(p.pb, 2)} (puesto ${p.pos} de ${p.n}${p.small ? `; con menos de ${PIO_MIN} empresas comparables el ranking no es representativo y se exige además P/VC ≤ 1` : ''})` : FIN.test(base(S).sector) ? 'financiera: se compara aparte' : 'sin valor contable positivo', this.rules[0]),
        C('F-Score ≥ 8', fOk, isNum(f) ? `${f}/9` : rg ? `${rg.min} aprobadas de ${rg.known} con dato (${9 - rg.known} sin dato): entre ${rg.min} y ${rg.max} de 9` : 'sin dato', this.rules[2]),
      ];
      if (FIN.test(base(S).sector)) checks.push(C('Aviso de sector', null, 'financiera o inmobiliaria: varias pruebas del F-Score (liquidez, margen bruto) no se leen igual', 'Compruébala en su ficha.'));
      const fS = isNum(f) ? f : rg ? rg.min : null; // nota con el peor caso
      const score = isNum(fS) ? Math.min(FIN.test(base(S).sector) ? 40 : 100, Math.round((fS / 9) * (p.cheap ? 100 : 60))) : 0;
      const finP = FIN.test(base(S).sector);
      const verdict = finP ? 'no' : p.cheap && fOk === true ? 'entra' : fOk === true || (p.cheap && fS >= 6) ? 'vigilar' : 'no';
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
