import type { RunReport } from '../sim/game';
import { sats } from '../sim/money';

/** The end-of-run report: contract result, every file with its value, the programs taken, and the total. */
export function showRunSummary(report: RunReport, balance: number, onOk: () => void): void {
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
      <div class="rs-sum">
        <span>contract pay</span><span class="rs-num">${sats(report.pay)}</span>
        <span>file values</span><span class="rs-num">${sats(report.filesTotal)}</span>
        <span class="rs-total">total earned</span><span class="rs-num rs-total">${sats(report.total)}</span>
        <span>your account</span><span class="rs-num">${sats(balance)}</span>
      </div>
      <button type="button">OK</button>
    </div>`;
  const ok = box.querySelector('button')!;
  ok.addEventListener('click', () => {
    box.remove();
    onOk();
  });
  document.body.appendChild(box);
  ok.focus();
}
