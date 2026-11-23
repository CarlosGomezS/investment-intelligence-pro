// Configuración del usuario: claves de API, proxy opcional y preferencias.
// Las claves se guardan SOLO en el dispositivo del usuario, nunca en el repositorio.
//
// Para que no se pierdan se guardan en TRES sitios y se restauran solas:
//   1) localStorage            (principal)
//   2) IndexedDB               (sobrevive a quien haga localStorage.clear(), p. ej. otras webs del mismo dominio)
//   (antes también una cookie: se quitó porque el navegador la envía al servidor en cada visita; ahora la cookie solo
//   guarda el tema y, si quedaba una antigua con claves, se sobrescribe al arrancar)
// Además se pide al navegador almacenamiento persistente y se puede exportar un código de copia.
const KEY = 'iip.config.v1';
const COOKIE = 'iipcfg';
const BASE = (location.pathname.match(/^\/[^/]+\//) || ['/'])[0]; // p. ej. /investment-intelligence-pro/

const DEFAULTS = {
  fmpKey: '', avKey: '', finnhubKey: '', tdKey: '', roicKey: '',
  proxyUrl: '',
  theme: 'dark',
  limits: { fmp: 250, av: 25, td: 800, finnhub: 0, roic: 0, sec: 0, esef: 0 },
  cacheHours: { quote: 0.1, prices: 6, fundamentals: 24, static: 168 },
};
export const KEYS = { fmp: 'fmpKey', av: 'avKey', finnhub: 'finnhubKey', td: 'tdKey', roic: 'roicKey' };
const SECRET_FIELDS = ['fmpKey', 'avKey', 'finnhubKey', 'tdKey', 'roicKey', 'proxyUrl'];

// ---------- copias de seguridad ----------
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));
function readCookie() {
  try { const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)')); return m ? dec(decodeURIComponent(m[1])) : null; } catch { return null; }
}
function writeCookie(o) {
  try {
    const slim = { theme: o.theme }; // nunca claves en una cookie: viajarían a GitHub con cada petición
    document.cookie = `${COOKIE}=${encodeURIComponent(enc(slim))}; max-age=${60 * 60 * 24 * 3650}; path=${BASE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {}
}
function idb(mode, value) {
  return new Promise((res) => {
    try {
      const r = indexedDB.open('iip-config', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => res(null);
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite').objectStore('kv');
        const q = mode === 'get' ? tx.get('config') : tx.put(value, 'config');
        q.onsuccess = () => res(mode === 'get' ? q.result || null : true);
        q.onerror = () => res(null);
      };
    } catch { res(null); }
  });
}
const hasSecrets = (o) => !!o && SECRET_FIELDS.some((k) => o[k]);

function readLocal() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

function normalize(s) {
  s = s || {};
  const limits = { ...DEFAULTS.limits, ...(s.limits || {}) };
  if (s.fmpDailyLimit) limits.fmp = s.fmpDailyLimit;
  if (s.avDailyLimit) limits.av = s.avDailyLimit;
  return { ...DEFAULTS, ...s, limits, cacheHours: { ...DEFAULTS.cacheHours, ...(s.cacheHours || {}) } };
}

// Claves incrustadas al publicar desde GitHub (secretos del repositorio). Las que escribas en Ajustes tienen prioridad.
const ENV = (typeof window !== 'undefined' && window.__IIP_KEYS) || {};
function withEnv(o) { const r = { ...o }; for (const k of SECRET_FIELDS) if (!r[k] && ENV[k]) r[k] = ENV[k]; return r; }

function read() {
  let s = readLocal();
  if (!hasSecrets(s)) { const c = readCookie(); if (hasSecrets(c)) { s = { ...(s || {}), ...c }; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} } }
  return withEnv(normalize(s));
}

function persist(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {}
  writeCookie(o);
  idb('put', o);
}

/** Al arrancar: si faltan las claves, se recuperan de IndexedDB o de la cookie. Devuelve true si restauró. */
export async function restoreConfig() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  const local = readLocal();
  if (hasSecrets(local)) { idb('put', local); writeCookie(local); return false; } // refresca las copias
  const fromDb = await idb('get');
  const fromCookie = readCookie();
  const best = hasSecrets(fromDb) ? fromDb : hasSecrets(fromCookie) ? { ...(local || {}), ...fromCookie } : null;
  if (best) { persist(best); return true; }
  return false;
}

/** Código de copia de seguridad de las claves (para guardarlo en notas o en otro dispositivo). */
export function exportKeysCode() { const c = read(); return 'IIP1:' + enc(Object.fromEntries(SECRET_FIELDS.map((k) => [k, c[k] || '']))); }
export function importKeysCode(code) {
  const t = String(code || '').trim(); if (!t.startsWith('IIP1:')) throw new Error('Código no válido');
  const o = dec(t.slice(5)); if (!hasSecrets(o)) throw new Error('El código no contiene claves');
  config.set(o); return o;
}

export const config = {
  get() { return read(); },
  set(patch) {
    const next = { ...read(), ...patch };
    const own = { ...next }; for (const k of SECRET_FIELDS) if (ENV[k] && own[k] === ENV[k]) own[k] = ''; // las de GitHub no se copian
    persist(own); return next;
  },
  canUse(p) {
    const c = read();
    if (p === 'sec') return !!c.proxyUrl;
    if (p === 'esef') return true;
    return !!(c.proxyUrl || c[KEYS[p]]);
  },
  hasData() { const c = read(); return !!(c.proxyUrl || Object.values(KEYS).some((k) => c[k])); },
};
