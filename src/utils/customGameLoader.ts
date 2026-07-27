/**
 * Live GitHub custom games — fetch release dist.zip, cache, expose blob URLs for Hub mount.
 * Types that sync over the wire live in `network/protocol.ts`.
 */

import { unzipSync } from "fflate";
import { HUB_GAME_MANIFEST_FILENAME, defaultHubMountFnName } from "p2play-core";
import type { HubGameManifest } from "p2play-core";
import type { CustomGameMeta } from "../network/protocol";

export type { CustomGameMeta };

const STORAGE_KEY = "p2play_custom_games";
const DB_NAME = "P2PlayCustomGamesDB";
const DB_STORE = "bundles";
const KEY_PREFIX = "custom--";
const KEY_SEP = "--";

const ALLOWED_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

type CachedBundle = { jsCode: string; cssCode?: string | null };

const activeBlobUrls = new Map<string, { jsBlobUrl: string; cssBlobUrl?: string | null }>();

export function customGameKey(owner: string, repo: string): string {
  return `${KEY_PREFIX}${owner.toLowerCase()}${KEY_SEP}${repo.toLowerCase()}`;
}

export function isCustomGameKey(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) return false;
  const rest = key.slice(KEY_PREFIX.length);
  const idx = rest.indexOf(KEY_SEP);
  return idx > 0 && idx < rest.length - KEY_SEP.length;
}

export function parseGithubUrl(input: string): { owner: string; repo: string; version?: string } {
  let clean = input.trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");

  if (clean.includes("/releases/tag/")) {
    const [repoPart, tag] = clean.split("/releases/tag/");
    const [owner, repo] = repoPart.split("/");
    if (!owner || !repo || !tag) throw new Error("Format d'URL GitHub invalide (releases/tag).");
    return { owner, repo, version: tag };
  }
  if (clean.includes("@")) {
    const [repoPart, verPart] = clean.split("@");
    const [owner, repo] = repoPart.split("/");
    if (!owner || !repo || !verPart) throw new Error("Format d'URL GitHub invalide (owner/repo@version).");
    return { owner, repo, version: verPart };
  }
  const parts = clean.split("/").filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  throw new Error('Format d\'URL GitHub invalide. Utilisez "owner/repo" ou "https://github.com/owner/repo".');
}

export function isAllowedGithubUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function fetchGithubResource(url: string, accept = "application/octet-stream"): Promise<Response> {
  if (!isAllowedGithubUrl(url)) throw new Error(`URL GitHub non autorisée: ${url}`);

  if (url.startsWith("https://api.github.com/")) {
    try {
      const res = await fetch(url, {
        headers: { Accept: accept.includes("json") ? accept : "application/vnd.github+json" },
      });
      if (res.ok) return res;
    } catch { /* fall through */ }
  }

  const proxies = [
    (import.meta.env.VITE_GITHUB_PROXY_URL as string | undefined)?.trim()?.replace(/\/$/, ""),
    "/api/github-proxy",
  ].filter(Boolean) as string[];

  for (const base of proxies) {
    try {
      const res = await fetch(`${base}?url=${encodeURIComponent(url)}`, { headers: { Accept: accept } });
      if (res.ok) return res;
      if (res.status === 404 || res.status === 405) continue;
    } catch { /* try next */ }
  }

  try {
    const res = await fetch(url, { headers: { Accept: accept } });
    if (res.ok) return res;
  } catch { /* */ }

  throw new Error(
    `Impossible de télécharger ${url}. En production, configurez VITE_GITHUB_PROXY_URL (proxy GitHub allowlisté).`,
  );
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB not supported"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

async function saveBundle(key: string, bundle: CachedBundle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(bundle, key);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error ?? new Error("IndexedDB write failed"));
    });
  } catch (err) {
    console.warn("[customGameLoader] IndexedDB write failed:", err);
  }
}

async function getBundle(key: string): Promise<CachedBundle | null> {
  try {
    const db = await openDB();
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    return await new Promise((res) => {
      req.onsuccess = () => res((req.result as CachedBundle) || null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function deleteBundle(key: string): Promise<void> {
  try {
    const db = await openDB();
    db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(key);
  } catch { /* ignore */ }
}

function createBlobUrls(key: string, bundle: CachedBundle) {
  const existing = activeBlobUrls.get(key);
  if (existing) return existing;
  const jsBlobUrl = URL.createObjectURL(new Blob([bundle.jsCode], { type: "text/javascript" }));
  const cssBlobUrl = bundle.cssCode
    ? URL.createObjectURL(new Blob([bundle.cssCode], { type: "text/css" }))
    : null;
  const res = { jsBlobUrl, cssBlobUrl };
  activeBlobUrls.set(key, res);
  return res;
}

export function loadStoredCustomGames(): CustomGameMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is CustomGameMeta =>
        !!g && g.isCustom === true && typeof g.key === "string" && typeof g.repo === "string",
    );
  } catch {
    return [];
  }
}

export function saveCustomGameToStorage(game: CustomGameMeta): CustomGameMeta[] {
  const current = loadStoredCustomGames();
  const idx = current.findIndex((g) => g.key === game.key);
  if (idx >= 0) current[idx] = game;
  else current.push(game);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error("Failed to save custom game:", e);
  }
  return current;
}

export function mergeCustomGamesIntoStorage(games: CustomGameMeta[]): CustomGameMeta[] {
  let current = loadStoredCustomGames();
  for (const game of games) current = saveCustomGameToStorage(game);
  return current;
}

export function removeCustomGameFromStorage(key: string): CustomGameMeta[] {
  const current = loadStoredCustomGames().filter((g) => g.key !== key);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
  void deleteBundle(key);
  activeBlobUrls.delete(key);
  return current;
}

function pickZipEntry(
  files: Record<string, Uint8Array>,
  prefer: (lower: string) => boolean,
): Uint8Array | null {
  for (const name of Object.keys(files)) {
    if (name.endsWith("/")) continue;
    if (prefer(name.replace(/\\/g, "/").toLowerCase())) return files[name];
  }
  return null;
}

function decode(data: Uint8Array) {
  return new TextDecoder("utf-8").decode(data);
}

function mountFnFromManifest(manifest: HubGameManifest | null, repoSlug: string): string {
  if (manifest?.mountFn?.trim()) return manifest.mountFn.trim();
  if (manifest?.key?.trim()) return defaultHubMountFnName(manifest.key);
  const repoName = repoSlug.split("/")[1] || "Game";
  const camel = repoName.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
  return `mount${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

export function resolveCustomMountFnName(meta: CustomGameMeta): string {
  return meta.mountFn?.trim() || mountFnFromManifest(null, meta.repo);
}

export async function fetchAndPrepareCustomGame(
  urlInput: string,
  onProgress?: (msg: string) => void,
): Promise<{ meta: CustomGameMeta; jsBlobUrl: string; cssBlobUrl?: string | null }> {
  const { owner, repo, version: requestedVersion } = parseGithubUrl(urlInput);
  const repoSlug = `${owner}/${repo}`;
  const key = customGameKey(owner, repo);

  onProgress?.("Recherche de la release GitHub…");
  const apiUrl = requestedVersion
    ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${requestedVersion}`
    : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const releaseData = await (await fetchGithubResource(apiUrl, "application/vnd.github+json")).json();
  if (!releaseData?.tag_name) throw new Error(`Release GitHub introuvable pour ${repoSlug}`);

  const tag = releaseData.tag_name as string;
  const title = (releaseData.name as string) || repoSlug;
  const zipAsset = Array.isArray(releaseData.assets)
    ? releaseData.assets.find(
        (a: { name?: string; browser_download_url?: string }) =>
          a.name && (a.name.toLowerCase() === "dist.zip" || a.name.toLowerCase().endsWith(".zip")),
      )
    : null;
  const downloadUrl =
    zipAsset?.browser_download_url ||
    `https://github.com/${owner}/${repo}/releases/download/${tag}/${zipAsset?.name || "dist.zip"}`;

  onProgress?.(`Téléchargement du bundle (${tag})…`);
  const zipBuf = await (await fetchGithubResource(downloadUrl)).arrayBuffer();

  onProgress?.("Extraction du bundle dist.zip…");
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(zipBuf));
  } catch {
    throw new Error("Impossible d'extraire dist.zip (fichier invalide ou corrompu).");
  }

  let manifest: HubGameManifest | null = null;
  const manifestBytes = pickZipEntry(
    unzipped,
    (l) => l.endsWith(`/${HUB_GAME_MANIFEST_FILENAME}`) || l === HUB_GAME_MANIFEST_FILENAME,
  );
  if (manifestBytes) {
    try {
      manifest = JSON.parse(decode(manifestBytes)) as HubGameManifest;
    } catch { /* ignore */ }
  }

  const jsBytes =
    pickZipEntry(unzipped, (l) => l.endsWith("/index.js") || l === "index.js") ||
    pickZipEntry(unzipped, (l) => l.endsWith(".js") && !l.includes(".map"));
  if (!jsBytes) throw new Error("Aucun fichier JavaScript (index.js) trouvé dans dist.zip");

  const cssBytes =
    pickZipEntry(unzipped, (l) => l.endsWith("/style.css") || l === "style.css") ||
    pickZipEntry(unzipped, (l) => l.endsWith(".css"));

  const jsCode = decode(jsBytes);
  const cssCode = cssBytes ? decode(cssBytes) : null;
  const fallbackName =
    repoSlug.split("/")[1]?.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || repoSlug;

  const meta: CustomGameMeta = {
    key,
    name: manifest?.name?.trim() || (title !== repoSlug ? title : fallbackName),
    emoji: manifest?.emoji,
    repo: repoSlug,
    version: tag,
    desc: manifest?.desc?.trim() || `Partie Live GitHub (${repoSlug})`,
    hasPreConfig: typeof manifest?.hasPreConfig === "boolean" ? manifest.hasPreConfig : true,
    mountFn: mountFnFromManifest(manifest, repoSlug),
    shellBackground: manifest?.shellBackground?.trim(),
    avatars: manifest?.avatars,
    downloadUrl,
    addedAt: Date.now(),
    isCustom: true,
  };

  onProgress?.("Sauvegarde du jeu dans le navigateur…");
  await saveBundle(key, { jsCode, cssCode });
  saveCustomGameToStorage(meta);
  const blobs = createBlobUrls(key, { jsCode, cssCode });
  return { meta, ...blobs };
}

export async function loadOrFetchCustomGame(
  meta: CustomGameMeta,
): Promise<{ jsBlobUrl: string; cssBlobUrl?: string | null }> {
  const active = activeBlobUrls.get(meta.key);
  if (active) return active;
  const cached = await getBundle(meta.key);
  if (cached?.jsCode) return createBlobUrls(meta.key, cached);
  return fetchAndPrepareCustomGame(meta.repo);
}
