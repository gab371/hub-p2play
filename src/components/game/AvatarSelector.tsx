import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AvatarSelectorProps {
  selectedAvatar: string;
  onSelectAvatar: (avatar: string) => void;
  /** From hub-manifest.json `avatars` for the selected game. */
  gameAvatars?: string[];
  /** Home card is narrow → grid. Room panel is wide → single-line wrap. */
  layout?: "grid" | "wrap";
}

const P2PLAY_AVATARS = ["👑", "🎮", "🤠", "🦊", "🐯", "🦉", "🦁", "🐍", "🎱", "🎯", "🚀", "💎", "🎲", "🏆"];

export function AvatarSelector({
  selectedAvatar,
  onSelectAvatar,
  gameAvatars = [],
  layout = "wrap",
}: AvatarSelectorProps) {
  const [tab, setTab] = useState<"p2play" | "game">("p2play");

  const gridClass =
    layout === "grid"
      ? "grid grid-cols-7 gap-2 justify-items-center rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
      : "flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3";

  return (
    <div className="flex flex-col gap-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
          Choisir votre Émote
        </label>
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          <Button
            type="button"
            size="xs"
            variant={tab === "p2play" ? "default" : "ghost"}
            className="rounded-lg"
            onClick={() => setTab("p2play")}
          >
            P2Play
          </Button>
          {gameAvatars.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant={tab === "game" ? "default" : "ghost"}
              className="rounded-lg"
              onClick={() => setTab("game")}
            >
              Émotes du Jeu
            </Button>
          )}
        </div>
      </div>

      <div className={gridClass}>
        {(tab === "p2play" ? P2PLAY_AVATARS : gameAvatars).map((avatar) => {
          const selected = selectedAvatar === avatar;
          return (
            <Button
              key={avatar}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSelectAvatar(avatar)}
              aria-pressed={selected}
              className={cn(
                "size-10 rounded-xl border-2 border-transparent bg-transparent text-xl shadow-none transition-all",
                "hover:bg-zinc-800 hover:text-inherit dark:hover:bg-zinc-800",
                selected &&
                  "scale-110 border-violet-400 bg-violet-600/80 shadow-[0_0_14px_rgba(139,92,246,0.7)] hover:bg-violet-600/80",
              )}
            >
              {avatar}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
