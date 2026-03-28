/**
 * CalendarSFX — procedural Web Audio sound effects for calendar interactions.
 *
 * All sounds are generated via oscillators/noise (no audio files).
 * AudioContext is lazily initialised on first play() call (browser autoplay policy).
 * Mute state is persisted to localStorage under 'grove-sfx-muted'.
 */

export type SoundKey = 'spawn' | 'dissolve' | 'shimmer' | 'warp' | 'navigate' | 'scroll';

const STORAGE_KEY = 'grove-sfx-muted';

class CalendarSFX {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.35;
  private muted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          this.muted = stored === 'true';
        }
      } catch {
        // localStorage unavailable (private browsing, etc.) — ignore
      }
    }
  }

  // ── public API ──────────────────────────────────────────────

  play(key: SoundKey): void {
    if (this.muted) return;
    if (typeof window === 'undefined') return;
    this.ensureContext();
    const ctx = this.ctx!;
    const master = this.masterGain!;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    switch (key) {
      case 'spawn':
        this.playSpawn(ctx, master);
        break;
      case 'dissolve':
        this.playDissolve(ctx, master);
        break;
      case 'shimmer':
        this.playShimmer(ctx, master);
        break;
      case 'warp':
        this.playWarp(ctx, master);
        break;
      case 'navigate':
        this.playNavigate(ctx, master);
        break;
      case 'scroll':
        this.playScroll(ctx, master);
        break;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, String(m));
      } catch {
        // localStorage unavailable — ignore
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ── lazy init ───────────────────────────────────────────────

  private ensureContext(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  // ── sound generators ────────────────────────────────────────

  /** spawn: ascending tone sweep 200Hz → 800Hz, 150ms */
  private playSpawn(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.15);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** dissolve: descending tone sweep 600Hz → 100Hz, 200ms */
  private playDissolve(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** shimmer: bell-like ping 1200Hz, quick decay, 100ms */
  private playShimmer(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.1);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** warp: sawtooth pitch sweep 400Hz → 1600Hz → 400Hz with bandpass Q=4, 200ms */
  private playWarp(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.Q.setValueAtTime(4, t);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(filter).connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** navigate: noise burst with bandpass 4kHz Q=3, 50ms */
  private playNavigate(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const sampleRate = ctx.sampleRate;
    const duration = 0.05;
    const length = Math.ceil(sampleRate * duration);

    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 50);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.Q.setValueAtTime(3, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** scroll: sine 600Hz → 400Hz, 30ms, volume 0.08 */
  private playScroll(ctx: AudioContext, master: GainNode): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.03);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const calendarSFX = new CalendarSFX();
