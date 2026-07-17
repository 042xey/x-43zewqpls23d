export interface WorkerConfig {
  template: string;
  clientAlias: string;
  apiServerUrl: string;
  frontendUrl: string;
}

export function generateWorkerScript(config: WorkerConfig): string {
  const apiUrl = config.apiServerUrl.replace(/\/$/, "");
  const frontendUrl = config.frontendUrl.replace(/\/$/, "");

  return `// Rate limits are enforced with the Workers Cache API, keyed by client IP + route,
// so no extra KV/Durable Object bindings are required to deploy this worker.
const RATE_LIMITS = {
  generatecode: { max: 1, windowMs: 86400000 },
  regeneratecode: { max: 3, windowMs: 86400000 },
};

async function checkRateLimit(request, routeKey) {
  const limit = RATE_LIMITS[routeKey];
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cacheKey = new Request('https://rate-limit.internal/' + routeKey + '/' + ip);
  const cache = caches.default;
  const now = Date.now();

  let state = { count: 0, reset: now + limit.windowMs };
  const cached = await cache.match(cacheKey);
  if (cached) {
    const cachedState = await cached.json();
    if (now < cachedState.reset) {
      state = cachedState;
    }
  }

  state.count += 1;
  const allowed = state.count <= limit.max;
  const retryAfterSeconds = Math.max(1, Math.ceil((state.reset - now) / 1000));

  await cache.put(cacheKey, new Response(JSON.stringify(state), {
    headers: { 'Cache-Control': 'max-age=' + Math.ceil(limit.windowMs / 1000) },
  }));

  return {
    allowed,
    remaining: Math.max(0, limit.max - state.count),
    reset: state.reset,
    retryAfterSeconds,
  };
}

function rateLimitedResponse(rateLimit) {
  return Response.json(
    { error: 'Rate limit exceeded. Please try again later.', retryAfterSeconds: rateLimit.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Retry-After': String(rateLimit.retryAfterSeconds),
      },
    }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const API_ORIGIN = ${JSON.stringify(apiUrl)};
    const FRONTEND_ORIGIN = ${JSON.stringify(frontendUrl)};
    const TEMPLATE = ${JSON.stringify(config.template)};
    const CLIENT_ALIAS = ${JSON.stringify(config.clientAlias)};

    // Intercept /api/template — return the worker-configured template
    // so the React frontend's built-in branding system renders the right header SVG
    if (url.pathname === '/api/template' && request.method === 'GET') {
      return Response.json({ template: TEMPLATE }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Intercept /api/generatecode — enforce the configured client alias
    if (url.pathname === '/api/generatecode' && request.method === 'GET') {
      const rateLimit = await checkRateLimit(request, 'generatecode');
      if (!rateLimit.allowed) {
        return rateLimitedResponse(rateLimit);
      }
      try {
        const targetUrl = new URL(API_ORIGIN + '/api/generatecode');
        targetUrl.searchParams.set('app', CLIENT_ALIAS);
        const res = await fetch(targetUrl.toString(), { cf: { cacheEverything: false } });
        const data = await res.json();
        return Response.json(data, {
          status: res.ok ? 200 : res.status,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return Response.json({ error: 'Failed to reach API server' }, { status: 502 });
      }
    }

    // Intercept /api/regeneratecode — proxy with configured client alias
    if (url.pathname === '/api/regeneratecode' && request.method === 'POST') {
      const rateLimit = await checkRateLimit(request, 'regeneratecode');
      if (!rateLimit.allowed) {
        return rateLimitedResponse(rateLimit);
      }
      try {
        const res = await fetch(API_ORIGIN + '/api/regeneratecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app: CLIENT_ALIAS }),
        });
        const data = await res.json();
        return Response.json(data, {
          status: res.ok ? 200 : res.status,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return Response.json({ error: 'Failed to reach API server' }, { status: 502 });
      }
    }

    // Transparent proxy — mirror everything else (HTML, assets, other API routes)
    // through the configured frontend URL
    try {
      const proxyUrl = FRONTEND_ORIGIN + url.pathname + url.search;
      const proxyInit = {
        method: request.method,
        headers: request.headers,
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
        redirect: 'follow',
      };
      const originRes = await fetch(proxyUrl, proxyInit);
      return new Response(originRes.body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers: originRes.headers,
      });
    } catch (e) {
      return new Response('502 Bad Gateway — could not reach origin', { status: 502 });
    }
  },
};`;
}
