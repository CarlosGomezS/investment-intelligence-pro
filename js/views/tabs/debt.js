// Deuda y solvencia: estructura, vencimientos, coste, cobertura, apalancamiento, liquidez y riesgo de refinanciación.
import { fundamentals } from '../../ui/charts.js?v=6408f476';
import { esc, card, pct, big, num, scoreColor } from '../../ui/dom.js?v=6408f476';
import { isNum, div, lin, mean } from '../../calc/finance.js?v=6408f476';
import { gauge } from './overview.js?v=6408f476';

export function solvency(m) {
  const T = m.T, L = m.last;
  const cash = T.cash ?? L.cash, std = T.shortTermDebt ?? L.shortTermDebt, fcf = T.fcf ?? L.fcf, debt = T.debt ?? L.debt;
  const F = [
    { k: 'Deuda neta / EBITDA', v: T.netDebtToEbitda ?? L.netDebtToEbitda, d: (v) => num(v, 2) + '×', s: (v) => lin(v, [[-1, 100], [1, 85], [2.5, 50], [4.5, 0]]), w: 25, why: (v) => (v < 0 ? 'Más caja que deuda.' : v < 2 ? 'Deuda asumible con menos de 2 años de EBITDA.' : v < 3.5 ? 'Apalancamiento exigente.' : 'Apalancamiento alto.') },
    { k: 'Cobertura de intereses (EBIT/intereses)', v: T.interestCoverage ?? L.interestCoverage, d: (v) => num(v, 1) + '×', s: (v) => lin(v, [[1, 0], [4, 55], [12, 100]]), w: 20, why: (v) => (v > 8 ? 'Paga los intereses con holgura.' : v > 3 ? 'Cobertura suficiente.' : 'Cobertura débil ante subidas de tipos o caída de beneficios.') },
    { k: 'Años de FCF para pagar toda la deuda', v: isNum(debt) && isNum(fcf) && fcf > 0 ? debt / fcf : null, d: (v) => num(v, 1) + ' años', s: (v) => lin(v, [[0, 100], [3, 80], [7, 40], [12, 0]]), w: 20, why: (v) => (v < 3 ? 'Podría amortizar la deuda rápidamente con su caja.' : v < 7 ? 'Plazo razonable.' : 'Necesitaría muchos años de caja para devolver la deuda.') },
    { k: 'Liquidez corriente', v: T.currentRatio ?? L.currentRatio, d: (v) => num(v, 2), s: (v) => lin(v, [[0.6, 0], [1, 50], [1.8, 100]]), w: 10, why: (v) => (v >= 1 ? 'Cubre el pasivo a corto con activos a corto.' : 'El activo corriente no cubre el pasivo corriente.') },
    { k: 'Cobertura de la deuda a corto (caja + FCF) / deuda CP', v: isNum(std) && std > 0 ? ((cash || 0) + Math.max(fcf || 0, 0)) / std : null, d: (v) => num(v, 1) + '×', s: (v) => lin(v, [[0.5, 0], [1, 45], [2.5, 100]]), w: 15, why: (v) => (v > 2 ? 'Riesgo de refinanciación bajo: puede atender los vencimientos próximos sin pedir dinero.' : v > 1 ? 'Puede atender los vencimientos próximos con margen justo.' : 'Dependería de refinanciar los vencimientos a corto plazo.') },
    { k: 'Altman Z-Score', v: m.scores.altmanZScore, d: (v) => num(v, 2), s: (v) => lin(v, [[1.2, 0], [1.8, 30], [3, 80], [5, 100]]), w: 10, why: (v) => (v > 3 ? 'Zona segura.' : v > 1.8 ? 'Zona gris.' : 'Zona de riesgo de impago (modelo de Altman).') },
  ].map((f) => ({ ...f, score: isNum(f.v) ? Math.round(f.s(f.v)) : null }));
  const av = F.filter((f) => f.score != null), ws = av.reduce((a, f) => a + f.w, 0);
  return { factors: F, score: ws ? Math.round(av.reduce((a, f) => a + f.score * f.w, 0) / ws) : null };
}

export function render(el, S) {
  const m = S.m, Y = m.years, T = m.T, cur = m.repCur;
  const s = (f) => Y.map((y) => y[f]);
  const sv = solvency(m);
  const std = T.shortTermDebt ?? m.last.shortTermDebt, ltd = T.longTermDebt ?? m.last.longTermDebt;
  const cod = m.market.costDebt;
  const cik = m.profile.cik ? String(m.profile.cik).replace(/^0+/, '') : null;
  el.innerHTML = `<div class="grid g3">
    ${card('Puntuación de solvencia', `<div class="gauge">${gauge(sv.score)}<div class="verdict" style="color:${scoreColor(sv.score)}">${sv.score == null ? 'Sin datos' : sv.score >= 75 ? 'Solvencia muy sólida' : sv.score >= 55 ? 'Solvencia adecuada' : sv.score >= 40 ? 'Solvencia vigilable' : 'Solvencia débil'}</div><p class="note">Media ponderada de los ${sv.factors.filter((f) => f.score != null).length} factores disponibles (pesos en la tabla).</p></div>`)}
    ${card('Estructura de la deuda', `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Deuda total</span><b>${big(T.debt ?? m.last.debt, cur)}</b></div><div class="kpi"><span>Deuda neta</span><b>${big(T.netDebt ?? m.last.netDebt, cur)}</b></div>
      <div class="kpi"><span>Vence en &lt; 12 meses</span><b>${big(std, cur)}</b><small>${pct(div(std, (std || 0) + (ltd || 0)), 0)} del total</small></div><div class="kpi"><span>Vence en &gt; 12 meses</span><b>${big(ltd, cur)}</b></div>
      <div class="kpi"><span>Caja e inversiones CP</span><b>${big(T.cash ?? m.last.cash, cur)}</b></div><div class="kpi"><span>Coste medio de la deuda</span><b>${pct(cod, 2)}</b><small>intereses / deuda, media 3a</small></div></div>
      <p class="note">El calendario detallado de vencimientos por año solo figura en las notas del informe anual${cik ? ` (<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K" target="_blank" rel="noopener">10-K en SEC EDGAR</a>, nota «Debt»)` : ''}; los proveedores de datos solo distinguen corto y largo plazo.</p>`)}
    ${card('Liquidez', `<div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><span>Liquidez corriente</span><b>${num(T.currentRatio ?? m.last.currentRatio, 2)}</b></div><div class="kpi"><span>Prueba ácida</span><b>${num(div(isNum(T.currentAssets) ? T.currentAssets - (T.inventory || 0) : null, T.currentLiabilities), 2)}</b></div>
      <div class="kpi"><span>Ratio de caja</span><b>${num(div(T.cash, T.currentLiabilities), 2)}</b></div><div class="kpi"><span>Capital circulante</span><b>${big(isNum(T.currentAssets) && isNum(T.currentLiabilities) ? T.currentAssets - T.currentLiabilities : null, cur)}</b></div></div>`)}
  </div>
  <div style="margin-top:14px">${card('Factores de la puntuación de solvencia', `<div class="tablewrap"><table><thead><tr><th class="l">Factor</th><th>Valor</th><th>Peso</th><th>Puntos</th><th class="l">Lectura</th></tr></thead><tbody>${sv.factors.map((f) => `<tr><td class="l">${esc(f.k)}</td><td>${isNum(f.v) ? f.d(f.v) : '—'}</td><td>${f.w} %</td><td style="color:${scoreColor(f.score)}"><b>${f.score ?? '—'}</b></td><td class="l">${isNum(f.v) ? esc(f.why(f.v)) : 'Dato no disponible: el factor se excluye y el resto se repondera.'}</td></tr>`).join('')}</tbody></table></div>`)}</div>
  <div class="grid g2" style="margin-top:14px">
    ${card('Deuda, caja y EBITDA', '<div class="chart"><canvas id="d1"></canvas></div>')}
    ${card('Evolución del apalancamiento', '<div class="chart"><canvas id="d2"></canvas></div>')}
    ${card('Capacidad de pago de intereses', '<div class="chart"><canvas id="d3"></canvas></div>')}
    ${card('Deuda a corto vs. largo plazo', '<div class="chart"><canvas id="d4"></canvas></div>')}
  </div>`;
  const L = Y.map((y) => y.year);
  fundamentals('d1', L, [{ label: 'Deuda total', data: s('debt') }, { label: 'Caja', data: s('cash') }, { label: 'EBITDA', data: s('ebitda'), type: 'line' }]);
  fundamentals('d2', L, [{ label: 'Deuda neta / EBITDA', data: s('netDebtToEbitda'), type: 'line' }, { label: 'Deuda / Patrimonio', data: s('debtToEquity').map((v) => (isNum(v) && v >= 0 && v < 20 ? v : null)), type: 'line' }], { fmt: 'x' });
  fundamentals('d3', L, [{ label: 'Cobertura de intereses (EBIT/intereses)', data: s('interestCoverage').map((v) => (isNum(v) && v < 500 ? v : null)) }, { label: 'Coste de la deuda', data: s('costOfDebt').map((v) => (isNum(v) && v < 0.3 ? v : null)), type: 'line', axis: 'y2' }], { fmt: 'x', fmt2: 'pct' });
  fundamentals('d4', L, [{ label: 'Corto plazo', data: s('shortTermDebt') }, { label: 'Largo plazo', data: s('longTermDebt') }], { stacked: true });
}
