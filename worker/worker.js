// Backend seguro opcional: Cloudflare Worker que actúa de proxy hacia los proveedores.
// - Las claves viven como secretos del Worker (FMP_KEY, AV_KEY), nunca en el navegador.
// - Solo acepta peticiones del origen configurado (ALLOWED_ORIGIN).
// - Caché en el borde con la Cache API (TTL por tipo de ruta).
// - Límite sencillo por IP y minuto.
// - Ruta /sec/* para SEC EDGAR (exige User-Agent y no admite CORS desde el navegador).
//
// Rutas: /fmp/<endpoint>?<params>   /av/?function=...   /sec/<ruta de data.sec.gov>

const TTL = { quote: 300, 'stock-price-change': 300, 'historical-chart': 300, 'historical-price-eod': 6 * 3600, news: 1800, default: 24 * 3600 };
const hits = new Map();

function cors(origin, allowed) {
  const ok = allowed === '*' || allowed.split(',').map((s) => s.trim()).includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : 'null', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const H = cors(origin, env.ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    if (req.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: H });
    if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' && H['Access-Control-Allow-Origin'] === 'null') return new Response('Origen no permitido', { status: 403, headers: H });

    // límite por IP: 120 peticiones/minuto
    const ip = req.headers.get('CF-Connecting-IP') || 'x', minute = Math.floor(Date.now() / 60000), k = ip + ':' + minute;
    hits.set(k, (hits.get(k) || 0) + 1);
    if (hits.size > 5000) hits.clear();
    if (hits.get(k) > 120) return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429, headers: { ...H, 'Content-Type': 'application/json' } });

    const [, provider, ...rest] = url.pathname.split('/');
    const path = rest.join('/');
    let upstream, init = {};
    const params = new URLSearchParams(url.search); params.delete('apikey');
    if (provider === 'fmp') {
      if (!/^[a-z0-9\-\/]+$/i.test(path)) return new Response('Ruta no válida', { status: 400, headers: H });
      params.set('apikey', env.FMP_KEY);
      upstream = `https://financialmodelingprep.com/stable/${path}?${params}`;
    } else if (provider === 'av') {
      params.set('apikey', env.AV_KEY);
      upstream = `https://www.alphavantage.co/query?${params}`;
    } else if (provider === 'sec') {
      if (!/^[a-z0-9\-\/._]+$/i.test(path)) return new Response('Ruta no válida', { status: 400, headers: H });
      upstream = `https://data.sec.gov/${path}`;
      init = { headers: { 'User-Agent': env.SEC_USER_AGENT || 'InvestmentIntelligencePro contacto@example.com', Accept: 'application/json' } };
    } else return new Response('Proveedor desconocido', { status: 404, headers: H });

    const ttl = TTL[Object.keys(TTL).find((p) => path.startsWith(p))] || TTL.default;
    const cacheKey = new Request(`https://cache.iip/${provider}/${path}?${new URLSearchParams(url.search)}`);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const r = await fetch(upstream, init);
      res = new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
      if (r.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [a, b] of Object.entries(H)) out.headers.set(a, b);
    return out;
  },
};
