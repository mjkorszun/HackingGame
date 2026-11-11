import type { Game } from '../sim/game';

/** The panel under the console: your own hardware and programs. Click a program to run it. */
export function renderDeck(root: HTMLElement, game: Game, run: (id: string) => void): void {
  root.innerHTML = `
    <div class="deck-title">YOUR DECK</div>
    <div class="deck-cols">
      <div>
        <h3>hardware</h3>
        <div class="deck-empty">no data yet</div>
      </div>
      <div>
        <h3>programs</h3>
        <ul class="deck-programs"></ul>
      </div>
    </div>`;
  const list = root.querySelector('.deck-programs')!;
  for (const p of game.programs) {
    const li = document.createElement('li');
    li.className = 'deck-program';
    li.textContent = `${p.name.padEnd(10)} ${p.rating}`;
    li.title = `run ${p.id}`;
    li.addEventListener('click', () => run(p.id));
    list.appendChild(li);
  }
}
