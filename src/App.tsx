import { useMemo, useState } from "react";
import { formatHubGameLabel, CopyRoomLinkButton } from "p2play-core";
import { SoundToggle } from "p2play-core/ui";
import { useHub } from "./hooks/useHub";
import { useGamesCatalog } from "./hooks/useGamesCatalog";
import { Lobby } from "./components/game/Lobby";
import { GameMountPanel } from "./components/game/GameMountPanel";
import { AddGameModal } from "./components/game/AddGameModal";
import { GameSelectionPanel } from "./components/game/GameSelectionPanel";
import { AvatarSelector } from "./components/game/AvatarSelector";
import { Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VoiceChatPanel } from "p2play-core/voice";
import { TextChatPanel } from "p2play-core/chat";
import { resolveCustomMountFnName } from "./utils/customGameLoader";
import { isLiveGamesEnabled } from "./utils/liveGamesFlag";
import { soundManager } from "./core/soundFX";

export default function App() {
  const hub = useHub();
  const { games: catalogGames, loading: catalogLoading, error: catalogError } = useGamesCatalog();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const enableHubVoice = import.meta.env.VITE_ENABLE_VOICE_CHAT !== "false";
  const enableLiveGames = isLiveGamesEnabled();

  const quickExamples = useMemo(
    () =>
      catalogGames.flatMap((g) => (g.repo ? [{ label: g.label, slug: g.repo }] : [])),
    [catalogGames],
  );

  const allGames = useMemo(() => {
    const builtin = catalogGames.map((g) => ({
      key: g.key,
      label: g.label,
      desc: g.desc,
      hasPreConfig: g.hasPreConfig,
      mountFn: g.mountFn,
      shellBackground: g.shellBackground,
      avatars: g.avatars,
      isCustom: false as const,
    }));

    if (!enableLiveGames) return builtin;

    const custom = hub.customGames.map((cg) => ({
      key: cg.key,
      label: formatHubGameLabel({
        key: cg.key,
        name: cg.name,
        emoji: cg.emoji,
        desc: cg.desc || `Partie GitHub (${cg.repo})`,
        hasPreConfig: cg.hasPreConfig,
      }),
      desc: cg.desc || `Partie GitHub (${cg.repo})`,
      hasPreConfig: cg.hasPreConfig,
      mountFn: resolveCustomMountFnName(cg),
      shellBackground: cg.shellBackground,
      avatars: cg.avatars,
      isCustom: true as const,
    }));

    return [...builtin, ...custom];
  }, [catalogGames, hub.customGames, enableLiveGames]);

  const selectedGameObj = allGames.find((g) => g.key === hub.selectedGame);
  const activeGameObj = allGames.find((g) => g.key === hub.activeGame);

  const showLobby = !hub.roomId;

  return (
    <TooltipProvider>
      <Toaster />
      {hub.activeGame ? (
        <GameMountPanel
          gameName={hub.activeGame}
          peerId={hub.myPeerId || ""}
          playerName={hub.players.find((p) => p.peerId === hub.myPeerId)?.username || "Joueur"}
          playerAvatar={hub.players.find((p) => p.peerId === hub.myPeerId)?.avatar || "👑"}
          externalPeerManager={hub.externalPeerManager}
          isHost={hub.isHost}
          lateJoin={!hub.isHost}
          gameConfig={hub.gameConfig}
          hubPhase={hub.hubPhase}
          mountFnName={activeGameObj?.mountFn}
          shellBackground={activeGameObj?.shellBackground}
          onExit={hub.returnToHub}
          onLeave={hub.disconnect}
        />
      ) : (
        <div className="min-h-screen text-zinc-50 font-sans flex flex-col justify-between relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.08),transparent_70%)] pointer-events-none" />

          <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-6 px-4 border-b border-zinc-900 relative z-10">
            <div className="flex items-center gap-3">
              <Gamepad2 className="w-6 h-6 text-[#8b5cf6] animate-pulse" />
              <div>
                <h1 className="text-xl font-black bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent tracking-tight">
                  P2PLAY HUB
                </h1>
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold block leading-none mt-0.5">
                  Multiplayer Game Orchestrator
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SoundToggle soundManager={soundManager} />
              {hub.roomId && (
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant="secondary" className="h-auto border-emerald-800 bg-emerald-950/80 px-3 py-1.5 text-emerald-400">
                    Salon Connecté
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={
                      hub.enableVoice
                        ? "h-auto border-violet-800 bg-violet-950/80 px-3 py-1.5 text-violet-300"
                        : "h-auto border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-500"
                    }
                  >
                    {hub.enableVoice ? "🎙️ Vocal Actif" : "🔇 Vocal Désactivé"}
                  </Badge>
                  <Badge variant="outline" className="h-auto gap-1 py-1 pl-3 pr-1 font-mono text-zinc-400">
                    Code : <span className="font-bold text-violet-400">{hub.roomId}</span>
                    {hub.roomId && (
                      <CopyRoomLinkButton
                        code={hub.roomId}
                        className="text-zinc-400 hover:text-violet-300"
                        iconClassName="size-3"
                      />
                    )}
                  </Badge>
                  <Button type="button" size="sm" variant="destructive" onClick={hub.disconnect}>
                    Quitter
                  </Button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 relative z-10">
            {showLobby ? (
              <Lobby
                status={hub.status}
                onCreate={hub.createRoom}
                onJoin={hub.joinRoom}
              />
            ) : (
              <div className="max-w-2xl mx-auto flex flex-col gap-8">
                <div className="flex flex-col gap-4 rounded-3xl border border-zinc-850 bg-zinc-900/40 p-6 shadow-xl">
                  <h2 className="text-xl font-bold text-zinc-200">👥 Joueurs Connectés ({hub.players.length})</h2>
                  <div className="flex flex-wrap gap-2">
                    {hub.players.map((p, idx) => (
                      <Badge
                        key={p.peerId}
                        variant={p.peerId === hub.myPeerId ? "default" : "outline"}
                        className="h-auto gap-1.5 px-3 py-1.5"
                      >
                        <span className="text-base">{p.avatar || (idx === 0 ? "👑" : "👤")}</span>
                        <span>{p.username}</span>
                        {p.peerId === hub.myPeerId && <span className="text-[10px] opacity-60">(Vous)</span>}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-850 bg-zinc-900/40 p-6 shadow-xl">
                  <AvatarSelector
                    selectedAvatar={hub.players.find((p) => p.peerId === hub.myPeerId)?.avatar || "👑"}
                    onSelectAvatar={hub.updateAvatar}
                    gameAvatars={selectedGameObj?.avatars}
                  />
                </div>

                <GameSelectionPanel
                  games={allGames}
                  selectedGame={hub.selectedGame}
                  isHost={hub.isHost}
                  catalogLoading={catalogLoading}
                  catalogError={catalogError}
                  enableLiveGames={enableLiveGames}
                  onSelect={hub.broadcastGameSelection}
                  onLaunch={() =>
                    hub.launchGame(selectedGameObj?.hasPreConfig ? "GAME_CONFIG" : "GAME_RUNNING")
                  }
                  onAddClick={enableLiveGames ? () => setIsAddModalOpen(true) : undefined}
                  onRemoveCustom={hub.removeCustomGame}
                />

                <TextChatPanel
                  messages={hub.chatMessages}
                  onSend={hub.sendChat}
                  title="Chat du Salon"
                  placeholder="Discuter avec le salon…"
                  emptyLabel="Aucun message. L'historique est conservé entre les jeux."
                  className="bg-zinc-900/40 border border-zinc-850 rounded-3xl p-5 shadow-xl flex flex-col text-zinc-100 text-sm"
                  maxHeight="220px"
                  scrollbarAccent="violet"
                />
              </div>
            )}
          </main>

          <footer className="max-w-7xl mx-auto w-full text-center text-[10px] text-zinc-600 py-6 px-4 border-t border-zinc-900 flex justify-between items-center">
            <div>hub-p2play - Réseau Privé Peer-to-Peer - Version v0.3.0</div>
            <a
              href="https://github.com/gab371/hub-p2play"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-violet-400 transition-colors"
            >
              <span>Dépôt GitHub</span>
            </a>
          </footer>
        </div>
      )}

      {enableLiveGames && (
        <AddGameModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onGameAdded={(meta) => hub.addCustomGameMeta(meta)}
          examples={quickExamples}
        />
      )}

      {enableHubVoice && hub.enableVoice && hub.roomId && (
        <VoiceChatPanel
          peerManager={hub.externalPeerManager}
          username={hub.players.find((p) => p.peerId === hub.myPeerId)?.username}
          avatar={hub.players.find((p) => p.peerId === hub.myPeerId)?.avatar || "👑"}
          draggable
          dragStorageKey="p2play-hub-voice-bubble"
        />
      )}
    </TooltipProvider>
  );
}
