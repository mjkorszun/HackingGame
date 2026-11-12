import { sats } from '../sim/money';
import { showCredits } from './credits';
import { GameMenu } from './gameMenu';
import { allSlots, lastSlot, type SlotInfo } from './saves';
import type { Sound } from './sound';

export interface MainMenuActions {
  /** Plays the chosen slot: loads its game, or starts a new one there when `fresh`. */
  play: (slot: number, fresh: boolean) => void;
}

type View = 'root' | 'new' | 'load';

function when(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
}

function describe(s: SlotInfo): string {
  return `day ${s.day} · ${sats(s.sats)} · level ${s.level} · health ${s.health}%${s.savedAt ? ` <span class="mm-when">${when(s.savedAt)}</span>` : ''}`;
}

/**
 * The main menu: what the game opens with, before any save is loaded. Continue, New game,
 * Load game, Options (the game menu), Credits and Quit (greyed out in the browser).
 */
export function showMainMenu(sound: Sound, actions: MainMenuActions): void {
  const root = document.createElement('div');
  root.className = 'main-menu';
  const options = new GameMenu(sound, { closeTitle: 'Back (Esc)' });
  const tag = document.createElement('div');
  tag.className = 'build-tag';
  tag.textContent = __BUILD_LABEL__;
  let view: View = 'root';
  let confirm = 0;

  const click = () => sound.play('menuItem');
  let cleanup = () => {};
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
    cleanup();
  };
  const play = (slot: number, fresh: boolean) => {
    click();
    close();
    actions.play(slot, fresh);
  };

  function render(): void {
    renderView();
    root.append(tag);
  }

  function renderView(): void {
    if (view === 'root') {
      const last = lastSlot();
      root.innerHTML = `
        <h1 class="home-title">CYBERHACK</h1>
        <nav class="home-menu">
          <button type="button" class="home-btn" data-mm="continue"${last ? '' : ' disabled'}>Continue</button>
          <button type="button" class="home-btn" data-mm="new">New game</button>
          <button type="button" class="home-btn" data-mm="load"${allSlots().some(Boolean) ? '' : ' disabled'}>Load game</button>
          <button type="button" class="home-btn" data-mm="options">Options</button>
          <button type="button" class="home-btn" data-mm="credits">Credits</button>
          <button type="button" class="home-btn" data-mm="quit" disabled title="Not in the browser version">Quit</button>
        </nav>`;
      root.querySelector('[data-mm="continue"]')!.addEventListener('click', () => last && play(last, false));
      for (const v of ['new', 'load'] as const) {
        root.querySelector(`[data-mm="${v}"]`)!.addEventListener('click', () => {
          click();
          view = v;
          confirm = 0;
          render();
        });
      }
      root.querySelector('[data-mm="options"]')!.addEventListener('click', () => options.toggle(true));
      root.querySelector('[data-mm="credits"]')!.addEventListener('click', () => {
        click();
        showCredits();
      });
    } else {
      const slots = allSlots();
      const rows = slots
        .map((s, i) => {
          const n = i + 1;
          const asking = confirm === n;
          const disabled = view === 'load' && !s;
          return `<div class="mm-slot${asking ? ' is-asking' : ''}">
            <button type="button" class="mm-slot-btn" data-slot="${n}"${disabled ? ' disabled' : ''}>
              <span class="mm-slot-name">slot ${n}</span>
              <span class="mm-slot-info">${s ? describe(s) : '<span class="mm-empty">empty</span>'}</span>
            </button>
            ${asking ? `<div class="mm-confirm">Overwrite this save? <button type="button" class="mm-yes" data-yes="${n}">Overwrite</button><button type="button" class="mm-no">Cancel</button></div>` : ''}
          </div>`;
        })
        .join('');
      root.innerHTML = `
        <h1 class="home-title">CYBERHACK</h1>
        <h2 class="mm-head">${view === 'new' ? 'new game: choose a slot' : 'load game'}</h2>
        <div class="mm-slots">${rows}</div>
        <button type="button" class="home-btn mm-back">Back</button>`;
      root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) =>
        b.addEventListener('click', () => {
          const n = Number(b.dataset.slot);
          if (view === 'load') return play(n, false);
          // Starting over a save asks first.
          if (slots[n - 1]) {
            click();
            confirm = n;
            render();
          } else play(n, true);
        }),
      );
      root.querySelector('[data-yes]')?.addEventListener('click', () => play(confirm, true));
      root.querySelector('.mm-no')?.addEventListener('click', () => {
        click();
        confirm = 0;
        render();
      });
      root.querySelector('.mm-back')!.addEventListener('click', back);
    }
  }

  function back(): void {
    sound.play('menuClose');
    view = 'root';
    confirm = 0;
    render();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (options.open) options.toggle(false);
    else if (document.querySelector('.run-summary.credits')) return;
    else if (view !== 'root') back();
  }

  document.addEventListener('keydown', onKey);
  render();
  document.body.append(root, options.box);
  cleanup = () => options.box.remove();
}
