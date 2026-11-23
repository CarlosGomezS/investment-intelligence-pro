// filings.xbrl.org: informes anuales oficiales en formato ESEF (IFRS) de empresas cotizadas europeas.
// Gratuito y sin clave. Se localiza la entidad por nombre (y país si se conoce) y se leen los hechos xBRL-JSON
// de los últimos informes. Cada informe trae el ejercicio y el anterior. Solo datos anuales.
import { getJSON } from './http.js?v=662c2f83';
import { config } from '../config.js?v=662c2f83';
import { toStatements } from './xbrl.js?v=662c2f83';
import { hint } from './hints.js?v=662c2f83';

const H = () => config.get().cacheHours;
const GENERIC = /^(banco|bank|group|grupo|holding|holdings|international|industria|industrie|societe|sociedad|compania|company|corporation|anonima|aktiengesellschaft|limited|public|europe|european|global|the)$/i;

function keyword(name) {
  const w = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter((x) => x.length >= 4 && !GENERIC.test(x));
  return w.sort((a, b) => b.length - a.length)[0] || null;
}
const COUNTRY = { 'Spain': 'ES', 'Germany': 'DE', 'France': 'FR', 'Netherlands': 'NL', 'Italy': 'IT', 'Belgium': 'BE', 'Portugal': 'PT', 'Ireland': 'IE', 'Finland': 'FI', 'Sweden': 'SE', 'Denmark': 'DK', 'Norway': 'NO', 'Austria': 'AT', 'Luxembourg': 'LU', 'Greece': 'GR', 'Poland': 'PL', 'United Kingdom': 'GB' };
const SUFFIX = { MC: 'ES', DE: 'DE', F: 'DE', PA: 'FR', AS: 'NL', MI: 'IT', BR: 'BE', LS: 'PT', IR: 'IE', HE: 'FI', ST: 'SE', CO: 'DK', OL: 'NO', VI: 'AT', AT: 'GR', WA: 'PL', L: 'GB' };

async function filingsFor(sym) {
  const h = hint(sym) || {};
  const cc = (h.country && (h.country.length === 2 ? h.country : COUNTRY[h.country])) || SUFFIX[(sym.split('.')[1] || '').toUpperCase()];
  if (!cc) throw Object.assign(new Error('ESEF solo cubre emisores europeos'), { code: 'not_found' });
  const kw = keyword(h.name);
  if (!kw) throw Object.assign(new Error('Falta el nombre de la empresa para buscar en ESEF'), { code: 'not_found' });
  const filter = JSON.stringify([{ name: 'country', op: 'eq', val: cc }, { name: 'entity.name', op: 'ilike', val: `%${kw}%` }]);
  const r = await getJSON('esef', 'api/filings', { filter, include: 'entity', sort: '-period_end', 'page[size]': 20 }, H().fundamentals, (b) => b && Array.isArray(b.data) && b.data.length);
  const ents = Object.fromEntries((r.data.included || []).filter((x) => x.type === 'entity').map((e) => [e.id, e.attributes && e.attributes.name]));
  // Se elige la entidad cuyo nombre más se parece al de la empresa, y solo si se parece de verdad:
  // con un parecido débil se devuelve «sin datos» antes que arriesgarse a cargar las cuentas de OTRA empresa.
  const LEGAL = /^(sa|s\.a\.|se|ag|nv|plc|spa|s\.p\.a\.|ab|asa|oyj|as|bv|gmbh|kgaa|inc|corp|ltd|co|the|de|del|la|el|y|and|et|group|grupo|holding|holdings)$/i;
  const toks = (x) => new Set(String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !LEGAL.test(w)));
  const T = toks(h.name);
  const sim = (id) => { const E = toks(ents[id]); if (!T.size || !E.size) return 0; let k = 0; for (const w of T) if (E.has(w)) k++; return k / Math.max(T.size, E.size); };
  const list = r.data.data.map((f) => ({ ...f.attributes, entityId: f.relationships && f.relationships.entity && f.relationships.entity.data && f.relationships.entity.data.id }));
  const best = list.reduce((a, f) => (sim(f.entityId) > sim(a.entityId) ? f : a), list[0]);
  if (sim(best.entityId) < 0.6) throw Object.assign(new Error(`ESEF no tiene un emisor que coincida con «${h.name}» (el más parecido es «${ents[best.entityId] || '—'}»)`), { code: 'not_found' });
  const mine = list.filter((f) => f.entityId === best.entityId && f.json_url);
  // un informe por fecha de cierre (el primero suele ser el idioma principal)
  const seen = new Set(), uniq = [];
  for (const f of mine) if (!seen.has(f.period_end)) { seen.add(f.period_end); uniq.push(f); }
  if (!uniq.length) throw Object.assign(new Error('Sin informes ESEF con datos para esta empresa'), { code: 'not_found' });
  return { filings: uniq.slice(0, 4), entity: ents[best.entityId], meta: r };
}

const isoEnd = (s) => { const d = new Date(s.replace(/T.*$/, '') + 'T00:00:00Z'); if (/T00:00:00/.test(s)) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

async function load(sym) {
  const { filings, entity, meta } = await filingsFor(sym);
  const F = [];
  for (const f of filings) {
    const path = f.json_url.replace(/^https?:\/\/filings\.xbrl\.org\//, '').replace(/^\//, '');
    let doc; try { doc = (await getJSON('esef', path, {}, H().static * 4)).data; } catch { continue; }
    for (const x of Object.values((doc && doc.facts) || {})) {
      const d = x.dimensions || {};
      if (!d.concept || !d.period) continue;
      if (Object.keys(d).some((k) => !['concept', 'entity', 'period', 'unit', 'language'].includes(k))) continue; // solo totales sin desglose
      const [a, b] = d.period.split('/');
      F.push({ concept: d.concept, start: b ? a.slice(0, 10) : null, end: isoEnd(b || a), val: x.value, unit: d.unit, filed: f.period_end + (f.processed || '') });
    }
  }
  if (!F.length) throw Object.assign(new Error('No se pudieron leer los datos ESEF'), { code: 'not_found' });
  return { st: toStatements(F, sym, 8), entity, meta };
}

const memo = new Map();
export const forgetEsef = (sym) => memo.delete(sym);
const statements = (sym) => { if (!memo.has(sym)) memo.set(sym, load(sym).catch((e) => { memo.delete(sym); throw e; })); return memo.get(sym); };
const wrap = (sel) => async (sym) => { const { st, entity, meta } = await statements(sym); return { data: st[sel], source: `filings.xbrl.org · ${entity || 'ESEF'}`, endpoint: 'ESEF xBRL-JSON', fetchedAt: meta.fetchedAt, cached: meta.cached }; };

export const esef = { id: 'esef', name: 'filings.xbrl.org (ESEF)', income: wrap('income'), balance: wrap('balance'), cashflow: wrap('cashflow') };
export { keyword };
