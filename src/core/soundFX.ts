const MUTE_STORAGE_KEY = 'p2play:sound:muted';

/**
 * Synthesized UI sound effects for the P2Play Hub.
 * All sounds are generated on the fly via the Web Audio API — no audio assets.
 * The mute preference is persisted in localStorage and shared across all
 * P2Play games and the Hub (key `p2play:sound:muted`).
 */
export class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {
    try {
      const stored = localStorage.getItem(MUTE_STORAGE_KEY);
      if (stored !== null) {
        this.enabled = stored !== 'true';
      }
    } catch {
      // localStorage may be unavailable; keep default enabled.
    }
  }

  public init(): void {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(!enabled));
    } catch {
      // Ignore persistence errors.
    }
  }

  public playClick(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playPing(): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }
}

export const soundManager = new SoundFX();
