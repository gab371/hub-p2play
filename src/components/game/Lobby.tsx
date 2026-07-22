import { useState } from "react";
import { AvatarSelector } from "./AvatarSelector";

interface LobbyProps {
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  onCreate: (name: string, username: string, avatar: string) => void;
  onJoin: (name: string, username: string, avatar: string) => void;
}

export function Lobby({ status, onCreate, onJoin }: LobbyProps) {
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("👑");
  const [joinCode, setJoinCode] = useState("");

  const handleCreate = () => {
    if (!username.trim()) return;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let randomCode = "";
    for (let i = 0; i < 6; i++) {
      randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    onCreate(randomCode, username.trim(), avatar);
  };

  const handleJoin = () => {
    if (joinCode.trim() && username.trim()) {
      onJoin(joinCode.trim().toUpperCase(), username.trim(), avatar);
    }
  };

  return (
    <div className="max-w-md mx-auto p-8 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl relative text-center">
      <span className="text-6xl inline-block mb-4 animate-bounce">{avatar}</span>
      <h1 className="text-4xl font-black bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent tracking-tight mb-2">
        P2PLAY
      </h1>
      <p className="text-zinc-400 text-sm mb-6">Votre Hub de Jeux de Société P2P Sans Serveur</p>

      <div className="space-y-6">
        {/* Username field */}
        <div className="text-left">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
            Votre Pseudo
          </label>
          <input
            type="text"
            placeholder="Entrez votre pseudo..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={status === 'CONNECTING'}
            className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-850 focus:border-violet-500 text-zinc-150 outline-none transition-all disabled:opacity-50 text-center font-bold"
          />
        </div>

        {/* Avatar selector */}
        <AvatarSelector selectedAvatar={avatar} onSelectAvatar={setAvatar} />

        <div className="border-t border-zinc-850 my-4"></div>

        {/* Create room action */}
        <div className="p-4 bg-zinc-950/40 border border-zinc-850 rounded-2xl">
          <p className="text-xs text-zinc-400 mb-3 font-semibold">Commencer une nouvelle session en tant qu'Hôte</p>
          <button
            onClick={handleCreate}
            disabled={status === 'CONNECTING' || !username.trim()}
            className="w-full py-3.5 px-6 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30"
          >
            {status === 'CONNECTING' ? 'Création...' : 'Créer un salon'}
          </button>
        </div>

        <div className="relative flex items-center justify-center my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-850"></div>
          </div>
          <span className="relative px-3 text-xs uppercase font-bold text-zinc-500 bg-zinc-900">OU</span>
        </div>

        {/* Join room action */}
        <div className="space-y-3">
          <div className="text-left">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
              Saisir le code du salon
            </label>
            <input
              type="text"
              placeholder="CODE DU SALON..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              disabled={status === 'CONNECTING'}
              className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-850 focus:border-violet-500 text-zinc-150 outline-none transition-all disabled:opacity-50 text-center font-bold tracking-widest uppercase font-mono"
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={status === 'CONNECTING' || !joinCode.trim() || !username.trim()}
            className="w-full py-3.5 px-6 rounded-2xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-750 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Rejoindre un salon
          </button>
        </div>
      </div>
    </div>
  );
}
