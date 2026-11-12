import { SOCKETS, installedChip, type SocketId } from '../sim/implants';
import { BRAIN_ART } from './brainArt';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Centre of each socket on the brain cross-section. */
const SOCKET_XY: Record<SocketId, { x: number; y: number }> = {
  frontal: { x: 176, y: 214 },
  motor: { x: 298, y: 114 },
  parietal: { x: 418, y: 128 },
  visual1: { x: 504, y: 204 },
  visual2: { x: 494, y: 292 },
  thalamus: { x: 334, y: 266 },
  hippocampus: { x: 436, y: 292 },
  cerebellum: { x: 456, y: 378 },
  brainstem: { x: 316, y: 390 },
  spine1: { x: 333, y: 482 },
  spine2: { x: 333, y: 528 },
};
const SIZE = 40;

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
      ? `<rect class="hw-die" x="${x - 11}" y="${y - 11}" width="22" height="22" rx="2"/>
         <path class="hw-pins" d="${[-6, 0, 6].map((o) => `M${x + o} ${y - 16}v5M${x + o} ${y + 11}v5M${x - 16} ${y + o}h5M${x + 11} ${y + o}h5`).join('')}"/>`
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
      <svg class="hw-brain" viewBox="95 55 475 500" role="img" aria-label="Brain cross-section with chip sockets">${BRAIN_ART}${sockets}</svg>
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
