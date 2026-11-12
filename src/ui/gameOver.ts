/** Death: your health hit zero. Load the game from before the fatal run, or start a new one. */
export function showGameOver(onLoad: () => void, onNew: () => void): void {
  const box = document.createElement('div');
  box.className = 'run-summary game-over';
  box.innerHTML = `
    <div class="rs-panel" role="dialog" aria-label="Game over">
      <h2>FLATLINE</h2>
      <p>your brain could not take any more. the jack in your spine goes cold.</p>
      <p class="rs-dim">game over</p>
      <div class="go-buttons">
        <button type="button" data-load>Load game (before this run)</button>
        <button type="button" data-new>New game</button>
      </div>
    </div>`;
  box.querySelector('[data-load]')!.addEventListener('click', onLoad);
  box.querySelector('[data-new]')!.addEventListener('click', onNew);
  document.body.appendChild(box);
  box.querySelector<HTMLButtonElement>('[data-load]')!.focus();
}
