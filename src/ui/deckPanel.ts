import type { LootItem } from '../sim/game';
import type { Privilege } from '../sim/actions';
import type { Program } from '../sim/programs';
import { SATS, sats } from '../sim/money';

/** What the gear panel shows: in a run it is the Game itself; on the main screen, the account. */
export interface GearSource {
  programs: Program[];
  loot: LootItem[];
  privileges: Set<Privilege>;
  keysFound: boolean;
}

/** The "your gear" panel: hardware, programs, and what this run has taken. Click a program to run it (in a run). */
export function renderDeck(root: HTMLElement, game: GearSource, balance: number, run?: (program: Program) => void): void {
  root.innerHTML = `
    <div class="deck-title">YOUR GEAR <span class="deck-balance">${sats(balance)}</span></div>
    <div class="deck-cols">
      <div>
        <h3>hardware</h3>
        <div class="deck-empty">no data yet</div>
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
    li.textContent = d.software ? `${d.name}  ${d.software.name}` : `${d.name}  ${d.evaluated ? sats(d.price) : `? ${SATS}`}`;
    data.appendChild(li);
  }
  const list = root.querySelector('.deck-programs')!;
  for (const p of game.programs) {
    const n = game.programs.filter((q) => q.type === p.type).indexOf(p) + 1;
    const li = document.createElement('li');
    li.className = run ? 'deck-program' : 'deck-program is-static';
    li.textContent = `${p.name.padEnd(18)} ${p.type} ${p.rating}`;
    li.title = `${p.name}  /  ${p.type} ${n}`;
    if (run) li.addEventListener('click', () => run(p));
    list.appendChild(li);
  }
}
