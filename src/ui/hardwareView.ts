import { SOCKETS, installedChip, type SocketId } from '../sim/implants';
import { BRAIN_ART } from './brainArt';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Centre of each socket on the brain cross-section. */
const SOCKET_XY: Record<SocketId, { x: number; y: number }> = {
  frontal: { x: 172, y: 210 },
  motor: { x: 300, y: 104 },
  parietal: { x: 424, y: 124 },
  visual1: { x: 506, y: 206 },
  visual2: { x: 500, y: 278 },
  thalamus: { x: 331, y: 267 },
  hippocampus: { x: 414, y: 296 },
  cerebellum: { x: 452, y: 376 },
  brainstem: { x: 318, y: 384 },
  spine1: { x: 332, y: 452 },
  spine2: { x: 332, y: 494 },
};
const SIZE = 30;

/**
 * Hardware tab: a cross-section of your brain with a square socket for every chip. The list names the
 * sockets and what is in them; hover or click a socket (or a row) to see what fits there.
 */
export function renderHardware(el: HTMLElement, memoryGB: number, selected: { id: SocketId }): void {
  const sockets = SOCKETS.map((s) => {
    const { x, y } = SOCKET_XY[s.id];
    const inst = installedChip(s.id, memoryGB);
    const h = SIZE / 2;
    // An installed chip shows as a small die with pins inside the socket.
    const chip = inst
      ? `<rect class="hw-die" x="${x - 8}" y="${y - 8}" width="16" height="16" rx="1.5"/>
         <path class="hw-pins" d="M${x - 4} ${y - 12}v4M${x} ${y - 12}v4M${x + 4} ${y - 12}v4M${x - 4} ${y + 8}v4M${x} ${y + 8}v4M${x + 4} ${y + 8}v4M${x - 12} ${y - 4}h4M${x - 12} ${y}h4M${x - 12} ${y + 4}h4M${x + 8} ${y - 4}h4M${x + 8} ${y}h4M${x + 8} ${y + 4}h4"/>`
      : '';
    return `<g class="hw-socket${inst ? ' is-installed' : ''}${selected.id === s.id ? ' is-selected' : ''}" data-slot="${s.id}" tabindex="0">
      <rect class="hw-box" x="${x - h}" y="${y - h}" width="${SIZE}" height="${SIZE}" rx="3"/>${chip}
      <title>${esc(s.name)}: ${inst ? esc(inst.label) : 'empty'}</title></g>`;
  }).join('');
  const rows = SOCKETS.map((s) => {
    const inst = installedChip(s.id, memoryGB);
    return `<button type="button" class="hw-row${inst ? ' is-installed' : ''}${selected.id === s.id ? ' is-selected' : ''}" data-slot="${s.id}">
      <span class="hw-name">${esc(s.name)}</span><span class="hw-state">${inst ? esc(inst.label) : 'empty'}</span></button>`;
  }).join('');
  const sel = SOCKETS.find((s) => s.id === selected.id)!;
  const inst = installedChip(sel.id, memoryGB);
  el.innerHTML = `
    <h2 class="sw-head">hardware <span class="home-dim">chips wired into your brain</span></h2>
    <div class="hw-layout">
      <svg class="hw-brain" viewBox="95 55 465 470" role="img" aria-label="Brain cross-section with chip sockets">${BRAIN_ART}${sockets}</svg>
      <div class="hw-side">
        <div class="hw-list">${rows}</div>
        <div class="hw-detail">
          <div class="hw-detail-name">${esc(sel.name)}</div>
          <div class="hw-detail-state${inst ? ' is-installed' : ''}">${inst ? `installed: ${esc(inst.label)}` : 'socket empty'}</div>
          <div class="hw-detail-fits">fits:</div>
          ${sel.fits.map((c) => `<div class="hw-fit"><span class="hw-fit-name">${esc(c.name)}</span> <span class="hw-fit-about">${esc(c.about)}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
  el.querySelectorAll<HTMLElement | SVGGElement>('[data-slot]').forEach((n) => {
    const pick = () => {
      selected.id = n.dataset.slot as SocketId;
      renderHardware(el, memoryGB, selected);
    };
    n.addEventListener('click', pick);
    n.addEventListener('mouseenter', () => {
      if (selected.id !== n.dataset.slot) pick();
    });
  });
}
