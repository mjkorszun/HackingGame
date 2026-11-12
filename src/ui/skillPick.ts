import { levelRoll, skillChoices, type Skill } from '../sim/progression';

/** Level up: three skills to choose from (set by the game code and the level); one click learns it. */
/** `onLater` closes it without a choice: the point waits for later (the Character button keeps pulsing). */
export function showSkillPick(level: number, owned: string[], code: string, onPick: (skill: Skill) => void, onLater: () => void): void {
  const choices = skillChoices(owned, levelRoll(code, level));
  const box = document.createElement('div');
  box.className = 'run-summary';
  box.innerHTML = `
    <div class="rs-panel sp-panel" role="dialog" aria-label="Choose a skill">
      <h2>LEVEL ${level}</h2>
      <p class="rs-dim">choose one skill</p>
      <div class="sp-cards">${choices.map((s, i) => `<button type="button" class="sp-card" data-i="${i}"><span class="sp-name">${s.name}</span><span class="sp-text">${s.text}</span></button>`).join('')}</div>
      <button type="button" class="sp-later">leave it for later</button>
    </div>`;
  box.querySelector('.sp-later')!.addEventListener('click', () => {
    box.remove();
    onLater();
  });
  box.querySelectorAll<HTMLButtonElement>('.sp-card').forEach((b) => b.addEventListener('click', () => {
    box.remove();
    onPick(choices[Number(b.dataset.i)]);
  }));
  document.body.appendChild(box);
}
