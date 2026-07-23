import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { soundManager } from "../../core/soundFX";

const MUTE_STORAGE_KEY = "p2play:sound:muted";

interface SoundToggleProps {
  /** Optional extra classes for the button (e.g. theme color overrides). */
  className?: string;
}

/**
 * Mute / Unmute button shared across all P2Play games and the Hub.
 * Persists the preference in localStorage under `p2play:sound:muted` so a
 * single toggle is honored everywhere. Plays a short click on reactivation
 * for immediate audible feedback.
 */
export function SoundToggle({ className = "" }: SoundToggleProps) {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    soundManager.setEnabled(!muted);
  }, [muted]);

  const toggle = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    soundManager.setEnabled(!nextMuted);
    if (!nextMuted) {
      soundManager.playClick();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? "Activer le son" : "Couper le son"}
      title={muted ? "Activer le son" : "Couper le son"}
      className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${className}`}
    >
      {muted ? (
        <VolumeX className="w-4 h-4" />
      ) : (
        <Volume2 className="w-4 h-4" />
      )}
    </button>
  );
}

export default SoundToggle;
