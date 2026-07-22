# 🔌 Spécification du Contrat de Montage (`window.mountXxx`)

Chaque jeu intégré au Hub P2Play doit obligatoirement respecter la spécification du contrat de montage afin de pouvoir être chargé, exécuté et démonté proprement.

---

## 1. Nommage de la Fonction de Montage

La fonction de montage doit être exposée sur l'objet global `window` de la manière suivante :
- Format du nom : `mount${CapitalizedGameKey}`
- Exemples :
  - Clef `skull` -> `window.mountSkull`
  - Clef `royal` -> `window.mountRoyal`
  - Clef `sheriff` -> `window.mountSheriff`

---

## 2. Signature de la Fonction `mount`

```typescript
export type MountFunction = (
  container: HTMLElement, 
  options: MountOptions
) => UnmountFunction;

export type UnmountFunction = () => void;

export interface MountOptions {
  /** Identifiant PeerJS du joueur local */
  peerId: string;
  
  /** Nom du joueur saisi dans le Hub */
  playerName?: string;
  
  /** Émote/Avatar choisi dans le Hub (ex: "👑", "🦊", "🤠") */
  playerAvatar?: string;
  
  /** Instance du gestionnaire WebRTC/PeerJS déjà connecté */
  externalPeerManager?: any;
  
  /** Drapeau indiquant que le jeu est exécuté au sein du Hub */
  isEmbedded?: boolean;
  
  /** Callback permettant de déclencher le retour au salon du Hub */
  onExit?: () => void;
}
```

---

## 3. Exemple d'Implémentation dans `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

export function mount(element: HTMLElement, options: MountOptions) {
  // Injection automatique du style CSS du jeu si absent du document
  const styleId = 'game-style-skull';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = '/games/skull/style.css';
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

  // La fonction retourne un callback pour unmount proprement le nœud DOM
  return () => {
    root.unmount();
  };
}

// Exposition sur window
(window as any).mountSkull = mount;
```

---

## 4. Spécifications du Build Vite (`vite.config.ts`)

Le build de bibliothèque (`npx vite build --mode lib`) doit générer un fichier d'entrée unique nommé `index.js` et une feuille de style nommée `<game-key>.css`.

```typescript
// Extrait de vite.config.ts
export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';
  return {
    base: './',
    plugins: [react()],
    // Remplacement explicite au niveau racine de la config Vite
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': '{}',
    },
    build: isLib ? {
      outDir: 'dist',
      lib: {
        entry: path.resolve(__dirname, 'src/main.tsx'),
        name: 'GameSkull',
        formats: ['es'],
        fileName: () => 'index.js'
      }
      // Ne pas externaliser react/react-dom pour garantir un ES module autonome
    } : {
      outDir: 'dist'
    }
  }
});
```

---

## 5. Recommandations CSS & Isolement de Styles

- **Portée des Sélecteurs** : Encapsulez les thèmes CSS spécifiques dans des classes de conteneurs uniques (ex: `.theme-skull`) pour éviter que des règles génériques n'altèrent les composants du Hub.
- **Chemins d'Assets** : Tous les médias (images, sons, SVG) doivent être importés via des modules Vite ou référencés via des chemins relatifs (`./assets/`) pour fonctionner correctement lorsqu'ils sont servis sous `public/games/${gameKey}/`.
