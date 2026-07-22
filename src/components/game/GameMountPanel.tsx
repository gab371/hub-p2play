import { useState, useEffect, useRef } from "react";

interface GameMountPanelProps {
  gameName: string;
  peerId: string;
  playerName?: string;
  playerAvatar?: string;
  externalPeerManager?: any;
  onExit: () => void;
}

export function GameMountPanel({ gameName, peerId, playerName, playerAvatar, externalPeerManager, onExit }: GameMountPanelProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    let styleLink: HTMLLinkElement | null = null;

    const loadGame = async () => {
      try {
        setLoading(true);
        setError(null);

        // Inject game CSS
        const styleId = `game-style-${gameName}`;
        if (!document.getElementById(styleId)) {
          styleLink = document.createElement('link');
          styleLink.id = styleId;
          styleLink.rel = 'stylesheet';
          styleLink.href = `/games/${gameName}/style.css`;
          document.head.appendChild(styleLink);
        }

        // Inject the game as a <script type="module"> to bypass Vite public import restriction
        await new Promise<void>((resolve, reject) => {
          // Remove previous script if any
          const existingScript = document.getElementById(`game-script-${gameName}`);
          if (existingScript) existingScript.remove();

          script = document.createElement('script');
          script.id = `game-script-${gameName}`;
          script.type = 'module';
          script.src = `/games/${gameName}/index.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Échec du chargement du script du jeu "${gameName}"`));
          document.head.appendChild(script);
        });

        // Each game's main.tsx exposes window.mountXxx after script loads
        const mountFnName = `mount${gameName.charAt(0).toUpperCase() + gameName.slice(1)}`;
        const mountFn = (window as any)[mountFnName];

        if (typeof mountFn !== 'function') {
          throw new Error(`Fonction de montage "${mountFnName}" introuvable sur window.`);
        }

        if (mountRef.current) {
          mountRef.current.innerHTML = '';
          mountFn(mountRef.current, {
            peerId,
            playerName,
            playerAvatar,
            externalPeerManager,
            isEmbedded: true,
            onExit
          });
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load game module:', err);
        setError(`Impossible de charger le jeu "${gameName}" : ${err.message}`);
        setLoading(false);
      }
    };

    loadGame();

    return () => {
      // Cleanup script on unmount (keep style for now)
      if (script && document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [gameName, peerId]);

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Top-left Return Button */}
      <button
        onClick={onExit}
        className="fixed top-4 left-4 z-[100] flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 font-bold px-4 py-2 rounded-xl backdrop-blur-md border border-amber-500/30 shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
      >
        ← Lobby P2Play
      </button>

      {loading && (
        <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-bold text-zinc-300">Chargement de {gameName.toUpperCase()}...</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-full text-center py-6">
          <p className="text-rose-500 font-bold mb-4 text-lg">⚠️ {error}</p>
          <button
            onClick={onExit}
            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-xl text-zinc-200 transition-all border border-zinc-700 cursor-pointer"
          >
            Retourner au Hub
          </button>
        </div>
      )}

      <div ref={mountRef} className="w-full h-full flex-1 overflow-auto" />
    </div>
  );
}
