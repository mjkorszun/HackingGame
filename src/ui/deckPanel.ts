import type { LootItem } from '../sim/game';
import type { Privilege } from '../sim/actions';
import type { Program } from '../sim/programs';
import { SATS, sats } from '../sim/money';

/** What the gear panel shows: in a run it is the Game itself; on the main screen, the account. */
export interface GearSource {
  /** Programs loaded in memory. */
  programs: Program[];
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
  const used = game.programs.length;
  root.innerHTML = `
    <div class="deck-title">YOUR GEAR <span class="deck-balance">${sats(balance)}</span></div>
    <div class="deck-cols">
      <div>
        <h3>hardware</h3>
        <ul class="deck-hw"><li>memory</li><li class="deck-mem${used >= game.memorySlots ? ' is-full' : ''}">${used}/${game.memorySlots} programs</li></ul>
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
        const full = used >= game.memorySlots;
        li.classList.add(full ? 'is-blocked' : 'is-loadable');
        li.title = full ? 'memory full' : 'click to load it into memory';
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
    li.className = 'deck-program';
    li.textContent = `${p.name.padEnd(18)} ${p.type} ${p.rating}`;
    if (opts.toggle) {
      li.classList.add(stored ? 'is-stored' : 'is-loaded');
      const full = stored && used >= game.memorySlots;
      li.title = stored ? (full ? 'in storage: memory full' : 'in storage: click to load into memory') : 'loaded: click to unload';
      if (!full) li.addEventListener('click', () => opts.toggle!(p));
      else li.classList.add('is-blocked');
    } else if (opts.run) {
      const n = game.programs.filter((q) => q.type === p.type).indexOf(p) + 1;
      li.title = `${p.name}  /  ${p.type} ${n}`;
      li.addEventListener('click', () => opts.run!(p));
    } else {
      li.classList.add('is-static');
    }
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
