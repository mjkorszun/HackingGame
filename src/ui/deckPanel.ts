import type { Game } from '../sim/game';
import type { Program } from '../sim/programs';

/** The panel under the console: your own hardware and programs. Click a program to run it. */
export function renderDeck(root: HTMLElement, game: Game, run: (program: Program) => void): void {
  root.innerHTML = `
    <div class="deck-title">YOUR DECK</div>
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
      </div>
    </div>`;
  const data = root.querySelector('.deck-data')!;
  if (!game.downloads.length) data.innerHTML = '<li class="deck-empty">nothing yet</li>';
  for (const d of game.downloads) {
    const li = document.createElement('li');
    li.textContent = d.price !== undefined ? `${d.name}  ${d.price} cr` : `${d.name}  ? cr`;
    data.appendChild(li);
  }
  const list = root.querySelector('.deck-programs')!;
  for (const p of game.programs) {
    const n = game.programsOf(p.type).indexOf(p) + 1;
    const li = document.createElement('li');
    li.className = 'deck-program';
    li.textContent = `${p.name.padEnd(14)} ${p.type} ${p.rating}`;
    li.title = `${p.name}  /  ${p.type} ${n}`;
    li.addEventListener('click', () => run(p));
    list.appendChild(li);
  }
}
