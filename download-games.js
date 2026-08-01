import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gamesJsonPath = path.join(__dirname, 'games.json');
const publicGamesDir = path.join(__dirname, 'public', 'games');
const catalogPath = path.join(publicGamesDir, 'catalog.json');
const MANIFEST_FILENAME = 'hub-manifest.json';

/** Monorepo siblings — used to inject/refresh hub-manifest.json when release zip is outdated. */
const LOCAL_MANIFEST_SOURCES = {
  skull: path.join(__dirname, '..', 'skull-and-roses', 'public', MANIFEST_FILENAME),
  royal: path.join(__dirname, '..', 'royal-bluff', 'public', MANIFEST_FILENAME),
  sheriff: path.join(__dirname, '..', 'Sherif-de-Nottingham', 'public', MANIFEST_FILENAME),
  pool: path.join(__dirname, '..', 'billard-p2play', 'public', MANIFEST_FILENAME),
  uno: path.join(__dirname, '..', 'uno-p2play', 'public', MANIFEST_FILENAME),
  pirates: path.join(__dirname, '..', 'royal-pirates', 'public', MANIFEST_FILENAME),
};

if (!fs.existsSync(publicGamesDir)) {
  fs.mkdirSync(publicGamesDir, { recursive: true });
}

if (!fs.existsSync(gamesJsonPath)) {
  console.error("games.json configuration file not found!");
  process.exit(1);
}

const gamesConfig = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8'));
const configuredKeys = Object.keys(gamesConfig.games || {});

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else {
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${response.statusCode} from ${targetUrl}`));
        }
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    request(url);
  });
}

function ensureHubManifest(gameKey, gameDir) {
  const destManifest = path.join(gameDir, MANIFEST_FILENAME);
  const localSource = LOCAL_MANIFEST_SOURCES[gameKey];

  // Prefer monorepo source of truth when present (keeps Hub catalog in sync before release).
  if (localSource && fs.existsSync(localSource)) {
    fs.copyFileSync(localSource, destManifest);
  }

  if (!fs.existsSync(destManifest)) {
    throw new Error(
      `Missing ${MANIFEST_FILENAME} for "${gameKey}". ` +
      `Add public/${MANIFEST_FILENAME} to the game and include it in dist.zip.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(destManifest, 'utf8'));
  if (!raw.key || !raw.name || !raw.desc || typeof raw.hasPreConfig !== 'boolean') {
    throw new Error(
      `Invalid ${MANIFEST_FILENAME} for "${gameKey}": requires key, name, desc, hasPreConfig.`
    );
  }
  if (raw.key !== gameKey) {
    throw new Error(
      `${MANIFEST_FILENAME} key "${raw.key}" does not match games.json key "${gameKey}".`
    );
  }
  if (raw.avatars !== undefined) {
    if (!Array.isArray(raw.avatars) || !raw.avatars.every((a) => typeof a === 'string' && a.trim())) {
      throw new Error(
        `Invalid ${MANIFEST_FILENAME} for "${gameKey}": avatars must be a string array when set.`
      );
    }
  }
  if (raw.shellBackground !== undefined && typeof raw.shellBackground !== 'string') {
    throw new Error(
      `Invalid ${MANIFEST_FILENAME} for "${gameKey}": shellBackground must be a string when set.`
    );
  }
  return raw;
}

function pruneOrphanGameDirs() {
  if (!fs.existsSync(publicGamesDir)) return;
  for (const entry of fs.readdirSync(publicGamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (configuredKeys.includes(entry.name)) continue;
    const orphanPath = path.join(publicGamesDir, entry.name);
    console.log(`Pruning orphan game folder: ${entry.name}`);
    fs.rmSync(orphanPath, { recursive: true, force: true });
  }
}

function writeCatalog(manifests) {
  const enriched = manifests.map((m) => {
    const cfg = gamesConfig.games[m.key];
    return cfg?.repo ? { ...m, repo: cfg.repo } : m;
  });
  fs.writeFileSync(catalogPath, JSON.stringify({ games: enriched }, null, 2) + '\n', 'utf8');
  console.log(`Wrote catalog with ${enriched.length} game(s) → ${catalogPath}`);
}

/** Refresh manifests + catalog.json without re-downloading release zips (monorepo / local). */
function refreshCatalogOnly() {
  console.log("Refreshing Hub catalog from local manifests (no download)...");
  pruneOrphanGameDirs();

  const manifests = [];
  const missing = [];
  for (const gameKey of configuredKeys) {
    const gameDir = path.join(publicGamesDir, gameKey);
    if (!fs.existsSync(gameDir)) {
      missing.push(gameKey);
      continue;
    }
    manifests.push(ensureHubManifest(gameKey, gameDir));
    console.log(`Catalog entry OK: ${gameKey}`);
  }

  if (manifests.length === 0) {
    throw new Error(
      "No public/games/{key}/ folders found. Run `node download-games.js` once, or deploy a local lib build."
    );
  }
  if (missing.length > 0) {
    console.warn(
      `Skipping missing game folder(s): ${missing.join(", ")} ` +
        `(run \`node download-games.js\` or \`scripts/deploy-local-hub.sh ${missing.join(" ")}\`).`
    );
  }

  writeCatalog(manifests);
  console.log("Catalog refresh complete.");
}

async function prepareGames() {
  console.log("Starting production games download from GitHub...");
  pruneOrphanGameDirs();

  const manifests = [];

  for (const gameKey of configuredKeys) {
    const game = gamesConfig.games[gameKey];
    const gameDir = path.join(publicGamesDir, gameKey);

    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }
    fs.mkdirSync(gameDir, { recursive: true });

    const zipUrl = `https://github.com/${game.repo}/releases/download/${game.version}/dist.zip`;
    const tempZipPath = path.join(publicGamesDir, `temp_${gameKey}.zip`);
    const tempExtractDir = path.join(publicGamesDir, `temp_extract_${gameKey}`);

    try {
      console.log(`Downloading ${gameKey} (${game.version}) from ${zipUrl}...`);
      await downloadFile(zipUrl, tempZipPath);

      console.log(`Extracting ${gameKey} zip...`);
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempExtractDir, { recursive: true });

      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${tempExtractDir}' -Force"`);
      } else {
        execSync(`unzip -o "${tempZipPath}" -d "${tempExtractDir}"`);
      }

      let sourceDir = tempExtractDir;
      const nestedDist = path.join(tempExtractDir, 'dist');
      if (fs.existsSync(nestedDist)) {
        sourceDir = nestedDist;
      }

      fs.cpSync(sourceDir, gameDir, { recursive: true });
      const manifest = ensureHubManifest(gameKey, gameDir);
      manifests.push(manifest);
      console.log(`Successfully installed ${gameKey} into ${gameDir}`);
    } catch (err) {
      console.error(`Error installing ${gameKey}:`, err.message);
      process.exit(1);
    } finally {
      if (fs.existsSync(tempZipPath)) {
        try { fs.unlinkSync(tempZipPath); } catch (_) {}
      }
      if (fs.existsSync(tempExtractDir)) {
        try {
          if (process.platform === 'win32') {
            execSync(`powershell -Command "Remove-Item -Recurse -Force '${tempExtractDir}'"`, { stdio: 'ignore' });
          } else {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
          }
        } catch (_) {}
      }
    }
  }

  writeCatalog(manifests);
  console.log("All games successfully downloaded and integrated!");
}

if (process.argv.includes('--catalog-only')) {
  try {
    refreshCatalogOnly();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
} else {
  prepareGames();
}
