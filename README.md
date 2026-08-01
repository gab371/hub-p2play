# 🎮 P2Play Hub - Multiplayer Game Orchestrator

**P2Play Hub** is a serverless Peer-to-Peer (P2P) multiplayer board game orchestrator. It allows players to create persistent lobby groups ("Party Groups"), invite friends via room code, and switch seamlessly between games (*Skull & Roses*, *Royal Bluff*, *Sheriff & Smugglers*, *Billard P2Play*) without page reloads or WebRTC disconnection.

All WebRTC network transport, voice chat, and room management rely on the unified library **[`p2play-core`](https://github.com/gab371/p2play-core)**.

---

## ✨ Key Features

- **Single Page Application (SPA) Orchestration**: The entire lifecycle (Hub <-> Games) occurs on a single HTML/React page without iFrames.
- **Persistent Party Group P2P**: WebRTC connection (via PeerJS and `p2play-core`) is established at Hub level and passed seamlessly to the selected game on launch (`externalPeerManager`).
- **Heartbeat & presence (in-game)**: `p2play-core` detects silent disconnects; games use `p2play-core/presence` for 60s grace + F5 reconnect while a match is running (Hub salon auto-rejoin is not required for games to work).
- **Full-Screen Rendering & Navigation**: Games render full-screen (`100vw` × `100vh`) with a top navigation bar containing a **`← P2Play Lobby`** button to return to the party room at any time.
- **Direct Game Lobby Bypass**: Players enter username and avatar once in the Hub. Launching transitions directly to the game board or pre-game deck selection lobby.
- **Dual Pack Emote Selector**: Support for universal Hub emotes and game-specific thematic emotes.
- **GitHub Release Integration (CI/CD)**: Hub automatically downloads and extracts production builds (`dist.zip`) of games configured in `games.json` prior to build.

---

## 🛠️ Tech Stack

- **Unified Network Engine**: [`p2play-core`](https://github.com/gab371/p2play-core) (PeerJS WebRTC transport, session handover, heartbeat, voice, spectator, **presence / reconnect**).
- **UI Framework**: React 19, TypeScript, Tailwind CSS, shadcn/ui, Lucide React.
- **Build Tool**: Vite (ES Modules support & dynamic script injection; `resolve.dedupe` for React).
- **Automation**: Node.js (`download-games.js`) for downloading GitHub releases.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Download Game Bundles (Pre-build)
This script reads `games.json`, downloads matching GitHub releases, and extracts them to `public/games/`:
```bash
node download-games.js
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3004` (or the port Vite prints).

> **Local lib builds:** `npm run dev` re-runs `download-games.js` and **overwrites** `public/games/` with GitHub zips. To test locally built game bundles, use the monorepo helper then start Vite without re-download:
> ```bash
> # from repo root
> ./scripts/deploy-local-hub.sh uno          # or: node scripts/deploy-local-hub.mjs uno
> # from hub-p2play/
> npm run deploy:local -- uno               # build:lib + copy into public/games/
> npm run dev:local                         # = npx vite (keeps local copies)
> ```

---

## 📚 Technical Documentation

- 🌐 **[`p2play-core` Documentation](https://github.com/gab371/p2play-core)**: P2P engine, voice, spectator, session, presence, lobby & room-link UI (`RoomCodeBadge`).
- 🏛️ **[Hub Architecture](docs/architecture.md)**: Persistent P2P Party Group, WebRTC handover, SPA lifecycle, and in-game reconnect boundary.
- 🔌 **[Mount Contract (`window.mountXxx`)](docs/game-mount-contract.md)**: Specification for game ES Module bundles.
- 🛠️ **[Developer Guide: Add a New Game](docs/developer-guide-new-game.md)**: Step-by-step tutorial (`p2play-core` ≥ v0.6.0, presence, Vite, releases).

---

## ⚙️ Game Configuration (`games.json`)

`games.json` only pins **GitHub releases to download** (repo + version). Display name / description come from each game's own `hub-manifest.json` (declared via `p2play-core`).

```json
{
  "games": {
    "skull": {
      "repo": "gab371/skull-and-roses",
      "version": "v0.6.0"
    },
    "royal": {
      "repo": "gab371/royal-bluff",
      "version": "v0.6.0"
    },
    "sheriff": {
      "repo": "gab371/sheriff-smugglers",
      "version": "v1.6.0"
    },
    "pool": {
      "repo": "gab371/billard-p2play",
      "version": "v0.6.0"
    }
  }
}
```

After `node download-games.js`, Hub serves `public/games/catalog.json` aggregated from each `hub-manifest.json`. Removing a game from `games.json` removes it from the picker on the next download (orphan folders are pruned).
