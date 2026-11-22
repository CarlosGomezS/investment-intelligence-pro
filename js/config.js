// Configuración del usuario: claves de API, proxy opcional y preferencias.
// Las claves se guardan SOLO en el navegador del usuario (localStorage), nunca en el repositorio.
const KEY = 'iip.config.v1';

const DEFAULTS = {
  fmpKey: '',
  avKey: '',
  proxyUrl: '',          // URL del Cloudflare Worker (modo seguro: las claves viven en el backend)
  theme: 'dark',
  fmpDailyLimit: 250,    // plan gratuito de FMP
  avDailyLimit: 25,      // plan gratuito de Alpha Vantage
  cacheHours: { quote: 0.1, prices: 6, fundamentals: 24, static: 168 },
};

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export const config = {
  get() { return read(); },
  set(patch) {
    const next = { ...read(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* almacenamiento lleno o bloqueado */ }
    return next;
  },
  hasData() { const c = read(); return !!(c.fmpKey || c.avKey || c.proxyUrl); },
};
