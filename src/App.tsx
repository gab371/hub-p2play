import { useState } from "react";
import { useHub } from "./hooks/useHub";
import { Lobby } from "./components/game/Lobby";
import { GameMountPanel } from "./components/game/GameMountPanel";
import { AvatarSelector } from "./components/game/AvatarSelector";
import { Gamepad2 } from "lucide-react";
import { SoundToggle } from "./components/ui/SoundToggle";

export default function App() {
  const hub = useHub();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (hub.roomId) {
      navigator.clipboard.writeText(hub.roomId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const showLobby = !hub.roomId;

  const AVAILABLE_GAMES = [
    { key: "skull", name: "💀 Skull & Roses", desc: "Mises, Bluff & Roses." },
    { key: "royal", name: "👑 Royal Bluff (Coup)", desc: "Influence & Rôles cachés." },
    { key: "sheriff", name: "🤠 Sheriff & Smugglers", desc: "Négociation & Pots-de-vin." },
    { key: "pool", name: "🎱 8 Ball Pool", desc: "Billard par équipes + spectateurs." }
  ];

  return (
    <div className="min-h-screen text-zinc-50 font-sans flex flex-col justify-between relative">
      {/* Background radial decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.08),transparent_70%)] pointer-events-none" />

      {/* Header */}
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
          <SoundToggle className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border-zinc-800" />
          {hub.roomId && (
            <div className="flex items-center gap-3 text-xs">
              <span className="bg-emerald-950/80 border border-emerald-800 text-emerald-400 px-3 py-1.5 rounded-full font-bold">
                Salon Connecté
              </span>
              <span className="text-zinc-400 font-mono bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-850">
                Code : <span className="text-violet-400 font-bold">{hub.roomId}</span>
              </span>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 font-bold rounded-xl border border-zinc-750 transition-all"
              >
                {copied ? "Copié !" : "Copier"}
              </button>
              <button
                onClick={hub.disconnect}
                className="px-2.5 py-1.5 bg-rose-950/20 hover:bg-rose-900/20 text-rose-400 border border-rose-900/30 rounded-xl font-bold transition-all"
              >
                Quitter
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 relative z-10">
        {showLobby ? (
          <Lobby
            status={hub.status}
            onCreate={hub.createRoom}
            onJoin={hub.joinRoom}
          />
        ) : hub.activeGame ? (
          <GameMountPanel
            gameName={hub.activeGame}
            peerId={hub.myPeerId || ""}
            playerName={hub.players.find(p => p.peerId === hub.myPeerId)?.username || "Joueur"}
            playerAvatar={hub.players.find(p => p.peerId === hub.myPeerId)?.avatar || "👑"}
            externalPeerManager={hub.externalPeerManager}
            onExit={hub.returnToHub}
          />
        ) : (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="p-6 bg-zinc-900/40 border border-zinc-850 rounded-3xl shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-zinc-200">👥 Joueurs Connectés ({hub.players.length})</h2>
              <div className="flex flex-wrap gap-2">
                {hub.players.map((p, idx) => (
                  <span
                    key={p.peerId}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                      p.peerId === hub.myPeerId
                        ? "bg-violet-950/30 border-violet-850 text-violet-400"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    <span className="text-base">{p.avatar || (idx === 0 ? "👑" : "👤")}</span>
                    <span>{p.username}</span>
                    {p.peerId === hub.myPeerId && <span className="text-[10px] opacity-60">(Vous)</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* Avatar Selector in room */}
            <div className="p-6 bg-zinc-900/40 border border-zinc-850 rounded-3xl shadow-xl">
              <AvatarSelector
                selectedAvatar={hub.players.find(p => p.peerId === hub.myPeerId)?.avatar || "👑"}
                onSelectAvatar={hub.updateAvatar}
                selectedGameKey={hub.selectedGame}
              />
            </div>

            <div className="p-6 bg-zinc-900/40 border border-zinc-850 rounded-3xl shadow-xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-zinc-200">🎮 Sélectionner un jeu</h2>
                  <p className="text-xs text-zinc-400">
                    {hub.isHost ? "Choisissez le jeu de votre partie" : "En attente du choix de l'hôte..."}
                  </p>
                </div>
                {hub.isHost && hub.selectedGame && (
                  <button
                    onClick={hub.launchGame}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 font-bold rounded-xl text-white transition-all shadow-lg shadow-violet-900/30"
                  >
                    Lancer la partie
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {AVAILABLE_GAMES.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => hub.isHost && hub.broadcastGameSelection(g.key)}
                    disabled={!hub.isHost}
                    className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-4 h-36 ${
                      hub.selectedGame === g.key
                        ? "bg-violet-950/20 border-violet-500 ring-2 ring-violet-500"
                        : "bg-zinc-950/50 border-zinc-850 hover:bg-zinc-900/30"
                    } ${!hub.isHost ? "cursor-not-allowed" : ""}`}
                  >
                    <div>
                      <h3 className="font-bold text-zinc-200">{g.name}</h3>
                      <p className="text-xs text-zinc-400 mt-1">{g.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto w-full text-center text-[10px] text-zinc-600 py-6 px-4 border-t border-zinc-900 flex justify-between items-center">
        <div>hub-p2play - Réseau Privé Peer-to-Peer - Version v0.1.0</div>
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
  );
}
