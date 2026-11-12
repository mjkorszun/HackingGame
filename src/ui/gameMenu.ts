import type { Sound } from './sound';

const icon = (body: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${body}</svg>`;
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
const ICON_SPEAKER_ON = icon(`${SPEAKER}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
const ICON_SPEAKER_OFF = icon(`${SPEAKER}<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);

export interface GameMenuOptions {
  /** The mute button (the net routes it through the console); toggles the sound when not given. */
  mute?: () => void;
  /** Told after the menu opens or closes. */
  toggled?: (open: boolean) => void;
  /** Tooltip of the close button. */
  closeTitle?: string;
}

/**
 * The game menu: a window in the middle of the screen. Opened with the gear or Esc in the net,
 * and as Options from the main menu. For now only the sound settings.
 */
export class GameMenu {
  readonly box: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;

  constructor(private readonly sound: Sound, private readonly opts: GameMenuOptions = {}) {
    const soundBox = document.createElement('div');
    soundBox.className = 'sound-box';
    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.className = 'mute-btn';
    this.muteBtn.title = 'Sound on / off (M)';
    this.muteBtn.addEventListener('click', () => {
      if (opts.mute) opts.mute();
      else sound.toggleMute();
      this.refresh();
    });
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(sound.volume * 100));
    vol.className = 'volume';
    vol.title = 'Volume';
    vol.setAttribute('aria-label', 'Volume');
    vol.addEventListener('input', () => sound.setVolume(Number(vol.value) / 100));
    vol.addEventListener('change', () => sound.play('hop'));
    soundBox.append(this.muteBtn, vol);
    this.box = document.createElement('div');
    this.box.className = 'game-menu';
    this.box.hidden = true;
    const title = opts.closeTitle ?? 'Back to the game (Esc)';
    this.box.innerHTML = `<div class="game-menu-panel" role="dialog" aria-label="Menu"><button type="button" class="game-menu-close" aria-label="Close (Esc)" title="${title}">✕</button><h2>MENU</h2><h3>sound</h3><div class="game-menu-row"></div></div>`;
    this.box.querySelector('.game-menu-row')!.append(soundBox);
    this.box.querySelector('.game-menu-close')!.addEventListener('click', () => this.toggle(false));
    this.box.addEventListener('mousedown', (e) => {
      if (e.target === this.box) this.toggle(false);
    });
    this.refresh();
  }

  get open(): boolean {
    return !this.box.hidden;
  }

  /** Opens or closes the menu (toggles when not told which). */
  toggle(open = !this.open): void {
    if (open === this.open) return;
    this.box.hidden = !open;
    this.refresh();
    this.sound.play(open ? 'menuOpen' : 'menuClose');
    this.opts.toggled?.(open);
  }

  /** Shows the mute state, which a key may have changed. */
  refresh(): void {
    const muted = this.sound.muted;
    if (this.muteBtn.dataset.muted !== String(muted)) {
      this.muteBtn.dataset.muted = String(muted);
      this.muteBtn.innerHTML = muted ? ICON_SPEAKER_OFF : ICON_SPEAKER_ON;
    }
    this.muteBtn.classList.toggle('is-muted', muted);
  }
}
