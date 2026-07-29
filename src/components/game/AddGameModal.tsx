import { useState } from "react";
import { Download, AlertCircle, CheckCircle2, Loader2, Sparkles, Globe } from "lucide-react";
import { fetchAndPrepareCustomGame, type CustomGameMeta } from "../../utils/customGameLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <Dialog open={isOpen} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent
        className="sm:max-w-lg gap-6 p-6 md:p-8"
        showCloseButton={!loading}
        onPointerDownOutside={(e) => loading && e.preventDefault()}
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b border-border pb-4">
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-2.5 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div className="flex flex-col gap-1 text-left">
            <DialogTitle className="text-lg font-bold">
              Ajouter un jeu GitHub Live
            </DialogTitle>
            <DialogDescription className="text-xs">
              Chargez une release compatible P2Play (dist.zip + hub-manifest.json)
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleAddGame} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="github-game-url" className="text-xs font-semibold text-foreground">
              URL ou slug du dépôt GitHub
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="github-game-url"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="owner/repo ou https://github.com/owner/repo"
                disabled={loading}
                className="h-11 pl-11"
              />
            </div>
          </div>

          {examples.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                Exemples rapides :
              </span>
              <div className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <Button
                    key={ex.slug}
                    type="button"
                    variant="outline"
                    size="sm"
                    data-quick-example={ex.slug}
                    onClick={() => {
                      setUrlInput(ex.slug);
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    {ex.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
              <span className="text-xs font-semibold text-primary">
                {progressMsg || "Chargement du jeu en cours…"}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <div className="flex flex-col gap-1 text-xs">
                <span className="font-bold">Erreur de chargement</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMeta && (
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-emerald-300",
              )}
            >
              <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
              <div className="text-xs">
                <span className="block font-bold">Jeu prêt !</span>
                <span>&quot;{successMeta.name}&quot; ajouté au Hub.</span>
              </div>
            </div>
          )}

          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2 sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={!urlInput.trim() || loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  Chargement…
                </>
              ) : (
                <>
                  <Download data-icon="inline-start" />
                  Ajouter le jeu
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
