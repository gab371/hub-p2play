# 🛠️ Developer Guide: Add a New Game to P2Play Hub

This step-by-step guide explains how to adapt an existing React/TypeScript game or create a new one compatible with **P2Play Hub** using the unified **[`p2play-core`](https://github.com/gab371/p2play-core)** package.

---

## 📋 Integration Checklist

- [ ] **Step 1**: Install `p2play-core` in your game (`npm i github:gab371/p2play-core#v0.6.6`).
- [ ] **Step 2**: Configure dual build modes (`standalone` & `lib`) in `vite.config.ts`.
- [ ] **Step 3**: Expose `window.mountXxx` in `src/main.tsx`.
- [ ] **Step 4**: Use `usePeer` from `p2play-core` to manage P2P connections (standalone and `externalPeerManager`).
- [ ] **Step 5**: Use shared `<P2PlayLobby />` for the standalone home screen (themed + `classes`); keep connected-room lobby game-specific. Use `CopyRoomLinkButton` / `RoomCodeBadge` for room URL copy (no text “Copier le lien”).
- [ ] **Step 5b**: Prefer `TextChatPanel` / `JournalPanel` from `p2play-core/chat` with `scrollbarAccent`.
- [ ] **Step 6**: Adapt `useGame.ts` / `App.tsx` to auto-populate players and bypass local home screen when `isEmbedded` is active.
- [ ] **Step 6b**: Wire **`p2play-core/presence`** (`attachPresenceHandlers` + engine `remapPlayerId`) for disconnect grace / F5 reconnect.
- [ ] **Step 7**: Configure CI/CD GitHub Actions workflow (`deploy.yml`) to build `dist.zip` and `standalone.zip`.
- [ ] **Step 8**: Ship `public/hub-manifest.json` and pin download in Hub's `games.json`.

---

## 🛠️ Step-by-Step Instructions

### Step 1: Install `p2play-core`

Add `p2play-core` to your game's `package.json`:

```bash
npm install github:gab371/p2play-core#v0.6.6
```

---

### Step 2: Configure `vite.config.ts`

Ensure Vite handles `--mode lib` flag and root-level `define`:

```typescript
import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "fs"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';
  return {
    base: './',
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': '{}',
    },
    build: isLib ? {
      outDir: 'dist',
      lib: {
        entry: path.resolve(__dirname, 'src/main.tsx'),
        name: 'GameMygame',
        formats: ['es'],
        fileName: () => 'index.js'
      }
    } : {
      outDir: 'dist'
    }
  }
});
```

---

### Step 3: Expose `mountMygame` in `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import type { PeerManagerLike } from 'p2play-core'
import './index.css'

export function mount(element: HTMLElement, options: { 
  peerId: string; 
  onExit?: () => void; 
  externalPeerManager?: PeerManagerLike;
  playerName?: string;
  playerAvatar?: string;
}) {
  const styleId = 'game-style-mygame';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = '/games/mygame/style.css';
    document.head.appendChild(link);
  }

  const root = createRoot(element);
  root.render(
    <StrictMode>
      <App
        isEmbedded={true}
        externalPeerManager={options.externalPeerManager}
        onExit={options.onExit}
        playerName={options.playerName}
        playerAvatar={options.playerAvatar}
      />
    </StrictMode>
  );
  return () => root.unmount();
}

(window as any).mountMygame = mount;
```

---

### Step 4: Use `p2play-core` (`usePeer`)

Use `p2play-core`'s `usePeer` hook in your components or local hook wrapper:

```typescript
import { usePeer as useCorePeer, type PeerManagerLike } from 'p2play-core';
import type { GameState } from '../core/types';

interface UsePeerOptions {
  externalPeerManager?: PeerManagerLike<GameState>;
}

export function usePeer(options?: UsePeerOptions) {
  return useCorePeer<GameState>({
    externalPeerManager: options?.externalPeerManager,
    namespacePrefix: 'mygame', // Used in standalone mode
    sounds: {
      click: () => soundManager.playClick(),
      victory: () => soundManager.playVictory(),
    },
  });
}
```

Passing `externalPeerManager` reuses Hub's WebRTC connection without instantiating a duplicate PeerJS instance.

---

### Step 5: Shared home lobby (`P2PlayLobby`)

Do **not** reimplement the create/join form. Use `<P2PlayLobby />` from `p2play-core` for the standalone home screen, and keep your connected-room lobby (ready / spectators / config) game-specific.

```tsx
import { P2PlayLobby } from 'p2play-core';

<P2PlayLobby
  title="MY GAME"
  theme="amber" // also colors URL invitation badge — required even with Tailwind classes
  status={status}
  error={error}
  showVoiceToggle={false}
  compactHostSection
  joinLayout="side-by-side"
  onHost={(name, avatar) => hostRoom(name, avatar)}
  onJoin={(name, avatar, code) => joinRoom(name, avatar, code)}
  classes={{
    root: "max-w-md mx-auto p-8 bg-zinc-900/80 ...",
    urlNotice: "p-5 bg-zinc-950 border border-zinc-800 rounded-2xl ...",
    // …title, buttons, etc.
  }}
/>
```

Full theming / invitation docs: [`p2play-core` Lobby Guide](https://github.com/gab371/p2play-core/blob/main/docs/lobby-guide.md).

---

### Step 6: Direct Bypass & Embedded Pre-Game Configuration (`useGame.ts`)

In `src/hooks/useGame.ts`, add embedded checks to populate players automatically from `peerManager.lobbyPlayers` while staying in `LOBBY` phase if your game features pre-game deck/rule configuration. Also wire **presence** on the host effect:

```typescript
import {
  attachPresenceHandlers,
  createSeatEngine,
  handleJoinGameSeat,
} from "p2play-core/presence";

  useEffect(() => {
    if (!isHost) return;

    if (!gameEngineRef.current) {
      gameEngineRef.current = new GameEngine();
    }

    const engine = gameEngineRef.current;

    // Populate players from Hub lobby without skipping pre-game config screen
    if (options?.isEmbedded && options?.externalPeerManager && engine.state.phase === 'LOBBY') {
      engine.state.players = [];
      const hostName = options.playerName || "Host";
      const hostAvatar = options.playerAvatar || "👑";
      engine.addPlayer(myPeerId!, hostName, hostAvatar, true);

      if (peerManager.lobbyPlayers) {
        peerManager.lobbyPlayers.forEach((p: any) => {
          if (p.peerId && p.peerId !== myPeerId) {
            engine.addPlayer(p.peerId, p.username || `Player ${p.peerId.slice(0, 4)}`, p.avatar || "👤", false);
          }
        });
      }

      // DO NOT call engine.startGame() here if game exposes pre-game configuration.
      // Host triggers start via "Launch Game" button in pre-game lobby.
      broadcastSanitizedStates(engine.state);
    }

    // Presence: grace + REQUEST_RECONNECT + JOIN seat (required for F5 mid-game)
    const presence = attachPresenceHandlers({
      peerManager,
      getEngine: () =>
        createSeatEngine({
          getPhase: () => engine.state.phase,
          getPlayers: () => engine.state.players,
          getSpectators: () => engine.state.spectators,
          markDisconnected: (id) => engine.markDisconnected(id),
          isDisconnected: (id) => engine.isDisconnected(id),
          remapPlayerId: (o, n, p) => engine.remapPlayerId(o, n, p),
          removePlayer: (id) => engine.removePlayer(id),
        }),
      onBroadcast: () => broadcastSanitizedStates(engine.state),
      onHostAction: (_sender, msg) => {
        /* ACTION switch — JOIN_GAME via handleJoinGameSeat */
      },
    });
    return () => presence.dispose();
  }, [options?.isEmbedded, isHost]);
```

Engine must implement `markDisconnected` / `isDisconnected` / `remapPlayerId` / `removePlayer`. Full checklist: [`p2play-core` Presence Guide](https://github.com/gab371/p2play-core/blob/main/docs/presence-guide.md).

---

### Step 7: CI/CD Pipeline (`.github/workflows/deploy.yml`)

Configure GitHub Actions workflow to build dual archives and create GitHub Releases:

```yaml
name: Deploy and Release Game

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      
      # 1. Standalone Build (For GitHub Pages)
      - run: npm run build
      - run: cd dist && zip -r ../standalone.zip .
      
      # 2. Library Build (For Hub integration)
      - run: npx vite build --mode lib
      - run: cd dist && zip -r ../dist.zip .

      # 3. Create GitHub Release
      - name: Extract version
        id: get_version
        run: echo "VERSION=v$(node -p "require('./package.json').version")" >> $GITHUB_ENV

      - name: Create or Update GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ env.VERSION }}
          name: Release ${{ env.VERSION }}
          files: |
            dist.zip
            standalone.zip
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### Step 8: Declare the game to Hub + pin in `games.json`

#### 8a. Ship `public/hub-manifest.json` (game declaration)

Each game **declares** itself to the Hub with a lightweight manifest copied into `dist` / `dist.zip` (Vite `public/` folder):

```json
{
  "key": "mygame",
  "name": "My Game",
  "emoji": "🎮",
  "desc": "Short pitch for the Hub picker.",
  "hasPreConfig": true,
  "avatars": ["🎮", "🎯", "🎲"],
  "shellBackground": "radial-gradient(circle at center, #1b0a0f 0%, #09090b 100%)"
}
```

Contract helpers live in `p2play-core`:

```ts
import { defineHubGameManifest, HUB_GAME_MANIFEST_FILENAME } from "p2play-core";

export const hubManifest = defineHubGameManifest({
  key: "mygame",
  name: "My Game",
  emoji: "🎮",
  desc: "Short pitch for the Hub picker.",
  hasPreConfig: true,
  avatars: ["🎮", "🎯", "🎲"],
  shellBackground: "radial-gradient(circle at center, #1b0a0f 0%, #09090b 100%)",
});
```

`key` must match the Hub folder / `games.json` key and the mount fn (`mountMygame` by default). Optional `avatars` power Hub “Émotes du Jeu”; optional `shellBackground` paints the mount shell while the game CSS loads.

#### 8b. Register download pin in Hub `games.json`

`games.json` only pins **which release to download** (no UI strings):

```json
{
  "games": {
    "mygame": {
      "repo": "your-org/your-game-repo",
      "version": "v1.0.0"
    }
  }
}
```

Run `node download-games.js` in Hub: it downloads `dist.zip`, requires `hub-manifest.json`, writes `public/games/catalog.json`, and prunes orphan game folders. The Hub picker reads that catalog — removing a key from `games.json` removes it from the UI after the next download.

---

## 🎙️ Voice, Spectator, Presence & Identity

`p2play-core` provides modular capabilities. Read the dedicated guides:
- 👁️ **[`p2play-core` Spectator Guide](https://github.com/gab371/p2play-core/blob/main/docs/spectator-guide.md)**
- 🎙️ **[`p2play-core` Voice Chat Guide](https://github.com/gab371/p2play-core/blob/main/docs/voice-chat-guide.md)**
- ♻️ **[`p2play-core` Presence & Reconnect Guide](https://github.com/gab371/p2play-core/blob/main/docs/presence-guide.md)** (grace 60s, `REQUEST_RECONNECT`, JOIN seat — **required** for mid-game F5)

**Security (required ≥ v0.6.6):**
- Actor id on host = DataConnection peer (`senderPeerId`), never `payload.playerId`.
- `JOIN_GAME` → `handleJoinGameSeat` with `trustedName: peerManager.getTrustedUsername?.(playerId)`.
- Guests accept `STATE_UPDATE` only from the host connection (do not reimplement a naive `conn.peer === hostPeerId` check in standalone).
- Hub `games.json` pins must match released game tags after each bump.
