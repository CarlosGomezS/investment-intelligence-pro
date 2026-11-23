// filings.xbrl.org: informes anuales oficiales en formato ESEF (IFRS) de empresas cotizadas europeas.
// Gratuito y sin clave. Se localiza la entidad por nombre (y país si se conoce) y se leen los hechos xBRL-JSON
// de los últimos informes. Cada informe trae el ejercicio y el anterior. Solo datos anuales.
import { getJSON } from './http.js?v=6408f476';
import { config } from '../config.js?v=6408f476';
import { toStatements } from './xbrl.js?v=6408f476';
import { hint } from './hints.js?v=6408f476';

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
  // Si hay varias entidades, la que más se parece al nombre completo
  const target = String(h.name || '').toLowerCase();
  const list = r.data.data.map((f) => ({ ...f.attributes, entityId: f.relationships && f.relationships.entity && f.relationships.entity.data && f.relationships.entity.data.id }));
  const score = (id) => { const n = String(ents[id] || '').toLowerCase(); return n === target ? 3 : target && n.includes(target.split(' ')[0]) ? 2 : 1; };
  const best = list.reduce((a, f) => (score(f.entityId) > score(a.entityId) ? f : a), list[0]);
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
const statements = (sym) => { if (!memo.has(sym)) memo.set(sym, load(sym).catch((e) => { memo.delete(sym); throw e; })); return memo.get(sym); };
const wrap = (sel) => async (sym) => { const { st, entity, meta } = await statements(sym); return { data: st[sel], source: `filings.xbrl.org · ${entity || 'ESEF'}`, endpoint: 'ESEF xBRL-JSON', fetchedAt: meta.fetchedAt, cached: meta.cached }; };

export const esef = { id: 'esef', name: 'filings.xbrl.org (ESEF)', income: wrap('income'), balance: wrap('balance'), cashflow: wrap('cashflow') };
export { keyword };
