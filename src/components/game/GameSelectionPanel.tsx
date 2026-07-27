import { Plus, Trash2 } from "lucide-react";

export interface SelectableHubGame {
  key: string;
  label: string;
  desc: string;
  hasPreConfig: boolean;
  isCustom: boolean;
}

interface GameSelectionPanelProps {
  games: SelectableHubGame[];
  selectedGame: string | null;
  isHost: boolean;
  catalogLoading: boolean;
  catalogError: string | null;
  enableLiveGames?: boolean;
  onSelect: (key: string) => void;
  onLaunch: () => void;
  onAddClick?: () => void;
  onRemoveCustom: (key: string) => void;
}

export function GameSelectionPanel({
  games,
  selectedGame,
  isHost,
  catalogLoading,
  catalogError,
  enableLiveGames = false,
  onSelect,
  onLaunch,
  onAddClick,
  onRemoveCustom,
}: GameSelectionPanelProps) {
  return (
    <div className="p-6 bg-zinc-900/40 border border-zinc-850 rounded-3xl shadow-xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-zinc-200">🎮 Sélectionner un jeu</h2>
          <p className="text-xs text-zinc-400">
            {isHost ? "Choisissez le jeu de votre partie" : "En attente du choix de l'hôte..."}
          </p>
        </div>
        {isHost && selectedGame && (
          <button
            type="button"
            onClick={onLaunch}
            className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 font-bold rounded-xl text-white transition-all shadow-lg shadow-violet-900/30"
          >
            Lancer la partie
          </button>
        )}
      </div>

      {catalogError && (
        <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded-xl px-3 py-2">
          {catalogError}
        </p>
      )}

      {catalogLoading ? (
        <p className="text-sm text-zinc-500">Chargement du catalogue de jeux…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {games.map((g) => (
            <div key={g.key} className="relative group">
              <button
                type="button"
                onClick={() => isHost && onSelect(g.key)}
                disabled={!isHost}
                className={`w-full p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-4 h-36 ${
                  selectedGame === g.key
                    ? "bg-violet-950/20 border-violet-500 ring-2 ring-violet-500"
                    : "bg-zinc-950/50 border-zinc-850 hover:bg-zinc-900/30"
                } ${!isHost ? "cursor-not-allowed" : ""}`}
              >
                <div>
                  <h3 className="font-bold text-zinc-200">
                    {g.label}
                    {g.isCustom ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-400 font-black">
                        Live
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">{g.desc}</p>
                </div>
              </button>

              {g.isCustom && isHost && enableLiveGames && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustom(g.key);
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/30 transition-all"
                  title="Supprimer ce jeu custom"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          {isHost && enableLiveGames && onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              className="p-5 rounded-2xl border border-dashed border-zinc-700 hover:border-violet-500/50 text-left transition-all flex flex-col justify-center items-center gap-2 h-36 bg-zinc-950/30 hover:bg-zinc-900/40 text-zinc-400 hover:text-violet-300"
            >
              <Plus className="w-6 h-6" />
              <span className="text-xs font-bold">Ajouter un jeu</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
