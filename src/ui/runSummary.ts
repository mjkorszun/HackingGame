import type { RunReport } from '../sim/game';
import { sats } from '../sim/money';
import { xpToNext } from '../sim/progression';

/** Your level and XP before this run's experience was added. */
export interface XpBefore {
  level: number;
  xp: number;
}

/** The end-of-run report: contract result, every file with its value, the programs taken, and the total. */
export function showRunSummary(report: RunReport, balance: number, before: XpBefore, onOk: () => void, health?: { loss: number; now: number; kicked: boolean }): void {
  const box = document.createElement('div');
  box.className = 'run-summary';
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const job = report.contract;
  const fileRows = report.files.length
    ? report.files.map((f) => `<tr><td>${esc(f.name)}</td><td class="rs-dim">${esc(f.label)}</td><td class="rs-num">${sats(f.price)}</td></tr>`).join('')
    : '<tr><td class="rs-dim" colspan="3">none</td></tr>';
  const swRows = report.software.length
    ? report.software.map((p) => `<li>${esc(p.name)} <span class="rs-dim">${p.type} ${p.rating}</span></li>`).join('')
    : '<li class="rs-dim">none</li>';
  box.innerHTML = `
    <div class="rs-panel" role="dialog" aria-label="Run summary">
      <h2>RUN SUMMARY</h2>
      <div class="rs-grid">
        <span>contract</span><span>${job ? esc(job.title) : 'none'}</span>
        <span>result</span><span class="${report.success ? 'rs-ok' : 'rs-fail'}">${job ? (report.success ? 'complete' : 'failed') : '-'}</span>
      </div>
      <h3>files downloaded</h3>
      <table>${fileRows}</table>
      <h3>software downloaded</h3>
      <ul>${swRows}</ul>
      <div class="rs-sums">
        <div class="rs-sum">
          <span>contract pay</span><span class="rs-num">${sats(report.pay)}</span>
          <span>file values</span><span class="rs-num">${sats(report.filesTotal)}</span>
          <span class="rs-total">earned this run</span><span class="rs-num rs-total">${sats(report.total)}</span>
        </div>
        <div class="rs-sum rs-rep">
          <span>reputation</span><span class="rs-num">+${report.reputation}</span>
        </div>
      </div>
      <div class="rs-account"><span>YOUR ACCOUNT</span><span class="rs-num">${sats(balance)}</span></div>
      ${health ? `<div class="rs-health${health.loss ? ' is-hurt' : ''}"><span>${health.loss ? `${health.kicked ? 'thrown out of the net' : 'you left badly hurt'}: brain damage -${health.loss}% health` : 'no brain damage'}</span><span class="rs-num">health ${health.now}%</span></div>` : ''}
      <h3>experience</h3>
      <table>${report.xpLines.length ? report.xpLines.map((l) => `<tr><td>${esc(l.what)}</td><td class="rs-num">+${l.xp} XP</td></tr>`).join('') : '<tr><td class="rs-dim">nothing this time</td></tr>'}</table>
      <div class="xp-row"><span class="xp-level">level ${before.level}</span><span class="xp-text">${before.xp} / ${xpToNext(before.level)} XP</span></div>
      <div class="xp-bar"><div class="xp-fill" style="width:${(100 * before.xp) / xpToNext(before.level)}%"></div><div class="xp-gain" style="left:${(100 * before.xp) / xpToNext(before.level)}%"></div></div>
      <div class="xp-up" hidden></div>
      <button type="button">OK</button>
    </div>`;
  const ok = box.querySelector('button')!;
  ok.addEventListener('click', () => {
    box.remove();
    onOk();
  });
  document.body.appendChild(box);
  ok.focus();
  animateXp(box, before, report.xp);
}

/** The bar fills with the XP earned; on reaching the end it shows LEVEL UP and starts again from zero. */
function animateXp(box: HTMLElement, before: XpBefore, gained: number): void {
  // The XP you had stays green; what this run brought grows after it in blue.
  const fill = box.querySelector<HTMLElement>('.xp-fill')!;
  const gain = box.querySelector<HTMLElement>('.xp-gain')!;
  let base = before.xp;
  const level = box.querySelector<HTMLElement>('.xp-level')!;
  const text = box.querySelector<HTMLElement>('.xp-text')!;
  const up = box.querySelector<HTMLElement>('.xp-up')!;
  let l = before.level;
  let x = before.xp;
  let left = gained;
  const stepMs = 900;
  const next = () => {
    if (left <= 0) return;
    const need = xpToNext(l);
    const take = Math.min(left, need - x);
    left -= take;
    x += take;
    gain.style.transition = `width ${stepMs}ms ease-out`;
    gain.style.width = `${(100 * (x - base)) / need}%`;
    text.textContent = `${x} / ${need} XP`;
    if (x < need) return;
    // Level up: flash, then empty the bar for the next level.
    setTimeout(() => {
      l++;
      x = 0;
      up.hidden = false;
      up.textContent = `LEVEL UP! you are now level ${l}. pick a skill after OK`;
      level.textContent = `level ${l}`;
      base = 0;
      fill.style.width = '0%';
      gain.style.transition = 'none';
      gain.style.left = '0%';
      gain.style.width = '0%';
      text.textContent = `0 / ${xpToNext(l)} XP`;
      setTimeout(next, 120);
    }, stepMs + 150);
  };
  setTimeout(next, 400);
}
