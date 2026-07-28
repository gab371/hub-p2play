# 🔌 Mount Contract Specification (`window.mountXxx`)

Every game integrated into P2Play Hub must comply with the mount contract specification to ensure clean loading, execution, and unmounting. Network types and management rely on **[`p2play-core`](https://github.com/gab371/p2play-core)**.

---

## 1. Mount Function Naming

The mount function must be exposed on the global `window` object using the following naming convention:
- Format: `mount${CapitalizedGameKey}`
- Examples:
  - Key `skull` -> `window.mountSkull`
  - Key `royal` -> `window.mountRoyal`
  - Key `sheriff` -> `window.mountSheriff`
  - Key `pool` -> `window.mountPool`

---

## 2. `mount` Function Signature

```typescript
import type { PeerManagerLike } from 'p2play-core';

export type MountFunction = (
  container: HTMLElement, 
  options: MountOptions
) => UnmountFunction;

export type UnmountFunction = () => void;

export interface MountOptions {
  /** Local player PeerJS ID */
  peerId: string;
  
  /** Player username entered in Hub */
  playerName?: string;
  
  /** Player avatar/emote selected in Hub (e.g. "👑", "🦊", "🤠") */
  playerAvatar?: string;
  
  /** Active WebRTC p2play-core peer manager instance */
  externalPeerManager?: PeerManagerLike;
  
  /** Flag indicating game is running embedded inside Hub */
  isEmbedded?: boolean;
  
  /** Callback triggering return to Hub lobby */
  onExit?: () => void;
}
```

---

## 3. Example Implementation in `src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import type { MountOptions } from 'p2play-core';
import './index.css';

export function mount(element: HTMLElement, options: MountOptions) {
  // Inject game CSS stylesheet dynamically if absent
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

  // Return callback to unmount DOM node cleanly
  return () => {
    root.unmount();
  };
}

// Expose on global window object
(window as any).mountSkull = mount;
```

---

## 4. Vite Build Specifications (`vite.config.ts`)

Library build (`npx vite build --mode lib`) must output a single entry file named `index.js` and a stylesheet named `<game-key>.css`.

```typescript
// Excerpt from vite.config.ts
export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';
  return {
    base: './',
    plugins: [react()],
    // Root define prevents process.env runtime errors
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
      // Do not externalize react/react-dom to ensure standalone ES module compatibility
    } : {
      outDir: 'dist'
    }
  }
});
```

---

## 5. CSS Recommendations & Selector Scoping

- **Selector Scoping**: Wrap game-specific CSS themes inside unique container classes (e.g. `.theme-skull`) to prevent style leaks into Hub UI.
- **Asset Paths**: All media assets (images, audio, SVGs) should be imported via Vite modules or referenced using relative paths (`./assets/`) to work correctly when served under `public/games/${gameKey}/`.

---

## 6. Presence / Reconnect (in-game)

While the Hub owns the WebRTC session (`externalPeerManager`), **disconnect grace and F5 reconnect during a match** are implemented inside each game via `p2play-core/presence` (`attachPresenceHandlers` on the host `useGame` effect). The mount contract itself does not change — pass the same `externalPeerManager` and let the game register presence handlers on that instance.

See [Presence & Reconnect Guide](https://github.com/gab371/p2play-core/blob/main/docs/presence-guide.md) and [Developer Guide §6](./developer-guide-new-game.md).

For detailed P2P networking guidelines, read **[`p2play-core` Documentation](https://github.com/gab371/p2play-core)**.
