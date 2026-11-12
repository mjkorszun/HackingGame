/**
 * Credits: who made the things the game uses, and under which licence. Opened from the main screen;
 * later also shown after you win the game.
 */
const CREDITS: { what: string; lines: string[] }[] = [
  { what: 'game', lines: ['CyberHack (working title): a spiritual successor to Decker (2001) by Shawn Overcash'] },
  {
    what: 'icons',
    lines: [
      'program, agent, chip and menu icons: game-icons.net by Lorc, Delapouite and contributors',
      'licence: Creative Commons Attribution 3.0 (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/',
      'https://game-icons.net',
    ],
  },
  { what: 'sound effects', lines: ['Kenney (kenney.nl)', 'licence: CC0 1.0 (public domain)'] },
  { what: 'brain cross-section', lines: ['drawn for this game'] },
];

export function showCredits(): void {
  const box = document.createElement('div');
  box.className = 'run-summary credits';
  box.innerHTML = `
    <div class="rs-panel" role="dialog" aria-label="Credits">
      <h2>CREDITS</h2>
      ${CREDITS.map((c) => `<h3>${c.what}</h3>${c.lines.map((l) => `<div class="cr-line">${l}</div>`).join('')}`).join('')}
      <button type="button">OK</button>
    </div>`;
  const ok = box.querySelector('button')!;
  const close = () => box.remove();
  ok.addEventListener('click', close);
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  document.body.appendChild(box);
  ok.focus();
}
