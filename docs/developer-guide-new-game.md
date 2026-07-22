# 🛠️ Guide Développeur : Ajouter un Nouveau Jeu au Hub P2Play

Ce guide pas-à-pas explique comment adapter un jeu React/TypeScript existant ou en créer un nouveau pour le rendre compatible avec l'orchestrateur **P2Play Hub**.

---

## 📋 Checklist d'Intégration

- [ ] **Étape 1** : Configurer la compilation double mode (`standalone` & `lib`) dans `vite.config.ts`.
- [ ] **Étape 2** : Exposer la fonction `window.mountXxx` dans `src/main.tsx`.
- [ ] **Étape 3** : Adapter `usePeer.ts` pour initialiser de manière synchrone `myPeerId`, `isHost` et `status` quand `externalPeerManager` est présent.
- [ ] **Étape 4** : Adapter `useGame.ts` et `App.tsx` pour auto-démarrer la partie et bypass le composant `<Lobby />` local.
- [ ] **Étape 5** : Configurer la pipeline CI/CD GitHub Actions (`deploy.yml`) pour générer `dist.zip` et `standalone.zip`.
- [ ] **Étape 6** : Déclarer le jeu et sa version dans `games.json` du Hub.

---

## 🛠️ Étapier Détaillé

### Étape 1 : Modification de `vite.config.ts`

Assurez-vous que Vite prend en charge le flag `--mode lib` et que `define` est déclaré au premier niveau :

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

### Étape 2 : Exposition de `mountMygame` dans `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

export function mount(element: HTMLElement, options: { 
  peerId: string; 
  onExit?: () => void; 
  externalPeerManager?: any;
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

### Étape 3 : Adaptation de `usePeer.ts` (Initialisation Synchrone)

Dans `src/hooks/usePeer.ts`, initialisez l'état immédiatement depuis `externalPeerManager` pour éviter les retards de rendu :

```typescript
export function usePeer(options?: UsePeerOptions) {
  const peerManagerRef = useRef<PeerManager | null>(null);
  const ext = options?.externalPeerManager;
  
  const [myPeerId, setMyPeerId] = useState<string | null>(ext?.myPeerId || null);
  const [hostPeerId, setHostPeerId] = useState<string | null>(ext?.hostPeerId || ext?.roomId || null);
  const [isHost, setIsHost] = useState<boolean>(ext?.isHost || false);
  const [status, setStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>(ext ? 'CONNECTED' : 'IDLE');

  if (!peerManagerRef.current) {
    peerManagerRef.current = ext || new PeerManager();
  }
  
  // ...
}
```

---

### Étape 4 : Auto-Start & Bypass du Lobby Local dans `useGame.ts`

Dans `src/hooks/useGame.ts`, ajoutez la vérification `options.isEmbedded` pour démarrer le moteur de jeu automatiquement :

```typescript
  useEffect(() => {
    if (!isHost) return;

    if (!gameEngineRef.current) {
      gameEngineRef.current = new GameEngine();
    }

    const engine = gameEngineRef.current;

    // Lancement automatique sans repasser par le formulaire du sous-jeu
    if (options?.isEmbedded && options?.externalPeerManager && engine.state.phase === 'LOBBY') {
      engine.state.players = [];
      const hostName = options.playerName || "Hôte";
      const hostAvatar = options.playerAvatar || "👑";
      engine.addPlayer(myPeerId!, hostName, hostAvatar, true);

      if (peerManager.lobbyPlayers) {
        peerManager.lobbyPlayers.forEach((p: any) => {
          if (p.peerId && p.peerId !== myPeerId) {
            engine.addPlayer(p.peerId, p.username || `Joueur ${p.peerId.slice(0, 4)}`, p.avatar || "👤", false);
          }
        });
      }

      engine.startGame();
      broadcastSanitizedStates(engine.state);
    }
  }, [options?.isEmbedded, isHost]);
```

---

### Étape 5 : Pipeline CI/CD GitHub Actions (`.github/workflows/deploy.yml`)

Ajoutez les étapes de double compilation et de publication dans les Releases GitHub de votre dépôt de jeu :

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
      
      # 1. Build Standalone (Pour GitHub Pages)
      - run: npm run build
      - run: cd dist && zip -r ../standalone.zip .
      
      # 2. Build Library (Pour l'intégration Hub)
      - run: npx vite build --mode lib
      - run: cd dist && zip -r ../dist.zip .

      # 3. Publication automatique de la Release GitHub
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

### Étape 6 : Enregistrement dans `games.json` du Hub

Dans le dépôt `hub-p2play`, ajoutez l'entrée de votre jeu dans `games.json` :

```json
{
  "games": {
    "mygame": {
      "repo": "votre-orga/votre-depot-jeu",
      "version": "v1.0.0"
    }
  }
}
```

Enfin, relancez `node download-games.js` dans le Hub pour télécharger, extraire et rendre votre jeu immédiatement jouable !
