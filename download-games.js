import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gamesJsonPath = path.join(__dirname, 'games.json');
const publicGamesDir = path.join(__dirname, 'public', 'games');

// Ensure public/games directory exists
if (!fs.existsSync(publicGamesDir)) {
  fs.mkdirSync(publicGamesDir, { recursive: true });
}

// Read target versions from games.json
if (!fs.existsSync(gamesJsonPath)) {
  console.error("games.json configuration file not found!");
  process.exit(1);
}

const gamesConfig = JSON.parse(fs.readFileSync(gamesJsonPath, 'utf8'));

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

async function prepareGames() {
  console.log("Starting production games download from GitHub...");

  for (const gameKey of Object.keys(gamesConfig.games)) {
    const game = gamesConfig.games[gameKey];
    const gameDir = path.join(publicGamesDir, gameKey);
    
    // Clean target folder
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

      // Extract ZIP using PowerShell on Windows or unzip on Linux/macOS
      if (process.platform === 'win32') {
        execSync(`powershell -Command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${tempExtractDir}' -Force"`);
      } else {
        execSync(`unzip -o "${tempZipPath}" -d "${tempExtractDir}"`);
      }

      // Copy compiled content. We search if 'dist' folder is nested in zip
      let sourceDir = tempExtractDir;
      const nestedDist = path.join(tempExtractDir, 'dist');
      if (fs.existsSync(nestedDist)) {
        sourceDir = nestedDist;
      }

      fs.cpSync(sourceDir, gameDir, { recursive: true });
      console.log(`Successfully installed ${gameKey} into ${gameDir}`);

    } catch (err) {
      console.error(`Error installing ${gameKey}:`, err.message);
      process.exit(1);
    } finally {
      // Clean up temp files
      if (fs.existsSync(tempZipPath)) {
        try { fs.unlinkSync(tempZipPath); } catch (_) {}
      }
      if (fs.existsSync(tempExtractDir)) {
        try {
          // Use PowerShell on Windows to avoid EPERM on locked directories
          if (process.platform === 'win32') {
            execSync(`powershell -Command "Remove-Item -Recurse -Force '${tempExtractDir}'"`, { stdio: 'ignore' });
          } else {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
          }
        } catch (_) {}
      }
    }
  }

  console.log("All games successfully downloaded and integrated!");
}

prepareGames();
