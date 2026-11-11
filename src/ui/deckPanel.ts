/** Starting programs (placeholder until programs exist in the sim). */
const PROGRAMS = ['attack', 'smoke', 'armor', 'hide', 'deceive', 'analyze', 'scan', 'evaluate', 'decrypt'];

/** The panel under the console: your own hardware and programs. For now only a placeholder. */
export function renderDeck(root: HTMLElement): void {
  root.innerHTML = `
    <div class="deck-title">YOUR DECK</div>
    <div class="deck-cols">
      <div>
        <h3>hardware</h3>
        <div class="deck-empty">no data yet</div>
      </div>
      <div>
        <h3>programs</h3>
        <ul>${PROGRAMS.map((p) => `<li>${p}</li>`).join('')}</ul>
      </div>
    </div>`;
}
