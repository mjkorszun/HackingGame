/**
 * Sound effects. Sounds come from Kenney's CC0 packs (see public/sfx/LICENSE.txt).
 * Uses Web Audio so short sounds can overlap with no delay.
 */
const SOUNDS = {
  linkUp: 'computer_noise_001_1s.ogg',
  connect: 'select_001.wav',
  arrive: 'confirmation_001.wav',
  pause: 'low_down.ogg',
  resume: 'two_tone_1.ogg',
  menuOpen: 'switch_005.wav',
  menuItem: 'click_001.wav',
  menuClose: 'click_002.wav',
  hop: 'tick_002.wav',
  hover: { file: 'glass_001.wav', volume: 0.7 },
  command: 'switch_001.wav',
  error: 'error_005.wav',
  key: 'click1.wav',
  // One sound per program type, played when it starts.
  scout: 'zap_three_tone_up.ogg',
  scan: 'three_tone_1.ogg',
} as const;

export type SoundName = keyof typeof SOUNDS;

/** A sound is a file name, or a file with its own volume (0..1, relative to the master volume). */
type SoundDef = string | { file: string; volume: number };

function fileOf(def: SoundDef): string {
  return typeof def === 'string' ? def : def.file;
}

function volumeOf(def: SoundDef): number {
  return typeof def === 'string' ? 1 : def.volume;
}

const STORAGE_KEY = 'cyberhack.sound';

function loadSettings(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.volume === 'number' && typeof s.muted === 'boolean') return s;
    }
  } catch {
    /* storage unavailable: use defaults */
  }
  return { volume: 0.6, muted: false };
}

export class Sound {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  volume: number;
  muted: boolean;
  /** Called once, when audio is unlocked by the first user gesture and sounds are loaded. */
  onReady: (() => void) | null = null;

  constructor(private readonly baseUrl: string) {
    const s = loadSettings();
    this.volume = s.volume;
    this.muted = s.muted;
    // Browsers only allow audio after a user gesture.
    const unlock = () => {
      this.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  play(name: SoundName): void {
    if (this.muted || !this.ctx || !this.gain) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const vol = volumeOf(SOUNDS[name] as SoundDef);
    if (vol === 1) {
      src.connect(this.gain);
    } else {
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(this.gain);
    }
    src.start();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this.volume;
    this.save();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.save();
  }

  private init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
    this.loading = this.loadAll().then(() => this.onReady?.());
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!;
    await Promise.all(
      (Object.keys(SOUNDS) as SoundName[]).map(async (name) => {
        try {
          const res = await fetch(`${this.baseUrl}sfx/${fileOf(SOUNDS[name] as SoundDef)}`);
          const data = await res.arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch {
          /* a missing sound must never break the game */
        }
      }),
    );
  }

  get ready(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }
}
