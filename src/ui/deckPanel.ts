import type { LootItem } from '../sim/game';
import type { Privilege } from '../sim/actions';
import { programSize, usedMemory, type Program } from '../sim/programs';
import { SATS, sats } from '../sim/money';
import { showProgramInfo } from './programInfo';
import { programIcon } from './icons';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** What the gear panel shows: in a run it is the Game itself; on the main screen, the account. */
export interface GearSource {
  /** Programs loaded in memory. */
  programs: Program[];
  /** Memory size in GB. */
  memorySlots: number;
  loot: LootItem[];
  privileges: Set<Privilege>;
  keysFound: boolean;
}

export interface GearOptions {
  /** In a run: click a loaded program to run it. */
  run?: (program: Program) => void;
  /** In a run: click a downloaded program in data to load it into memory. */
  load?: (program: Program) => void;
  /** Main screen: programs you own that are not loaded, and a click that loads or unloads a program. */
  stored?: Program[];
  toggle?: (program: Program) => void;
}

/** The "your gear" panel: hardware (memory), programs, and what this run has taken. */
export function renderDeck(root: HTMLElement, game: GearSource, balance: number, opts: GearOptions = {}): void {
  const used = usedMemory(game.programs);
  const fits = (p: Program) => used + programSize(p) <= game.memorySlots;
  root.innerHTML = `
    <div class="deck-title">YOUR GEAR <span class="deck-balance">${sats(balance)}</span></div>
    <div class="deck-cols">
      <div>
        <h3>hardware</h3>
        <ul class="deck-hw"><li>memory</li><li class="deck-mem${used >= game.memorySlots * 0.9 ? ' is-full' : ''}">${used}/${game.memorySlots} GB</li></ul>
      </div>
      <div>
        <h3>software</h3>
        <ul class="deck-programs"></ul>
      </div>
      <div>
        <h3>data</h3>
        <ul class="deck-data"></ul>
        <h3 class="deck-sub">access</h3>
        <ul class="deck-access"></ul>
      </div>
    </div>`;
  const access = root.querySelector('.deck-access')!;
  const grants = [...game.privileges].map((p) => `${p} privilege`);
  if (game.keysFound) grants.push('encryption keys');
  if (!grants.length) access.innerHTML = '<li class="deck-empty">none</li>';
  for (const g of grants) {
    const li = document.createElement('li');
    li.textContent = g;
    access.appendChild(li);
  }
  const data = root.querySelector('.deck-data')!;
  if (!game.loot.length) data.innerHTML = '<li class="deck-empty">nothing yet</li>';
  for (const d of game.loot) {
    const li = document.createElement('li');
    if (d.software) {
      li.textContent = `${d.software.name}${d.loaded ? '  (loaded)' : ''}`;
      li.className = 'deck-loot-sw';
      if (!d.loaded && opts.load) {
        const full = !fits(d.software);
        li.classList.add(full ? 'is-blocked' : 'is-loadable');
        li.title = full ? `not enough memory (${programSize(d.software)} GB)` : `click to load it into memory (${programSize(d.software)} GB)`;
        if (!full) li.addEventListener('click', () => opts.load!(d.software!));
      }
    } else {
      li.textContent = `${d.name}  ${d.evaluated ? sats(d.price) : `? ${SATS}`}`;
    }
    data.appendChild(li);
  }
  const list = root.querySelector('.deck-programs')!;
  const row = (p: Program, stored: boolean) => {
    const li = document.createElement('li');
    li.className = `deck-program${p.rarity && p.rarity !== 'common' ? ` rarity-${p.rarity}` : ''}`;
    li.innerHTML = `${programIcon(p.type)}${esc(`${p.name.padEnd(18)} ${`${p.type} ${p.rating}`.padEnd(11)} ${String(programSize(p)).padStart(3)} GB`)}`;
    if (opts.toggle) {
      // Main screen: left or right click opens the program's info, with Load / Unload in it.
      li.classList.add(stored ? 'is-stored' : 'is-loaded');
      const full = stored && !fits(p);
      if (full) li.classList.add('is-blocked');
      li.title = 'click for details';
      const info = (e: Event) => {
        e.preventDefault();
        showProgramInfo(p, {
          status: stored ? 'in storage' : 'loaded in memory',
          action: { label: stored ? 'Load into memory' : 'Unload', run: () => opts.toggle!(p), disabled: full ? `not enough memory: needs ${programSize(p)} GB, ${game.memorySlots - used} GB free` : undefined },
        });
      };
      li.addEventListener('click', info);
      li.addEventListener('contextmenu', info);
    } else if (opts.run) {
      // In the net: left click runs it, right click shows its info.
      const n = game.programs.filter((q) => q.type === p.type).indexOf(p) + 1;
      li.title = `${p.name}  /  ${p.type} ${n}\nright click: details`;
      li.addEventListener('click', () => opts.run!(p));
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showProgramInfo(p, { status: 'loaded in memory' });
      });
    } else {
      li.classList.add('is-static');
    }
    // Developed programs: rarity and traits in the tooltip.
    list.appendChild(li);
  };
  for (const p of game.programs) row(p, false);
  if (opts.stored?.length) {
    const head = document.createElement('li');
    head.className = 'deck-empty deck-stored-head';
    head.textContent = 'in storage:';
    list.appendChild(head);
    for (const p of opts.stored) row(p, true);
  }
}
