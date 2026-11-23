// Noticias y eventos: noticias, notas de prensa, documentos ante el regulador y resultados trimestrales.
// Clasificación automática por palabras clave (tema y tipo: hecho / previsión / opinión), indicada como tal.
import { data } from '../../providers/index.js?v=cc3b3e4a';
import { esc, card, num, pct, date, datetime, cls, sgnPct, unavailable, source, table } from '../../ui/dom.js?v=cc3b3e4a';
import { isNum } from '../../calc/finance.js?v=cc3b3e4a';
import { extra } from '../company.js?v=cc3b3e4a';

const TOPICS = [
  ['Resultados', /earnings|results|quarter|revenue|profit|EPS|beats|misses|resultados|beneficio|ventas trimestr/i],
  ['Previsiones', /guidance|outlook|forecast|raises|lowers|cuts (its )?(outlook|forecast)|previsi/i],
  ['Directivos', /CEO|CFO|chief|executive|resign|appoint|steps down|board|director|consejero|nombra/i],
  ['Fusiones y adquisiciones', /acqui|merger|takeover|buyout|deal to buy|stake|adquisici|fusi[oó]n|OPA/i],
  ['Producto', /launch|unveil|product|release|new model|announces new|lanza|presenta/i],
  ['Litigios', /lawsuit|sue|court|settle|litigation|class action|judge|demanda|tribunal/i],
  ['Regulación', /regulat|antitrust|FTC|SEC|DOJ|European Commission|fine|probe|investigation|CNMV|multa/i],
  ['Geopolítica', /tariff|China|sanction|export control|war|geopolit|arancel/i],
  ['Extraordinario', /recall|cyberattack|breach|outage|strike|bankrupt|default|fire|explosion|huelga/i],
];
const OPINION = /\b(should you|buy now|top pick|best stock|why (I|we)|is it time|undervalued|overvalued|could|might|opinion|analyst says|bull case|bear case|motley|seeking alpha|\?)/i;
const FORECAST = /\b(expects?|forecasts?|guidance|outlook|projects?|will (likely|probably)|estimates?|target|predicts?)\b/i;
export function classify(t) {
  const s = `${t.title || ''} ${t.text || ''}`;
  const topics = TOPICS.filter(([, r]) => r.test(s)).map(([k]) => k);
  const kind = OPINION.test(t.title || '') ? 'Opinión' : FORECAST.test(s) ? 'Previsión' : 'Hecho';
  return { topics: topics.length ? topics : ['General'], kind };
}
const FORMS = { '10-K': 'Informe anual', '10-Q': 'Informe trimestral', '8-K': 'Hecho relevante', '4': 'Operación de insider', 'DEF 14A': 'Junta de accionistas', 'S-1': 'Registro de emisión', '20-F': 'Informe anual (extranjera)', '6-K': 'Informe (extranjera)', 'SC 13G': 'Participación significativa', 'SC 13D': 'Participación significativa (activista)', '13F-HR': 'Cartera institucional' };

let filter = 'Todas';
export async function render(el, S) {
  const m = S.m;
  el.innerHTML = '<div class="skel"><div></div><div></div></div>';
  const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), to = new Date().toISOString().slice(0, 10);
  const [nw, pr, fl] = await Promise.allSettled([extra(S, 'news', () => data.news(m.symbol, 50)), extra(S, 'press', () => data.pressReleases(m.symbol, 20)), extra(S, 'filings', () => data.filings(m.symbol, from, to))]);
  const news = nw.status === 'fulfilled' ? (nw.value.data || []).map((n) => ({ ...n, ...classify(n) })) : [];
  const topics = ['Todas', ...new Set(news.flatMap((n) => n.topics))];
  const shown = filter === 'Todas' ? news : news.filter((n) => n.topics.includes(filter));
  const filings = fl.status === 'fulfilled' ? (fl.value.data || []) : [];
  const keyF = filings.filter((f) => f.formType !== '4');
  const ins = filings.filter((f) => f.formType === '4').length;
  const E = m.earnings.filter((e) => isNum(e.epsActual)).slice(-12).reverse();
  el.innerHTML = `<div class="grid g2">
    <div>${nw.status === 'fulfilled' ? card(`Noticias recientes (${news.length})`, `<div class="chips noprint" id="tf" style="margin-bottom:8px">${topics.map((t) => `<button class="chip ${t === filter ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="news">${shown.slice(0, 40).map((n) => `<a class="it" href="${esc(n.url)}" target="_blank" rel="noopener"><div><b>${esc(n.title)}</b><small>${esc(n.site || n.publisher || '')} · ${datetime(n.publishedDate)} · ${n.topics.map(esc).join(', ')}</small></div><span class="org ${n.kind === 'Hecho' ? 'real' : n.kind === 'Previsión' ? 'est' : 'sup'}">${n.kind}</span></a>`).join('') || '<p class="note">Sin noticias para este filtro.</p>'}</div>
        <p class="note">Tema y tipo se asignan automáticamente por palabras clave del titular: verifica en la fuente original.</p>${source(nw.value)}`) : unavailable('Noticias', nw.reason)}</div>
    <div class="stack-y">
      ${card('Resultados trimestrales', E.length ? table('earn', [{ k: 'date', label: 'Fecha', f: date, align: 'left' }, { k: 'epsActual', label: 'BPA real', f: (v) => num(v) }, { k: 'epsEstimated', label: 'BPA estimado', f: (v) => num(v) }, { k: (r) => (isNum(r.epsActual) && isNum(r.epsEstimated) && r.epsEstimated !== 0 ? (r.epsActual - r.epsEstimated) / Math.abs(r.epsEstimated) : null), label: 'Sorpresa', f: (v) => `<span class="${cls(v)}">${sgnPct(v)}</span>` }, { k: 'revenueActual', label: 'Ventas', f: (v) => (isNum(v) ? (v / 1e9).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' mil M' : '—') }], E, { dense: true }) + source(m.prov.earnings) : unavailable('Resultados', S.raw.earnings.error))}
      ${pr.status === 'fulfilled' && pr.value.data.length ? card('Notas de prensa de la compañía', `<div class="news">${pr.value.data.slice(0, 10).map((n) => `<a class="it" href="${esc(n.url || '#')}" target="_blank" rel="noopener"><div><b>${esc(n.title)}</b><small>${datetime(n.publishedDate || n.date)}</small></div><span class="org real">Oficial</span></a>`).join('')}</div>${source(pr.value)}`) : card('Notas de prensa de la compañía', unavailable('Notas de prensa', pr.reason))}
      ${fl.status === 'fulfilled' ? card('Documentos presentados ante la SEC (12 meses)', `${keyF.length ? `<div class="news">${keyF.slice(0, 20).map((f) => `<a class="it" href="${esc(f.finalLink || f.link)}" target="_blank" rel="noopener"><div><b>${esc(f.formType)} · ${esc(FORMS[f.formType] || 'Documento')}</b><small>${date(f.filingDate)}</small></div><span class="org real">SEC</span></a>`).join('')}</div>` : '<p class="note">Sin documentos (empresa no registrada en la SEC).</p>'}${ins ? `<p class="note">Además, ${ins} formularios 4 de operaciones de directivos (ver Analistas e insiders).</p>` : ''}${source(fl.value)}`) : card('Documentos regulatorios', unavailable('Documentos SEC', fl.reason))}
    </div></div>`;
  const tf = el.querySelector('#tf'); if (tf) tf.onclick = (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.t; render(el, S); } };
}
export { pct };
