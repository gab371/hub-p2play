/**
 * Allowlisted GitHub proxy for hub-p2play live game downloads (GitHub Pages).
 *
 * GET /api/github-proxy?url=<https://…>
 * Only: api.github.com, github.com, objects.githubusercontent.com, release-assets.githubusercontent.com
 *
 * Optional secret: GITHUB_TOKEN (Workers → Settings → Variables / Secrets)
 */

const ALLOWED_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function isAllowedGithubUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);

    if (reqUrl.pathname !== "/api/github-proxy" && reqUrl.pathname !== "/") {
      return json(404, { error: "Not found" });
    }

    // Allow both / and /api/github-proxy so either can be used as VITE_GITHUB_PROXY_URL
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return json(405, { error: "Method not allowed" });
    }

    const targetParam = reqUrl.searchParams.get("url");
    if (!targetParam) {
      return json(400, { error: "Missing url parameter" });
    }

    let targetUrl;
    try {
      targetUrl = decodeURIComponent(targetParam);
    } catch {
      return json(400, { error: "Invalid url parameter" });
    }

    if (!isAllowedGithubUrl(targetUrl)) {
      return json(403, { error: "URL host not allowlisted (GitHub only)" });
    }

    const accept = request.headers.get("Accept") || "application/octet-stream";
    const headers = {
      "User-Agent": "P2Play-Hub-GitHub-Proxy",
      Accept: accept,
    };
    if (env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    const upstream = await fetch(targetUrl, {
      headers,
      redirect: "follow",
    });

    if (upstream.url && !isAllowedGithubUrl(upstream.url)) {
      return json(403, { error: "Redirect target not allowlisted" });
    }

    const outHeaders = new Headers(corsHeaders());
    outHeaders.set("Cache-Control", "no-store");
    const contentType = upstream.headers.get("Content-Type");
    if (contentType) outHeaders.set("Content-Type", contentType);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  },
};
