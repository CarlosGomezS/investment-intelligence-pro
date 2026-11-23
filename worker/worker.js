// Backend seguro opcional: Cloudflare Worker que actúa de proxy hacia todos los proveedores.
// - Las claves viven como secretos del Worker, nunca en el navegador.
// - Solo acepta peticiones de los orígenes configurados (ALLOWED_ORIGIN).
// - Caché en el borde (Cache API) con TTL por tipo de dato: muchas consultas repetidas no gastan cuota.
// - Límite sencillo por IP y minuto.
// - Da acceso a SEC EDGAR y filings.xbrl.org, que no admiten llamadas directas desde el navegador.
//
// Rutas: /fmp/<endpoint>  /av/?function=…  /finnhub/<endpoint>  /td/<endpoint>  /roic/<endpoint>
//        /sec/files/…  /sec/submissions/…  /sec/api/xbrl/…  /esef/<ruta>

const UPSTREAM = {
  fmp: { base: 'https://financialmodelingprep.com/stable/', key: 'apikey', secret: 'FMP_KEY' },
  av: { base: 'https://www.alphavantage.co/query', key: 'apikey', secret: 'AV_KEY', flat: true },
  finnhub: { base: 'https://finnhub.io/api/v1/', key: 'token', secret: 'FINNHUB_KEY' },
  td: { base: 'https://api.twelvedata.com/', key: 'apikey', secret: 'TD_KEY' },
  roic: { base: 'https://api.roic.ai/v2/', key: 'apikey', secret: 'ROIC_KEY' },
  esef: { base: 'https://filings.xbrl.org/', ua: true },
};
const TTL = [[/quote|price-change|historical-chart|stock-prices\/latest/, 300], [/historical-price|time_series|stock-prices/, 6 * 3600], [/news/, 1800], [/company_tickers|submissions/, 7 * 86400], [/profile/, 86400], [/companyfacts|\.json$/, 86400]];
const hits = new Map();

function cors(origin, allowed) {
  const ok = allowed === '*' || allowed.split(',').map((s) => s.trim()).includes(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin || '*' : 'null', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
}
const json = (o, status, H) => new Response(JSON.stringify(o), { status, headers: { ...H, 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const H = cors(req.headers.get('Origin') || '', env.ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405, H);
    if (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' && H['Access-Control-Allow-Origin'] === 'null') return json({ error: 'Origen no permitido' }, 403, H);

    const ip = req.headers.get('CF-Connecting-IP') || 'x', k = ip + ':' + Math.floor(Date.now() / 60000);
    hits.set(k, (hits.get(k) || 0) + 1); if (hits.size > 5000) hits.clear();
    if (hits.get(k) > 240) return json({ error: 'rate limit' }, 429, H);

    const [, provider, ...rest] = url.pathname.split('/');
    const path = rest.join('/');
    if (!/^[A-Za-z0-9\-\/._%]*$/.test(path) || /(^|\/)\.\.(\/|$)|%2e%2e/i.test(path)) return json({ error: 'Ruta no válida' }, 400, H);
    const params = new URLSearchParams(url.search);
    for (const k2 of ['apikey', 'token']) params.delete(k2);
    let upstream, init = {};
    if (provider === 'sec') {
      const host = path.startsWith('files/') ? 'https://www.sec.gov/' : 'https://data.sec.gov/';
      upstream = host + path;
      init = { headers: { 'User-Agent': env.SEC_USER_AGENT || 'InvestmentIntelligencePro contacto@example.com', Accept: 'application/json' } };
    } else if (UPSTREAM[provider]) {
      const U = UPSTREAM[provider];
      if (U.secret) { if (!env[U.secret]) return json({ error: `Falta el secreto ${U.secret} en el Worker` }, 401, H); params.set(U.key, env[U.secret]); }
      upstream = U.flat ? `${U.base}?${params}` : `${U.base}${path}${[...params].length ? '?' + params : ''}`;
      if (U.ua) init = { headers: { 'User-Agent': env.SEC_USER_AGENT || 'InvestmentIntelligencePro contacto@example.com' } };
    } else return json({ error: 'Proveedor desconocido' }, 404, H);

    // Alpha Vantage lleva el tipo de dato en ?function=, no en la ruta
    const what = provider === 'av' ? `${path} ${url.searchParams.get('function') || ''}`.toLowerCase() : path;
    const ttl = provider === 'av' && /global_quote|intraday/.test(what) ? 300 : (TTL.find(([re]) => re.test(what)) || [0, 86400])[1];
    const pub = new URLSearchParams(url.search); pub.delete('apikey'); pub.delete('token');
    const cacheKey = new Request(`https://cache.iip/${provider}/${path}?${pub}`);
    const cache = caches.default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const r = await fetch(upstream, init);
      const text = await r.text();
      res = new Response(text, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
      // Varias fuentes devuelven errores (límite, plan, clave) con HTTP 200: esos no se guardan en caché
      const isErr = /"(Error Message|Information|Note)"\s*:|"status"\s*:\s*"error"|"error"\s*:|Limit Reach|Premium Query|don't have access/i.test(text.slice(0, 600));
      if (r.ok && !isErr && text.length > 2) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [a, b] of Object.entries(H)) out.headers.set(a, b);
    return out;
  },
};
