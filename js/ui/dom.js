// Utilidades de interfaz: escape, formato numérico en español, tablas, estados de carga/error.
import { isNum } from '../calc/finance.js?v=0a5702cc';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = (d) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
export const num = (v, d = 2) => (isNum(v) ? nf(d).format(v) : '—');
export const pct = (v, d = 1) => (isNum(v) ? nf(d).format(v * 100) + ' %' : '—');
export const sgnPct = (v, d = 1) => (isNum(v) ? (v > 0 ? '+' : '') + nf(d).format(v * 100) + ' %' : '—');
export const mult = (v, d = 1) => (isNum(v) ? nf(d).format(v) + '×' : '—');
export function big(v, cur = '') {
  if (!isNum(v)) return '—';
  const a = Math.abs(v); let s;
  if (a >= 1e12) s = nf(2).format(v / 1e12) + ' bill.'; else if (a >= 1e9) s = nf(2).format(v / 1e9) + ' mil M'; else if (a >= 1e6) s = nf(1).format(v / 1e6) + ' M'; else if (a >= 1e3) s = nf(1).format(v / 1e3) + ' mil'; else s = nf(2).format(v);
  return cur ? `${s} ${cur}` : s;
}
export const cls = (v) => (!isNum(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
export const date = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const datetime = (t) => (t ? new Date(t).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const scoreColor = (s) => (s == null ? 'var(--mute)' : s >= 70 ? 'var(--pos)' : s >= 45 ? 'var(--warn)' : 'var(--neg)');

const ERR = {
  premium: 'Requiere un plan de pago del proveedor',
  no_key: 'Falta configurar una clave de API',
  bad_key: 'La clave de API no es válida',
  rate_limit: 'Límite diario de peticiones alcanzado',
  network: 'El proveedor no responde',
  not_found: 'El proveedor no tiene este dato',
  needs_proxy: 'Esta fuente necesita el backend (Worker)',
  missing: 'Sin datos',
};
export const errMsg = (e) => (e ? ERR[e.code || e.error] || e.message || 'Error' : 'Sin datos');

/** Recuadro de "dato no disponible" con la razón real. */
export function unavailable(what, e) {
  const code = e && (e.code || e.error);
  const extra = code === 'premium' ? ' Ninguna de tus fuentes gratuitas lo ofrece para esta empresa; añade más fuentes en <a href="#/ajustes">Ajustes</a>.' : code === 'no_key' || code === 'bad_key' || code === 'needs_proxy' ? ' <a href="#/ajustes">Ir a Ajustes</a>.' : '';
  return `<div class="empty"><b>${esc(what)}:</b> ${esc(errMsg(e))}.${extra}</div>`;
}

/** Pie de procedencia de un bloque de datos. */
export function source(...provs) {
  const p = provs.filter((x) => x && x.source);
  if (!p.length) return '';
  const uniq = [...new Map(p.map((x) => [x.source + x.endpoint, x])).values()];
  return `<p class="src">Fuente: ${uniq.map((x) => `${esc(x.source)} <code>${esc(x.endpoint || '')}</code> · ${datetime(x.fetchedAt)}${x.cached ? ' (caché)' : ''}`).join(' · ')}</p>`;
}

/**
 * Tabla genérica. cols: [{k, label, f?(v,row), cls?, align?}]
 * Devuelve HTML con data-table para exportar.
 */
export function table(id, cols, rows, opts = {}) {
  const head = cols.map((c) => `<th class="${c.align === 'left' ? 'l' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${cols.map((c) => { const v = typeof c.k === 'function' ? c.k(r) : r[c.k]; const out = c.f ? c.f(v, r) : esc(v ?? '—'); const k = c.cls ? c.cls(v, r) : ''; return `<td class="${c.align === 'left' ? 'l ' : ''}${k}" data-l="${esc(c.label)}">${out}</td>`; }).join('')}</tr>`).join('');
  return `<div class="tablewrap${opts.stack ? ' stack' : ''}"><table id="${id}" class="${opts.dense ? 'dense' : ''}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="l mute">Sin datos</td></tr>`}</tbody></table></div>`;
}

export function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

export const skeleton = (n = 3) => `<div class="skel">${'<div></div>'.repeat(n)}</div>`;

/** Bloque estándar de panel. */
export const card = (title, body, opts = {}) => `<section class="card ${opts.cls || ''}"${opts.id ? ` id="${opts.id}"` : ''}>${title ? `<header><h3>${title}</h3>${opts.actions || ''}</header>` : ''}<div class="cb">${body}</div></section>`;

/** Etiqueta del origen de un supuesto (real / analistas / supuesto). */
export function origin(o) {
  const t = String(o || '');
  const k = t.startsWith('real') || t.startsWith('calculado') ? 'real' : t.startsWith('analistas') ? 'est' : t.startsWith('falta') ? 'miss' : 'sup';
  return `<span class="org ${k}" title="${esc(t)}">${k === 'real' ? 'Dato real' : k === 'est' ? 'Estimación' : k === 'miss' ? 'Falta' : 'Supuesto'}</span>`;
}
