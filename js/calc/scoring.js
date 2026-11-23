// Scoring de inversión 0-100. Cada métrica se puntúa por interpolación lineal entre umbrales
// documentados (columna `pts`: pares [valor, puntos]). Una categoría es la media de sus métricas
// disponibles; el total es la media ponderada de las categorías con datos. Los datos faltantes se listan.
import { isNum, lin, mean, stdev, cagrN, div, maxDrawdown, median } from './finance.js?v=5ad630d4';

export const DEFAULT_WEIGHTS = { calidad: 12, crecimiento: 12, rentabilidad: 12, solidez: 12, caja: 12, moat: 10, valoracion: 15, riesgo: 8, estabilidad: 7 };

export const CATEGORY_LABELS = { calidad: 'Calidad del negocio', crecimiento: 'Crecimiento', rentabilidad: 'Rentabilidad', solidez: 'Solidez financiera', caja: 'Generación de caja', moat: 'Ventajas competitivas', valoracion: 'Valoración', riesgo: 'Riesgo', estabilidad: 'Estabilidad histórica' };

const P = (v) => (isNum(v) ? fx(v * 100, 1) + ' %' : '—');
const X = (v, d = 1) => (isNum(v) ? fx(v, d) : '—');

export function metricsFor(m, ctx) {
  const Y = m.years, last = m.last, T = m.T;
  const s = (f) => Y.map((y) => y[f]);
  const w = m.market.wacc ? m.market.wacc.wacc : null;
  const fcfPos = Y.slice(-10).filter((y) => isNum(y.fcf)).map((y) => y.fcf > 0);
  const revDown = Y.slice(-10).map((y, i, a) => (i ? isNum(y.revenue) && isNum(a[i - 1].revenue) && y.revenue < a[i - 1].revenue : null)).filter((v) => v !== null);
  const niNeg = Y.slice(-10).filter((y) => isNum(y.netIncome)).map((y) => y.netIncome < 0);
  const closes = (ctx.prices || []).slice(-1260).map((p) => p.close);
  const peAvg5 = mean(m.ratiosHist.slice(-5).map((r) => r.priceToEarningsRatio).filter((v) => isNum(v) && v > 0 && v < 300));
  const eveAvg5 = mean(m.kmHist.slice(-5).map((r) => r.evToEBITDA).filter((v) => isNum(v) && v > 0 && v < 300));
  const eve = isNum(T.ebitda) && T.ebitda > 0 ? div(m.ev, m.X(T.ebitda)) : null;
  const fcfy = div(m.X(T.fcf), m.marketCap);
  const gmStd = stdev(s('grossMargin').slice(-10));
  const roicStd = stdev(s('rc').slice(-10));
  const roicAvg5 = mean(s('rc').slice(-5));
  const RC = last.negCapital ? 'ROCE (capital invertido negativo por recompras)' : 'ROIC';
  const highAlerts = (ctx.alerts || []).filter((a) => a.sev === 'alta').length;
  // Mismo dato para la nota y para lo que se muestra; solo con ventas positivas
  const sbcR = isNum(T.sbc) && T.revenue > 0 ? T.sbc / T.revenue : isNum(last.sbc) && last.revenue > 0 ? last.sbc / last.revenue : null;
  // Paso de beneficios (o FCF) a pérdidas: el CAGR no se puede calcular, pero no es «sin dato»: puntúa 0
  // También pérdidas crónicas (último dato ≤ 0, aunque nunca hubiera beneficio): puntúa 0, no se excluye
  const toLoss = (k) => { const v = s(k).filter(isNum); return v.length >= 1 && v[v.length - 1] <= 0; };
  const eps5 = isNum(m.growth.eps5) ? m.growth.eps5 : toLoss('eps') ? -1 : null;
  const fcf5 = isNum(m.growth.fcf5) ? m.growth.fcf5 : toLoss('fcf') ? -1 : null; // CAGR alineado al calendario (con huecos)
  // Si el crecimiento se ha frenado, compararse con sus múltiplos de antes no dice nada (misma regla que la valoración)
  const revS = s('revenue'); const gThen = cagrN(revS.slice(0, -2), 5) ?? m.growth.rev5, gNow = median([m.growth.rev1, m.growth.rev3, m.growth.analystRev].filter(isNum));
  const slowed = isNum(gThen) && isNum(gNow) && gThen > 0.05 && gNow < 0.6 * gThen;

  const M = (cat, name, value, display, pts, formula) => ({ cat, name, value, display, pts, formula, score: isNum(value) ? Math.round(lin(value, pts)) : null });
  return [
    M('calidad', 'Piotroski F-Score', m.scores.piotroskiScore, isNum(m.scores.piotroskiScore) ? m.scores.piotroskiScore + '/9' : '—', [[2, 0], [5, 50], [8, 100]], '9 pruebas contables; 8+ = 100'),
    M('calidad', 'Calidad del beneficio (caja op./beneficio)', T.incomeQuality ?? last.incomeQuality, X(T.incomeQuality ?? last.incomeQuality, 2), [[0.5, 0], [0.9, 60], [1.2, 100]], 'CFO / beneficio neto'),
    M('calidad', 'Margen bruto', T.grossMargin, P(T.grossMargin), [[0.1, 0], [0.35, 55], [0.6, 100]], 'Beneficio bruto / ventas'),
    M('calidad', 'Pagos en acciones / ventas', sbcR, P(sbcR), [[0, 100], [0.03, 75], [0.1, 0]], 'SBC / ventas (menos es mejor)'),

    M('crecimiento', 'Ventas CAGR 5 años', m.growth.rev5, P(m.growth.rev5), [[-0.05, 0], [0.05, 55], [0.15, 100]], 'CAGR ventas 5a'),
    M('crecimiento', 'BPA CAGR 5 años', eps5, eps5 === -1 ? 'pasa a pérdidas' : P(eps5), [[-0.05, 0], [0.07, 55], [0.2, 100]], 'CAGR BPA 5a'),
    M('crecimiento', 'FCF CAGR 5 años', fcf5, fcf5 === -1 ? 'FCF negativo' : P(fcf5), [[-0.05, 0], [0.07, 55], [0.2, 100]], 'CAGR FCF 5a'),
    M('crecimiento', 'Ventas previstas (analistas)', m.growth.analystRev, P(m.growth.analystRev), [[-0.02, 0], [0.05, 55], [0.15, 100]], 'CAGR estimado de ventas'),

    M('rentabilidad', RC, T.rc ?? last.rc, P(T.rc ?? last.rc), [[0, 0], [0.1, 60], [0.25, 100]], last.negCapital ? 'EBIT / (activos − pasivo corriente)' : 'NOPAT / capital invertido'),
    M('rentabilidad', 'ROE', T.roe ?? last.roe, P(T.roe ?? last.roe), [[0, 0], [0.12, 60], [0.25, 100]], 'Beneficio / patrimonio'),
    M('rentabilidad', 'Margen operativo', T.operatingMargin, P(T.operatingMargin), [[0, 0], [0.12, 60], [0.3, 100]], 'EBIT / ventas'),
    M('rentabilidad', 'Margen neto', T.netMargin, P(T.netMargin), [[0, 0], [0.08, 55], [0.22, 100]], 'Beneficio neto / ventas'),

    M('solidez', 'Deuda neta / EBITDA', (T.netDebtToEbitda ?? last.netDebtToEbitda) ?? ((T.ebitdaNegWithDebt || last.ebitdaNegWithDebt) ? 99 : null), (T.ebitdaNegWithDebt || last.ebitdaNegWithDebt) && !isNum(T.netDebtToEbitda ?? last.netDebtToEbitda) ? 'EBITDA negativo con deuda' : X(T.netDebtToEbitda ?? last.netDebtToEbitda, 2) + '×', [[-1, 100], [1, 85], [2.5, 50], [4.5, 0]], 'Menos es mejor'),
    M('solidez', 'Cobertura de intereses', T.interestCoverage ?? last.interestCoverage, X(T.interestCoverage ?? last.interestCoverage) + '×', [[1, 0], [4, 55], [12, 100]], 'EBIT / intereses'),
    M('solidez', 'Liquidez corriente', T.currentRatio ?? last.currentRatio, X(T.currentRatio ?? last.currentRatio, 2), [[0.6, 0], [1, 50], [1.8, 100]], 'AC / PC'),
    M('solidez', 'Altman Z-Score', m.scores.altmanZScore, X(m.scores.altmanZScore, 2), [[1.2, 0], [1.8, 30], [3, 80], [5, 100]], '>3 zona segura'),

    M('caja', 'Margen FCF', T.fcfMargin ?? last.fcfMargin, P(T.fcfMargin ?? last.fcfMargin), [[-0.05, 0], [0.08, 55], [0.25, 100]], 'FCF / ventas'),
    M('caja', 'Conversión FCF / beneficio', T.fcfConversion ?? last.fcfConversion, X(T.fcfConversion ?? last.fcfConversion, 2), [[0.3, 0], [0.8, 60], [1.1, 100]], 'FCF / beneficio neto'),
    M('caja', 'Años con FCF positivo (10a)', fcfPos.length ? fcfPos.filter(Boolean).length / fcfPos.length : null, fcfPos.length ? `${fcfPos.filter(Boolean).length}/${fcfPos.length}` : '—', [[0.5, 0], [0.8, 60], [1, 100]], 'Proporción de años con FCF > 0'),
    M('caja', 'Capex / caja operativa', T.capexToOcf ?? last.capexToOcf, P(T.capexToOcf ?? last.capexToOcf), [[0.1, 100], [0.35, 60], [0.8, 0]], 'Menos es mejor'),

    M('moat', (last.negCapital ? 'ROCE' : 'ROIC') + ' medio 5a − WACC', isNum(roicAvg5) && isNum(w) ? roicAvg5 - w : null, isNum(roicAvg5) && isNum(w) ? P(roicAvg5 - w) : '—', [[-0.03, 0], [0.03, 55], [0.15, 100]], 'Exceso de rentabilidad sostenido'),
    M('moat', 'Estabilidad del margen bruto (desv. 10a)', gmStd, isNum(gmStd) ? P(gmStd) : '—', [[0.01, 100], [0.04, 60], [0.1, 0]], 'Desviación típica; menos es mejor'),
    M('moat', 'Estabilidad de la rentabilidad del capital (desv. 10a)', roicStd, isNum(roicStd) ? P(roicStd) : '—', [[0.02, 100], [0.06, 60], [0.15, 0]], 'Desviación típica; menos es mejor'),
    ...(isNum(ctx.moatUser) ? [M('moat', 'Evaluación cualitativa del usuario', ctx.moatUser, Math.round(ctx.moatUser) + '/100', [[0, 0], [100, 100]], 'Checklist del módulo Moat')] : []),

    M('valoracion', 'Margen de seguridad (valor intrínseco)', ctx.mos, P(ctx.mos), [[-0.5, 0], [0, 50], [0.3, 100]], '(Valor − precio)/valor'),
    M('valoracion', 'PER frente a su media 5a', !slowed && isNum(m.pe) && m.pe > 0 && isNum(peAvg5) ? m.pe / peAvg5 - 1 : null, isNum(peAvg5) && isNum(m.pe) ? `${X(m.pe)}× vs ${X(peAvg5)}×` : '—', [[-0.3, 100], [0, 60], [0.5, 0]], 'Descuento frente a su propia historia'),
    M('valoracion', 'EV/EBITDA frente a su media 5a', !slowed && isNum(eve) && isNum(eveAvg5) ? eve / eveAvg5 - 1 : null, isNum(eve) && isNum(eveAvg5) ? `${X(eve)}× vs ${X(eveAvg5)}×` : '—', [[-0.3, 100], [0, 60], [0.5, 0]], 'Descuento frente a su propia historia'),
    M('valoracion', 'Rentabilidad FCF', fcfy, P(fcfy), [[0, 0], [0.04, 55], [0.08, 100]], 'FCF / capitalización'),

    M('riesgo', 'Beta', m.market.betaAssumed ? null : m.market.beta, m.market.betaAssumed ? '—' : X(m.market.beta, 2), [[0.6, 100], [1, 70], [1.8, 0]], 'Sensibilidad al mercado'),
    M('riesgo', 'Máxima caída 5 años', closes.length > 200 ? maxDrawdown(closes) : null, closes.length > 200 ? P(maxDrawdown(closes)) : '—', [[-0.7, 0], [-0.35, 60], [-0.15, 100]], 'Peor caída desde máximos'),
    M('riesgo', 'Dilución anual 5a', m.growth.shares5, P(m.growth.shares5), [[-0.02, 100], [0, 80], [0.04, 0]], 'CAGR del nº de acciones'),
    M('riesgo', 'Alertas graves', ctx.alerts ? highAlerts : null, ctx.alerts ? String(highAlerts) : '—', [[0, 100], [2, 50], [4, 0]], 'Nº de alertas de severidad alta'),

    M('estabilidad', 'Años con caída de ventas (10a)', revDown.length ? revDown.filter(Boolean).length / revDown.length : null, revDown.length ? `${revDown.filter(Boolean).length}/${revDown.length}` : '—', [[0, 100], [0.2, 60], [0.5, 0]], 'Menos es mejor'),
    M('estabilidad', 'Años con pérdidas (10a)', niNeg.length ? niNeg.filter(Boolean).length / niNeg.length : null, niNeg.length ? `${niNeg.filter(Boolean).length}/${niNeg.length}` : '—', [[0, 100], [0.1, 55], [0.3, 0]], 'Menos es mejor'),
    M('estabilidad', 'Volatilidad del crecimiento de ventas', m.stats.revVol, P(m.stats.revVol), [[0.03, 100], [0.1, 60], [0.3, 0]], 'Desviación típica del crecimiento anual'),
  ];
}

export function score(m, ctx, weights = DEFAULT_WEIGHTS) {
  const metrics = metricsFor(m, ctx);
  const cats = Object.keys(CATEGORY_LABELS).map((k) => {
    const ms = metrics.filter((x) => x.cat === k);
    const av = ms.filter((x) => x.score != null);
    return { key: k, label: CATEGORY_LABELS[k], weight: weights[k] ?? 0, metrics: ms, score: av.length ? Math.round(mean(av.map((x) => x.score))) : null, coverage: ms.length ? av.length / ms.length : 0, missing: ms.filter((x) => x.score == null).map((x) => x.name) };
  });
  const used = cats.filter((c) => c.score != null && c.weight > 0);
  const wsum = used.reduce((a, c) => a + c.weight, 0);
  const total = wsum ? Math.round(used.reduce((a, c) => a + c.score * c.weight, 0) / wsum) : null;
  const coverage = metrics.filter((x) => x.score != null).length / metrics.length;
  return { total, cats, coverage, missing: metrics.filter((x) => x.score == null).map((x) => `${CATEGORY_LABELS[x.cat]}: ${x.name}`) };
}

function fx(v, d) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }); }
