import path from "path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

const GITHUB_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
])

function isAllowedGithubUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "https:" && GITHUB_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Dev/preview allowlisted proxy for GitHub API + release assets (SSRF-safe). */
function githubProxyPlugin(): Plugin {
  const handler = async (req: any, res: any): Promise<boolean> => {
    try {
      const reqUrl = new URL(req.url!, `http://${req.headers.host || "localhost"}`)
      if (!reqUrl.pathname.startsWith("/api/github-proxy")) return false

      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Accept")
        res.statusCode = 204
        res.end()
        return true
      }

      if (req.method !== "GET") {
        res.statusCode = 405
        res.end(JSON.stringify({ error: "Method not allowed" }))
        return true
      }

      const urlParam = reqUrl.searchParams.get("url")
      if (!urlParam) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "Missing url parameter" }))
        return true
      }

      let targetUrl: string
      try {
        targetUrl = decodeURIComponent(urlParam)
      } catch {
        res.statusCode = 400
        res.end(JSON.stringify({ error: "Invalid url parameter" }))
        return true
      }

      if (!isAllowedGithubUrl(targetUrl)) {
        res.statusCode = 403
        res.end(JSON.stringify({ error: "URL host not allowlisted (GitHub only)" }))
        return true
      }

      const acceptHeader =
        (typeof req.headers.accept === "string" && req.headers.accept) ||
        "application/octet-stream"

      const headers: Record<string, string> = {
        "User-Agent": "P2Play-Hub-App",
        Accept: acceptHeader,
      }
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      }

      const response = await fetch(targetUrl, { headers, redirect: "follow" })
      if (response.url && !isAllowedGithubUrl(response.url)) {
        res.statusCode = 403
        res.end(JSON.stringify({ error: "Redirect target not allowlisted" }))
        return true
      }

      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Cache-Control", "no-store")
      res.statusCode = response.status
      const contentType = response.headers.get("content-type")
      if (contentType) res.setHeader("Content-Type", contentType)
      res.end(Buffer.from(await response.arrayBuffer()))
      return true
    } catch (err: unknown) {
      console.error("[github-proxy] Error:", err)
      res.statusCode = 500
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Proxy error" }))
      return true
    }
  }

  return {
    name: "github-proxy-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(await handler(req, res))) next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(await handler(req, res))) next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), githubProxyPlugin()],
  resolve: {
    // file:../p2play-core brings its own node_modules/react — force one copy
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
