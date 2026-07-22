import { useState } from "react";

interface AvatarSelectorProps {
  selectedAvatar: string;
  onSelectAvatar: (avatar: string) => void;
  selectedGameKey?: string | null;
}

const P2PLAY_AVATARS = ["👑", "🎮", "🤠", "🦊", "🐯", "🦉", "🦁", "🐍", "🚀", "💎", "🎲", "🏆"];

const GAME_AVATARS: Record<string, string[]> = {
  skull: ["💀", "🌹", "🦊", "🐯", "🦉", "🐍"],
  royal: ["👑", "🏰", "🗡️", "⚜️", "🪙", "🛡️", "🦁", "🦅"],
  sheriff: ["🤠", "👩‍🌾", "🧙‍♂️", "👨‍🍳", "👰‍♀️", "🤵‍♂️", "🌵", "🐎"]
};

export function AvatarSelector({ selectedAvatar, onSelectAvatar, selectedGameKey }: AvatarSelectorProps) {
  const [tab, setTab] = useState<'p2play' | 'game'>('p2play');

  const currentGameAvatars = selectedGameKey ? GAME_AVATARS[selectedGameKey] || [] : [];

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
          Choisir votre Émote
        </label>
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-850 text-xs">
          <button
            type="button"
            onClick={() => setTab('p2play')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${
              tab === 'p2play'
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            P2Play
          </button>
          {selectedGameKey && currentGameAvatars.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('game')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                tab === 'game'
                  ? "bg-violet-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Émotes du Jeu
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 p-3 bg-zinc-950 border border-zinc-850 rounded-2xl">
        {(tab === 'p2play' ? P2PLAY_AVATARS : currentGameAvatars).map((avatar) => (
          <button
            key={avatar}
            type="button"
            onClick={() => onSelectAvatar(avatar)}
            className={`w-10 h-10 text-xl rounded-xl flex items-center justify-center transition-all ${
              selectedAvatar === avatar
                ? "bg-violet-600 border-2 border-violet-400 scale-110 shadow-lg shadow-violet-900/40"
                : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:scale-105"
            }`}
          >
            {avatar}
          </button>
        ))}
      </div>
    </div>
  );
}
