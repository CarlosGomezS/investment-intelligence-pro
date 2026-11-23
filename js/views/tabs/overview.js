// Resumen: datos clave de mercado, veredicto, valor intrínseco, alertas principales y enlaces oficiales.
import { esc, num, pct, sgnPct, big, cls, date, card, scoreColor, source } from '../../ui/dom.js?v=85a54e71';
import { isNum } from '../../calc/finance.js?v=85a54e71';

export function gauge(s, size = 180) {
  const v = isNum(s) ? s : 0, a = Math.PI * (1 - v / 100), R = 80, cx = 100, cy = 92;
  const x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
  return `<svg viewBox="0 0 200 112" style="width:${size}px" role="img" aria-label="Puntuación ${s ?? 'sin datos'} sobre 100"><path d="M20 92A80 80 0 0 1 180 92" fill="none" stroke="var(--panel2)" stroke-width="14" stroke-linecap="round"/>${isNum(s) ? `<path d="M20 92A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${scoreColor(s)}" stroke-width="14" stroke-linecap="round"/>` : ''}<text x="100" y="84" text-anchor="middle" font-size="40" font-weight="600" fill="currentColor">${isNum(s) ? s : '—'}</text><text x="100" y="106" text-anchor="middle" font-size="11" fill="var(--mute)">sobre 100</text></svg>`;
}

export function render(el, S) {
  const { m, sc, val, rep, alerts } = S, p = m.profile, c = m.change, cur = m.tradeCur;
  let rng = String(p.range || '').split('-').map(Number);
  if (!(rng.length === 2 && rng[1] > 0)) { const c = (m.priceData || []).slice(-252).map((x) => x.close).filter(isNum); rng = c.length ? [Math.min(...c), Math.max(...c)] : [null, null]; }
  const next = m.earnings.find((e) => e.date >= new Date().toISOString().slice(0, 10) && e.epsActual == null);
  const comp = val.composite;
  const chg = (k) => (isNum(c[k]) ? `<span class="${cls(c[k])}">${sgnPct(c[k] / 100)}</span>` : '—');
  const K = [
    ['Capitalización', big(m.marketCap, cur)], ['Enterprise Value', big(m.ev, cur)], ['Acciones en circulación', big(m.shares)],
    ['Máx. 52 semanas', isNum(rng[1]) ? num(rng[1]) : '—'], ['Mín. 52 semanas', isNum(rng[0]) ? num(rng[0]) : '—'], ['Divisa', `${esc(cur)}${m.repCur !== cur ? ` <small>(estados en ${esc(m.repCur)})</small>` : ''}`],
    ['1 día', chg('1D')], ['1 semana', chg('5D')], ['1 mes', chg('1M')], ['6 meses', chg('6M')], ['En el año', chg('ytd')], ['1 año', chg('1Y')], ['5 años', chg('5Y')], ['10 años', chg('10Y')],
    ['PER', isNum(m.pe) && m.pe > 0 ? num(m.pe, 1) + '×' : '—'], ['Rent. dividendo', m.dpsTTM ? pct(m.dpsTTM / m.price, 2) : '—'], ['Beta', `${num(m.market.beta, 2)}${m.market.betaCalc ? ' <small>calculada</small>' : m.market.betaAssumed ? ' <small>supuesta</small>' : ''}`],
    ['Próximos resultados', next ? `${date(next.date)}${isNum(next.epsEstimated) ? ` <small>BPA est. ${num(next.epsEstimated)}</small>` : ''}` : '—'],
  ];
  const top = alerts.slice(0, 4);
  const cik = p.cik ? String(p.cik).replace(/^0+/, '') : (!m.symbol.includes('.') ? m.symbol : null); // EDGAR acepta el ticker
  const LABEL = { profile: 'Perfil', quote: 'Cotización', priceChange: 'Variaciones de precio', prices: 'Histórico de precios', income: 'Cuenta de resultados', balance: 'Balance', cashflow: 'Flujos de caja', incomeTTM: 'Resultados TTM', ratios: 'Ratios históricos', keyMetrics: 'Múltiplos históricos', ratiosTTM: 'Ratios actuales', keyMetricsTTM: 'Métricas actuales', scores: 'Piotroski / Altman', estimates: 'Estimaciones de analistas', priceTarget: 'Precio objetivo', gradesConsensus: 'Recomendaciones', dcf: 'DCF del proveedor', dividends: 'Dividendos', earnings: 'Resultados trimestrales', treasury: 'Bono a 10 años', riskPremium: 'Prima de riesgo', spy: 'S&P 500 (beta)' };
  const DER = { priceChange: 'variaciones de precio', ratios: 'ratios históricos', keyMetrics: 'múltiplos históricos', scores: 'Piotroski' };
  const rows = Object.keys(LABEL).filter((k) => S.raw[k]).map((k) => { const r = S.raw[k]; const calc = !r.ok && DER[k] && (m.derived || []).includes(DER[k]); return `<tr><td class="l">${LABEL[k]}</td><td class="l">${calc ? '<span class="pos">✓</span> Calculado por la app con precios y estados' : r.ok ? `<span class="pos">✓</span> ${esc(r.source || '')}` : `<span class="${r.pending ? 'warn' : 'neg'}">${r.pending ? '…' : '✕'}</span> ${esc((r.error && r.error.message) || 'Sin datos')}${r.error && r.error.tried ? `<br><small class="mute">${esc(r.error.tried)}</small>` : ''}`}</td></tr>`; }).join('');
  const okN = Object.keys(LABEL).filter((k) => S.raw[k] && (S.raw[k].ok || (DER[k] && (m.derived || []).includes(DER[k])))).length, totN = Object.keys(LABEL).filter((k) => S.raw[k]).length;
  const diag = `<details style="margin-top:14px" class="card"><summary style="padding:12px 16px;cursor:pointer;font-weight:600">Diagnóstico de datos: ${okN} de ${totN} bloques recibidos${m.derived && m.derived.length ? ` · calculados por la app: ${esc(m.derived.join(', '))}` : ''}</summary><div class="cb"><div class="tablewrap"><table class="dense"><tbody>${rows}</tbody></table></div><p class="note">Si una fuente aparece con ✕ en todo, revisa su clave en <a href="#/ajustes">Ajustes</a> (botón «Probar todas»). «…» = sigue descargando.</p></div></details>`;
  el.innerHTML = `
  <div class="grid g3" style="margin-bottom:14px">
    ${card('Puntuación de inversión', `<div class="gauge">${gauge(sc.total)}<div class="verdict">${esc(rep.conclusion)}</div><p class="note">Cobertura de datos: ${pct(sc.coverage, 0)} de las métricas. <a href="#/c/${encodeURIComponent(m.symbol)}/informe">Ver informe completo</a></p></div>`)}
    ${card('Valor intrínseco estimado', `<div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi"><span>Precio actual</span><b>${num(m.price)} ${esc(cur)}</b></div>
        <div class="kpi"><span>Valor intrínseco (central)</span><b>${num(comp.value)} ${esc(cur)}</b></div>
        <div class="kpi"><span>Margen de seguridad</span><b class="${cls(comp.mos)}">${pct(comp.mos, 0)}</b></div>
        <div class="kpi"><span>Potencial</span><b class="${cls(comp.up)}">${sgnPct(comp.up, 0)}</b></div>
      </div>
      <p class="note">Rango central ${num(comp.low)}–${num(comp.high)} ${esc(cur)} · mediana de ${comp.n} métodos. DCF base: ${val.dcf && isNum(val.dcf.perShare) ? num(val.dcf.perShare) : esc(val.dcf && val.dcf.error ? 'no aplicable' : '—')}. <a href="#/c/${encodeURIComponent(m.symbol)}/valoracion">Ajustar supuestos</a></p>`)}
    ${card('Señales de alerta', top.length ? top.map((a) => `<div class="alert-row"><span class="pill ${a.sev}">${a.sev}</span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div></div>`).join('') + (alerts.length > 4 ? `<p class="note"><a href="#/c/${encodeURIComponent(m.symbol)}/riesgos">Ver las ${alerts.length} alertas</a></p>` : '') : '<p class="note">No se detectan anomalías en los últimos estados financieros.</p>')}
  </div>
  <div class="kpis" style="margin-bottom:14px">${K.map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
  <div class="grid g2">
    ${card('Perfil de la compañía', `<p style="margin:0;color:var(--ink2)">${esc((p.description || 'Sin descripción del proveedor.').slice(0, 1400))}${(p.description || '').length > 1400 ? '…' : ''}</p>
      <div class="kpis" style="margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        <div class="kpi"><span>CEO</span><b style="font-size:14px">${esc(p.ceo || '—')}</b></div><div class="kpi"><span>Empleados</span><b style="font-size:14px">${p.fullTimeEmployees ? num(+p.fullTimeEmployees, 0) : '—'}</b></div>
        <div class="kpi"><span>Salida a bolsa</span><b style="font-size:14px">${date(p.ipoDate)}</b></div><div class="kpi"><span>Sede</span><b style="font-size:14px">${esc([p.city, p.country].filter(Boolean).join(', ') || '—')}</b></div>
      </div>${source(m.prov.profile)}`)}
    ${card('Informes oficiales y fuentes primarias', `<ul style="margin:0;padding-left:18px;line-height:2">
        ${p.website ? `<li><a href="${esc(p.website)}" target="_blank" rel="noopener">Web corporativa y relación con inversores</a></li>` : ''}
        ${cik ? `<li><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=40" target="_blank" rel="noopener">SEC EDGAR · informes anuales 10-K</a></li><li><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-Q&dateb=&owner=include&count=40" target="_blank" rel="noopener">SEC EDGAR · informes trimestrales 10-Q</a></li><li><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=40" target="_blank" rel="noopener">SEC EDGAR · hechos relevantes 8-K</a></li>` : ''}
        ${/\.MC$/.test(m.symbol) || p.country === 'ES' ? `<li><a href="https://www.cnmv.es/portal/Consultas/BusquedaPorEntidad.aspx?nombre=${encodeURIComponent(p.companyName || '')}" target="_blank" rel="noopener">CNMV · información regulada</a></li>` : ''}
        ${p.isin && p.country !== 'US' ? `<li><a href="https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_firds&searchText=${encodeURIComponent(p.isin)}" target="_blank" rel="noopener">ESMA · registro FIRDS por ISIN</a></li>` : ''}
        <li><a href="#/c/${encodeURIComponent(m.symbol)}/noticias">Últimos documentos presentados ante el regulador</a></li>
      </ul><p class="note">Los enlaces abren los registros oficiales; los datos de la aplicación proceden de proveedores que los extraen de esos documentos.</p>`)}
  </div>${diag}`;
}
