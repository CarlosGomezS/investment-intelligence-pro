// Configuración del usuario: claves de API, proxy opcional y preferencias.
// Las claves se guardan SOLO en el navegador del usuario (localStorage), nunca en el repositorio.
const KEY = 'iip.config.v1';

const DEFAULTS = {
  fmpKey: '', avKey: '', finnhubKey: '', tdKey: '', roicKey: '',
  proxyUrl: '',          // Cloudflare Worker: guarda las claves en el servidor y da acceso a SEC EDGAR y ESEF
  theme: 'dark',
  limits: { fmp: 250, av: 25, td: 800, finnhub: 0, roic: 0, sec: 0, esef: 0 },   // diarios (0 = sin tope diario)
  cacheHours: { quote: 0.1, prices: 6, fundamentals: 24, static: 168 },
};

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    // compatibilidad con la versión anterior
    const limits = { ...DEFAULTS.limits, ...(s.limits || {}) };
    if (s.fmpDailyLimit) limits.fmp = s.fmpDailyLimit;
    if (s.avDailyLimit) limits.av = s.avDailyLimit;
    return { ...DEFAULTS, ...s, limits, cacheHours: { ...DEFAULTS.cacheHours, ...(s.cacheHours || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}

export const KEYS = { fmp: 'fmpKey', av: 'avKey', finnhub: 'finnhubKey', td: 'tdKey', roic: 'roicKey' };

export const config = {
  get() { return read(); },
  set(patch) {
    const next = { ...read(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* almacenamiento lleno o bloqueado */ }
    return next;
  },
  /** ¿Puede usarse este proveedor ahora? (clave propia o proxy; SEC/ESEF requieren proxy) */
  canUse(p) {
    const c = read();
    if (p === 'sec') return !!c.proxyUrl;
    if (p === 'esef') return true;
    return !!(c.proxyUrl || c[KEYS[p]]);
  },
  hasData() { const c = read(); return !!(c.proxyUrl || Object.values(KEYS).some((k) => c[k])); },
};
