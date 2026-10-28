/**
 * Cloudflare Workers（Workers + Static Assets）版本，与 functions/[[path]].js 等价。
 * 部署要求：
 *   wrangler.json 需包含 "main": "index.js" 与 assets binding = "ASSETS"
 *   且 "assets": { "directory": ".", "binding": "ASSETS", "run_worker_first": true }
 * 否则 / 会被静态资源抢先处理，POST 直接 405。
 */

const DROP_REQ_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "accept-encoding",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
]);

const DROP_RES_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "set-cookie",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = resolveTarget(url);

    if (!target) {
      if (url.pathname === "/proxy" || url.pathname === "/proxy/") {
        return json({ ok: true, service: "cors-proxy", usage: "/proxy?url=<encoded target>" }, 200);
      }
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("not found", { status: 404 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
      if (!/^https?:$/.test(targetUrl.protocol)) throw new Error("protocol");
    } catch {
      return json({ ok: false, error: `invalid target url: ${target}` }, 400);
    }

    const headers = new Headers();
    for (const [key, value] of request.headers) {
      if (DROP_REQ_HEADERS.has(key.toLowerCase())) continue;
      headers.set(key, value);
    }
    const overrideReferer = request.headers.get("x-proxy-referer");
    if (overrideReferer) headers.set("referer", overrideReferer);
    const overrideOrigin = request.headers.get("x-proxy-origin");
    if (overrideOrigin) headers.set("origin", overrideOrigin);
    if (!headers.has("user-agent")) {
      headers.set(
        "user-agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40",
      );
    }

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      const reason = String(error && error.message ? error.message : error);
      return json(
        { ok: false, error: "upstream fetch failed", target: targetUrl.toString(), reason },
        502,
      );
    }

    const outHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      if (DROP_RES_HEADERS.has(key.toLowerCase())) continue;
      outHeaders.set(key, value);
    }
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    outHeaders.set("Access-Control-Allow-Headers", "*");
    outHeaders.set("Access-Control-Expose-Headers", "*");
    outHeaders.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};

function resolveTarget(url) {
  const q = url.searchParams.get("url");
  if (q) return q;
  const raw = url.pathname.replace(/^\/+/, "");
  if (/^https?:/i.test(raw)) {
    const decoded = decodeURIComponent(raw);
    return url.search ? decoded + url.search : decoded;
  }
  return null;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}
