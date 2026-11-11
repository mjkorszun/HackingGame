import { programSize, type Program, type ProgramType } from '../sim/programs';
import { programIcon } from './icons';

/** What each type of program does (short, for the info window). */
const TYPE_INFO: Record<ProgramType, string> = {
  warrior: 'released as your own agent: it fights enemy agents where it stands. stay, follow or unload it. if it dies, it is lost for this run',
  scout: 'an agent you send to a node: it identifies what it reaches, reads the agents there and flies on to the next unknown node, until an agent catches it',
  shield: 'jumps out of you when you are attacked and circles you, taking the hits. unload it to have it ready again. if it breaks, it is lost for this run',
  silence: 'cuts an agent off: its messages cannot leave the node, so it raises no alarm',
  deceive: 'answers an agent\'s query with a lie. it trusts you until you leave the node',
  hide: 'works on its own: agents roll their detection against it when they query you',
  analyze: 'works on its own: every agent that deals with you gets analyzed',
  skimmer: 'planted in a database of a local business, it takes a small cut every day',
  mapper: 'maps the network around you: finds and identifies nearby nodes. loud, and needs a long time to recharge',
  scan: 'reads archives: shows what each file holds and how it is protected',
  evaluate: 'tells what a valuable file is worth',
  identify: 'tells what program an archive holds',
  defuse: 'disarms a kill switch, so the file does not destroy itself when scanned',
  decrypt: 'cracks a sealed archive',
  scrub: 'removes a tracker, so the file does not tag you when you download it',
  forge: 'opens a privilege lock without the privilege',
};

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface InfoOptions {
  /** Where the program is now: "loaded", "in storage"... */
  status?: string;
  /** A button under the details, e.g. Load / Unload. */
  action?: { label: string; run: () => void; disabled?: string };
}

let open: HTMLElement | null = null;

export function closeProgramInfo(): void {
  open?.remove();
  open = null;
}

/** A window with everything about one program. Closes on Esc, a click outside, or Close. */
export function showProgramInfo(p: Program, opts: InfoOptions = {}): void {
  closeProgramInfo();
  const rarity = p.rarity ?? 'common';
  const lines: string[] = [
    `<tr><td>type</td><td>${p.type}</td></tr>`,
    `<tr><td>rating</td><td>${p.rating}</td></tr>`,
    `<tr><td>size</td><td>${programSize(p)} GB</td></tr>`,
    `<tr><td>rarity</td><td class="rarity-${rarity}">${rarity}</td></tr>`,
  ];
  if (p.author) lines.push(`<tr><td>author</td><td>${esc(p.author)}</td></tr>`);
  if (p.efficiency !== undefined) lines.push(`<tr><td>efficiency</td><td>x${p.efficiency}</td></tr>`);
  if (p.detection !== undefined) lines.push(`<tr><td>detection</td><td>${p.detection}% a day</td></tr>`);
  if (opts.status) lines.push(`<tr><td>status</td><td>${esc(opts.status)}</td></tr>`);
  const traits = p.traits?.length ? `<h3>traits</h3><ul>${p.traits.map((t) => `<li>+ ${esc(t)}</li>`).join('')}</ul>` : '';
  const overlay = document.createElement('div');
  overlay.className = 'pi-overlay';
  overlay.innerHTML = `
    <div class="pi-panel" role="dialog" aria-label="${esc(p.name)}">
      <h2 class="rarity-${rarity}">${programIcon(p, 'pi-icon')}${esc(p.name)}</h2>
      <p class="pi-what">${TYPE_INFO[p.type]}</p>
      <table>${lines.join('')}</table>
      ${traits}
      <div class="pi-btns">
        ${opts.action ? `<button type="button" class="pi-act"${opts.action.disabled ? ` disabled title="${esc(opts.action.disabled)}"` : ''}>${esc(opts.action.label)}</button>` : ''}
        <button type="button" class="pi-close">Close</button>
      </div>
      ${opts.action?.disabled ? `<div class="pi-note">${esc(opts.action.disabled)}</div>` : ''}
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProgramInfo(); });
  overlay.addEventListener('contextmenu', (e) => { e.preventDefault(); if (e.target === overlay) closeProgramInfo(); });
  overlay.querySelector('.pi-close')!.addEventListener('click', closeProgramInfo);
  overlay.querySelector('.pi-act')?.addEventListener('click', () => {
    closeProgramInfo();
    opts.action!.run();
  });
  document.body.appendChild(overlay);
  open = overlay;
  (overlay.querySelector<HTMLElement>('.pi-act:not([disabled])') ?? overlay.querySelector<HTMLElement>('.pi-close'))?.focus();
}

document.addEventListener('keydown', (e) => {
  if (open && e.key === 'Escape') {
    e.stopPropagation();
    closeProgramInfo();
  }
}, true);
