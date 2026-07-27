# Cloudflare Worker — GitHub proxy (hub-p2play live games)

Allowlisted reverse proxy so the Hub on **GitHub Pages** can download release `dist.zip` files.

## Recommended: deploy from GitHub Actions (URL never committed)

1. Create a Cloudflare API token: [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → template **Edit Cloudflare Workers**.
2. In the Hub repo → **Settings** → **Secrets and variables** → **Actions**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID` (dashboard → Workers → overview / account id)
3. Push to `main`. The deploy workflow:
   - runs `wrangler deploy` for `workers/github-proxy`
   - passes the worker URL into `vite build` as `VITE_GITHUB_PROXY_URL`
   - nothing proxy-related is stored in git

If those two secrets are missing, Live games stay off (unless you set optional fallback secret `VITE_GITHUB_PROXY_URL`).

### Hide your name (no `prenom-nom.workers.dev`)

The default URL looks like `https://p2play-github-proxy.<subdomain>.workers.dev` — `<subdomain>` is often your name.

**Option A — Custom domain (recommended)**  
1. Domain managed in the same Cloudflare account  
2. Worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain**  
   e.g. `gh-proxy.p2play.app`  
   or uncomment `[[routes]]` / `custom_domain` in `wrangler.toml` and redeploy  
3. GitHub Action secret `VITE_GITHUB_PROXY_URL` =  
   `https://gh-proxy.p2play.app/api/github-proxy`  
   (this secret **wins** over the auto `*.workers.dev` URL in CI)

**Option B — Rename workers.dev subdomain**  
Cloudflare dashboard → **Workers & Pages** → account subdomain setting (change to something neutral like `p2play`). Not always offered / may be one-shot.

Optional Worker secret (rate limits): configure `GITHUB_TOKEN` in the Cloudflare dashboard on the worker, or:

```bash
cd workers/github-proxy
npx wrangler secret put GITHUB_TOKEN
```

## Manual deploy (local)

```bash
cd workers/github-proxy
npx wrangler login
npx wrangler deploy
```

Then either rely on CI auto-deploy above, or set Action secret `VITE_GITHUB_PROXY_URL` to  
`https://p2play-github-proxy.<account>.workers.dev/api/github-proxy`.

## Contract

`GET {proxy}/api/github-proxy?url=<encoded https URL>`

Allowed hosts only: `api.github.com`, `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`.

> The proxy URL is still embedded in the public Hub JS after build (normal for `VITE_*`). Secrets keep credentials + config out of **git**, not out of the browser bundle.
