// Base de datos local del usuario (localStorage): favoritos, listas, historial, análisis guardados,
// ponderaciones del scoring, checklist de moat, supuestos de valoración y alertas de precio.
const KEY = 'iip.store.v1';
const EMPTY = { lists: { Favoritos: [] }, history: [], analyses: [], weights: null, moat: {}, assumptions: {}, alerts: {}, notes: {}, peers: {} };

// Cada sección con su tipo: un archivo importado o un almacenamiento dañado no puede dejar la app inservible
const obj = (v, d) => (v && typeof v === 'object' && !Array.isArray(v) ? v : d);
function normalize(raw) {
  const r = obj(raw, {});
  const lists = obj(r.lists, null);
  // Cada empresa de una lista es un objeto { symbol, name, … }; se conservan esos (y un símbolo suelto se convierte).
  // Solo se descarta lo que no identifica una empresa.
  const item = (x) => (typeof x === 'string' && x ? { symbol: x } : x && typeof x === 'object' && typeof x.symbol === 'string' && x.symbol ? x : null);
  const cleanLists = lists ? Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, Array.isArray(v) ? v.map(item).filter(Boolean) : []])) : { Favoritos: [] };
  if (!cleanLists.Favoritos) cleanLists.Favoritos = [];
  return { ...structuredClone(EMPTY), ...r, lists: cleanLists, history: Array.isArray(r.history) ? r.history : [], analyses: Array.isArray(r.analyses) ? r.analyses : [], weights: obj(r.weights, null), moat: obj(r.moat, {}), assumptions: obj(r.assumptions, {}), alerts: obj(r.alerts, {}), notes: obj(r.notes, {}), peers: obj(r.peers, {}) };
}
function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return structuredClone(EMPTY); } }
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} window.dispatchEvent(new CustomEvent('iip:store')); }

export const store = {
  get: () => S,
  lists: () => S.lists,
  inList: (list, sym) => (S.lists[list] || []).some((x) => x.symbol === sym),
  isFav: (sym) => Object.values(S.lists).some((l) => l.some((x) => x.symbol === sym)),
  toggle(list, item) {
    S.lists[list] = S.lists[list] || [];
    const i = S.lists[list].findIndex((x) => x.symbol === item.symbol);
    if (i >= 0) S.lists[list].splice(i, 1); else S.lists[list].push({ symbol: item.symbol, name: item.name, exchange: item.exchange, added: Date.now() });
    save();
  },
  createList(name) { if (name && !S.lists[name]) { S.lists[name] = []; save(); } },
  deleteList(name) { if (name !== 'Favoritos') { delete S.lists[name]; save(); } },
  pushHistory(item) {
    S.history = [{ symbol: item.symbol, name: item.name, exchange: item.exchange, at: Date.now() }, ...S.history.filter((h) => h.symbol !== item.symbol)].slice(0, 40);
    save();
  },
  clearHistory() { S.history = []; save(); },
  saveAnalysis(a) { S.analyses = [a, ...S.analyses].slice(0, 200); save(); },
  analyses: (sym) => (sym ? S.analyses.filter((a) => a.symbol === sym) : S.analyses),
  weights: () => S.weights,
  setWeights(w) { S.weights = w; save(); },
  moat: (sym) => S.moat[sym] || {},
  setMoat(sym, v) { S.moat[sym] = v; save(); },
  assumptions: (sym) => S.assumptions[sym] || null,
  setAssumptions(sym, v) { S.assumptions[sym] = v; save(); },
  alerts: () => S.alerts,
  setAlert(sym, v) { if (v) S.alerts[sym] = v; else delete S.alerts[sym]; save(); },
  note: (sym) => S.notes[sym] || '',
  setNote(sym, t) { S.notes[sym] = t; save(); },
  peers: (sym) => (S.peers || {})[sym] || null,
  setPeers(sym, list) { S.peers = S.peers || {}; if (list) S.peers[sym] = list; else delete S.peers[sym]; save(); },
  exportAll: () => JSON.stringify(S, null, 2),
  importAll(json) { const r = JSON.parse(json); if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Archivo no válido'); S = normalize(r); save(); },
};
