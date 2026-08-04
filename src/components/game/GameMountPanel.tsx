import { useState, useEffect, useRef } from "react";
import { defaultHubMountFnName, type PeerManagerLike } from "p2play-core";
import {
  activateGameStyle,
  unloadAllGameStyles,
} from "../../utils/gameStyles";
import {
  isCustomGameKey,
  loadOrFetchCustomGame,
  loadStoredCustomGames,
  resolveCustomMountFnName,
  type CustomGameMeta,
} from "../../utils/customGameLoader";

const FALLBACK_SHELL_BACKGROUND =
  "radial-gradient(circle at center, #09090b 0%, #09090b 100%)";
const CUSTOM_SHELL_BACKGROUND =
  "radial-gradient(circle at center, #180e29 0%, #09090b 100%)";

interface GameMountPanelProps {
  gameName: string;
  peerId: string;
  playerName?: string;
  playerAvatar?: string;
  externalPeerManager?: PeerManagerLike;
  isHost?: boolean;
  lateJoin?: boolean;
  gameConfig?: any;
  hubPhase?: string;
  enableTextChat?: boolean;
  /** From hub-manifest.json; defaults to mount{Key}. */
  mountFnName?: string;
  /** From hub-manifest.json `shellBackground`. */
  shellBackground?: string;
  onExit: () => void;
  onLeave?: () => void;
}

function resolveCustomMeta(gameName: string): CustomGameMeta | undefined {
  return loadStoredCustomGames().find((g) => g.key === gameName);
}

export function GameMountPanel({
  gameName,
  peerId,
  playerName,
  playerAvatar,
  externalPeerManager,
  isHost,
  lateJoin,
  gameConfig,
  hubPhase,
  enableTextChat,
  mountFnName,
  shellBackground,
  onExit,
  onLeave,
}: GameMountPanelProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Game board pseudo-fullscreen — hide hub chrome (lobby exit) over the play area. */
  const [boardExpanded, setBoardExpanded] = useState(false);

  useEffect(() => {
    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<{ expanded?: boolean }>).detail;
      setBoardExpanded(Boolean(detail?.expanded));
    };
    window.addEventListener("p2play:board-expand", onExpand);
    return () => {
      window.removeEventListener("p2play:board-expand", onExpand);
      setBoardExpanded(false);
    };
  }, [gameName]);


  const customMeta = resolveCustomMeta(gameName);
  const isCustom = Boolean(customMeta) || isCustomGameKey(gameName);

  const resolvedShellBackground =
    shellBackground ??
    customMeta?.shellBackground ??
    (isCustom ? CUSTOM_SHELL_BACKGROUND : FALLBACK_SHELL_BACKGROUND);

  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    let unmountGame: (() => void) | null = null;
    let cancelled = false;

    const loadGame = async () => {
      try {
        setLoading(true);
        setError(null);

        let scriptSrc = "";
        let resolvedMount = mountFnName;

        if (isCustom) {
          const meta = customMeta;
          if (!meta) {
            throw new Error(
              `Métadonnées du jeu custom "${gameName}" introuvables. Ré-ajoutez le dépôt depuis le Hub.`,
            );
          }
          const { jsBlobUrl, cssBlobUrl } = await loadOrFetchCustomGame(meta);
          if (cancelled) return;
          scriptSrc = jsBlobUrl;
          resolvedMount = resolveCustomMountFnName(meta);
          if (cssBlobUrl) {
            await activateGameStyle(gameName, cssBlobUrl);
          }
        } else {
          const rawBase = import.meta.env.BASE_URL || "./";
          const gameBasePath = rawBase.endsWith("/")
            ? `${rawBase}games/${gameName}/`
            : `${rawBase}/games/${gameName}/`;

          await activateGameStyle(gameName, `${gameBasePath}style.css`);
          if (cancelled) return;
          scriptSrc = `${gameBasePath}index.js`;
          resolvedMount = mountFnName ?? defaultHubMountFnName(gameName);
        }

        if (cancelled) return;

        await new Promise<void>((resolve, reject) => {
          const existingScript = document.getElementById(`game-script-${gameName}`);
          if (existingScript) existingScript.remove();

          script = document.createElement("script");
          script.id = `game-script-${gameName}`;
          script.type = "module";
          script.src = scriptSrc;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error(`Échec du chargement du script du jeu "${gameName}"`));
          document.head.appendChild(script);
        });

        if (cancelled) return;

        const mountFn = (window as unknown as Record<string, unknown>)[resolvedMount!];

        if (typeof mountFn !== "function") {
          throw new Error(`Fonction de montage "${resolvedMount}" introuvable sur window.`);
        }

        if (mountRef.current) {
          mountRef.current.innerHTML = "";
          const cleanup = (mountFn as (el: HTMLElement, props: unknown) => unknown)(mountRef.current, {
            peerId,
            playerName,
            playerAvatar,
            externalPeerManager,
            isEmbedded: true,
            isHost,
            lateJoin,
            gameConfig,
            hubPhase,
            enableTextChat,
            onExit,
          });
          if (typeof cleanup === "function") {
            unmountGame = cleanup as () => void;
          }
        }

        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error("Failed to load game module:", err);
        const message = err instanceof Error ? err.message : String(err);
        setError(`Impossible de charger le jeu "${gameName}" : ${message}`);
        setLoading(false);
      }
    };

    void loadGame();

    return () => {
      cancelled = true;
      try {
        unmountGame?.();
      } catch (e) {
        console.warn("Game unmount failed:", e);
      }
      unmountGame = null;

      if (script && document.head.contains(script)) {
        document.head.removeChild(script);
      }

      unloadAllGameStyles();

      if (mountRef.current) {
        mountRef.current.innerHTML = "";
      }
    };
  }, [gameName, peerId, mountFnName]);

  return (
    <div
      className="fixed inset-0 z-50 w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: resolvedShellBackground }}
      data-p2play-game-shell={gameName}
    >
      {!boardExpanded &&
        (isHost ? (
          <button
            onClick={onExit}
            className="fixed top-4 left-4 z-[100] flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 font-bold px-4 py-2 rounded-xl backdrop-blur-md border border-amber-500/30 shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            ← Lobby P2Play
          </button>
        ) : (
          <button
            onClick={() => (onLeave ? onLeave() : onExit())}
            className="fixed top-4 left-4 z-[100] flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800 text-rose-400 font-bold px-4 py-2 rounded-xl backdrop-blur-md border border-rose-500/30 shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Quitter le Hub (la partie continue pour les autres)"
          >
            Quitter le Hub
          </button>
        ))}

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
