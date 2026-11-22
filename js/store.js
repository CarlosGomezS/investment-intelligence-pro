// Base de datos local del usuario (localStorage): favoritos, listas, historial, análisis guardados,
// ponderaciones del scoring, checklist de moat, supuestos de valoración y alertas de precio.
const KEY = 'iip.store.v1';
const EMPTY = { lists: { Favoritos: [] }, history: [], analyses: [], weights: null, moat: {}, assumptions: {}, alerts: {}, notes: {}, peers: {} };

function load() { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return structuredClone(EMPTY); } }
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
  importAll(json) { S = { ...EMPTY, ...JSON.parse(json) }; save(); },
};
