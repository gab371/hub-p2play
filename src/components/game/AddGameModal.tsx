import { useState } from "react";
import { X, Download, AlertCircle, CheckCircle2, Loader2, Sparkles, Globe } from "lucide-react";
import { fetchAndPrepareCustomGame, type CustomGameMeta } from "../../utils/customGameLoader";

export interface QuickGameExample {
  label: string;
  slug: string;
}

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded: (meta: CustomGameMeta) => void;
  /** Quick picks from catalog.json (repos injected from games.json at build). */
  examples?: QuickGameExample[];
}

export function AddGameModal({
  isOpen,
  onClose,
  onGameAdded,
  examples = [],
}: AddGameModalProps) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMeta, setSuccessMeta] = useState<CustomGameMeta | null>(null);

  if (!isOpen) return null;

  const handleAddGame = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim() || loading) return;

    setError(null);
    setSuccessMeta(null);
    setLoading(true);
    setProgressMsg("Initialisation…");

    try {
      const { meta } = await fetchAndPrepareCustomGame(urlInput, (msg) => setProgressMsg(msg));
      setSuccessMeta(meta);
      onGameAdded(meta);
      window.setTimeout(() => {
        setLoading(false);
        setProgressMsg(null);
        setUrlInput("");
        setSuccessMeta(null);
        onClose();
      }, 900);
    } catch (err: unknown) {
      console.error("Failed to add custom game:", err);
      const message = err instanceof Error ? err.message : "Échec de l'ajout du jeu.";
      setError(message);
      setLoading(false);
      setProgressMsg(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-game-title"
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative space-y-6"
      >
        <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-950/60 border border-violet-850 rounded-2xl text-violet-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="add-game-title" className="text-lg font-bold text-zinc-100">
                Ajouter un jeu GitHub Live
              </h3>
              <p className="text-xs text-zinc-400">
                Chargez une release compatible P2Play (dist.zip + hub-manifest.json)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAddGame} className="space-y-4">
          <div>
            <label htmlFor="github-game-url" className="block text-xs font-semibold text-zinc-300 mb-2">
              URL ou slug du dépôt GitHub
            </label>
            <div className="relative">
              <Globe className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="github-game-url"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="owner/repo ou https://github.com/owner/repo"
                disabled={loading}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 text-zinc-100 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none transition-all placeholder:text-zinc-600 disabled:opacity-60"
              />
            </div>
          </div>

          {examples.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] text-zinc-400 font-medium">Exemples rapides :</span>
              <div className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <button
                    key={ex.slug}
                    type="button"
                    data-quick-example={ex.slug}
                    onClick={() => {
                      setUrlInput(ex.slug);
                      setError(null);
                    }}
                    disabled={loading}
                    className="px-3 py-1.5 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs rounded-xl font-medium transition-all"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="p-4 bg-violet-950/20 border border-violet-850/60 rounded-2xl flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin flex-shrink-0" />
              <span className="text-xs font-semibold text-violet-300">
                {progressMsg || "Chargement du jeu en cours…"}
              </span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-950/30 border border-rose-900/50 rounded-2xl flex items-start gap-3 text-rose-300">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold block">Erreur de chargement</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMeta && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-2xl flex items-center gap-3 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold block">Jeu prêt !</span>
                <span>&quot;{successMeta.name}&quot; ajouté au Hub.</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!urlInput.trim() || loading}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-violet-950/50 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Chargement…</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Ajouter le jeu</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
