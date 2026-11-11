import type { Game } from '../sim/game';
import type { Program } from '../sim/programs';
import { SATS, sats } from '../sim/money';

/** The panel under the console: your own hardware and programs. Click a program to run it. */
export function renderDeck(root: HTMLElement, game: Game, balance: number, run: (program: Program) => void): void {
  root.innerHTML = `
    <div class="deck-title">YOUR DECK <span class="deck-balance">${sats(balance)}</span></div>
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
    const n = game.programsOf(p.type).indexOf(p) + 1;
    const li = document.createElement('li');
    li.className = 'deck-program';
    li.textContent = `${p.name.padEnd(18)} ${p.type} ${p.rating}`;
    li.title = `${p.name}  /  ${p.type} ${n}`;
    li.addEventListener('click', () => run(p));
    list.appendChild(li);
  }
}
