/**
 * Cloudflare Pages Function —— 通用 CORS 反向代理（修正版）
 *
 * 入口（推荐）：/proxy?url=<encodeURIComponent(target)>
 * 兼容旧入口：/?url=<...>   （注意：只有带 url 参数时才当代理，否则交给静态资源）
 *
 * 关键修正：
 * 1. 不再把 "/" 无条件放行给静态资源 —— 旧版对 POST /?url=... 直接返回 405，
 *    对 GET /?url=... 直接返回 index.html（前端因此报“代理异常”）。
 * 2. POST/PUT/PATCH 的 body 完整透传（用 arrayBuffer，二进制安全）。
 * 3. 剔除 host / content-length / accept-encoding 等禁止或会破坏链路的头。
 * 4. 剥离上游 content-encoding / content-length —— Workers 已自动解压 body，
 *    再透传这两个头浏览器会解码失败。
 * 5. 20s 超时 + 明确错误体，失败时给出可诊断原因。
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

const TIMEOUT_MS = 20000;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = resolveTarget(url);

  // 没有代理目标：GET/HEAD 交给静态资源（首页、logo 等），其他方法明确报错而不是 405
  if (!target) {
    // /proxy 是专用代理入口：缺少 url 时明确报错，便于用浏览器判断函数是否真的部署成功
    if (url.pathname === "/proxy" || url.pathname === "/proxy/") {
      return json(
        { ok: true, service: "cors-proxy", usage: "/proxy?url=<encoded target>" },
        200,
      );
    }
    if (request.method === "GET" || request.method === "HEAD") {
      return context.next();
    }
    return json(
      { ok: false, error: "missing target", hint: "/proxy?url=<encoded>" },
      400,
    );
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
  // 允许调用方通过自定义头覆盖上游 Referer / Origin（浏览器端无法直接设置）
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = String(error && error.message ? error.message : error);
    const port = targetUrl.port;
    const hint = /port|not allowed/i.test(reason)
      ? `Cloudflare 出站仅允许常用端口（80/443 等），目标端口 ${port || "默认"} 不可达`
      : /timeout|abort/i.test(reason)
        ? "目标 20s 无响应（境内站点对 CF 出口 IP 常直接丢弃）"
        : "目标不可达 / DNS 失败 / 被 WAF 直接断开";
    return json(
      { ok: false, error: "upstream fetch failed", target: targetUrl.toString(), reason, hint },
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
  outHeaders.set("Access-Control-Max-Age", "86400");
  outHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
  outHeaders.set("X-Proxy-Target", targetUrl.toString());

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

function resolveTarget(url) {
  const q = url.searchParams.get("url");
  if (q) return q;
  // 路径形式：/https://example.com/path （CF 可能折叠 //，仅作兜底）
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
