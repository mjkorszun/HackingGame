import { IMPLANT_SLOTS, installedImplant, type ImplantId } from '../sim/implants';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Where each slot sits on the brain cross-section (side view, face to the left). */
const SLOT_XY: Record<ImplantId, { x: number; y: number }> = {
  processor: { x: 178, y: 178 },
  attack: { x: 300, y: 96 },
  stealth: { x: 418, y: 118 },
  analysis: { x: 506, y: 196 },
  trace: { x: 490, y: 266 },
  damper: { x: 300, y: 236 },
  memory: { x: 360, y: 282 },
  defense: { x: 436, y: 366 },
  bio: { x: 352, y: 392 },
  jack: { x: 360, y: 470 },
  surge: { x: 412, y: 492 },
};

/** A side view of the brain, drawn as line art: cerebrum with folds, cerebellum, brainstem, spinal cord and the jack. */
const BRAIN = `
  <path class="br-cortex" d="M118 252 C96 150 186 66 312 66 C438 66 530 138 528 236 C527 296 496 330 452 334 C420 337 396 330 380 330 C352 340 326 342 300 336 C246 346 176 332 146 310 C128 296 120 276 118 252 Z"/>
  <path class="br-fold" d="M166 140 C190 156 210 130 236 146 M150 214 C176 200 196 222 222 206 M244 92 C254 120 276 104 284 132 M332 82 C330 110 352 112 348 140 M396 96 C386 120 410 132 396 156 M456 132 C440 150 466 166 448 186 M488 214 C468 222 486 246 466 254 M170 280 C196 266 220 292 248 276"/>
  <path class="br-callosum" d="M204 226 C246 176 384 170 430 222 C390 202 252 204 226 236 Z"/>
  <path class="br-thalamus" d="M282 236 C286 222 316 222 320 236 C318 250 286 250 282 236 Z"/>
  <path class="br-hippo" d="M330 286 C336 270 368 266 384 280 C392 290 382 300 370 296 C362 292 364 284 372 284"/>
  <path class="br-cerebellum" d="M386 338 C404 316 470 314 494 340 C510 360 496 392 462 400 C430 406 396 396 384 374 C378 362 378 350 386 338 Z"/>
  <path class="br-fold" d="M396 352 C420 346 460 346 488 354 M392 368 C420 362 462 364 490 372 M402 384 C426 380 456 382 478 388"/>
  <path class="br-stem" d="M326 330 C330 370 336 404 340 440 L376 440 C372 404 368 370 372 330"/>
  <path class="br-cord" d="M340 440 L342 520 M376 440 L378 520"/>
  <rect class="br-jack" x="334" y="458" width="52" height="22" rx="3"/>
  <path class="br-cable" d="M386 469 C430 469 450 500 520 506"/>`;

/**
 * Hardware tab: a cross-section of your brain with a slot for every implant. Hover or click a slot
 * (or a row of the list) to see what goes there.
 */
export function renderHardware(el: HTMLElement, memoryGB: number, selected: { id: ImplantId }): void {
  const slots = IMPLANT_SLOTS.map((s) => {
    const { x, y } = SLOT_XY[s.id];
    const on = installedImplant(s.id, memoryGB) !== undefined;
    return `<g class="hw-slot${on ? ' is-installed' : ''}${selected.id === s.id ? ' is-selected' : ''}" data-slot="${s.id}" tabindex="0">
      <circle class="hw-ring" cx="${x}" cy="${y}" r="13"/><circle class="hw-core" cx="${x}" cy="${y}" r="6"/>
      <title>${esc(s.name)} (${esc(s.region)})</title></g>`;
  }).join('');
  const rows = IMPLANT_SLOTS.map((s) => {
    const inst = installedImplant(s.id, memoryGB);
    return `<button type="button" class="hw-row${inst ? ' is-installed' : ''}${selected.id === s.id ? ' is-selected' : ''}" data-slot="${s.id}">
      <span class="hw-name">${esc(s.name)}</span><span class="hw-state">${inst ? esc(inst) : 'empty'}</span></button>`;
  }).join('');
  const sel = IMPLANT_SLOTS.find((s) => s.id === selected.id)!;
  const inst = installedImplant(sel.id, memoryGB);
  el.innerHTML = `
    <h2 class="sw-head">hardware <span class="home-dim">implants wired into your brain</span></h2>
    <div class="hw-layout">
      <svg class="hw-brain" viewBox="90 50 460 480" role="img" aria-label="Brain cross-section with implant slots">${BRAIN}${slots}</svg>
      <div class="hw-side">
        <div class="hw-list">${rows}</div>
        <div class="hw-detail">
          <div class="hw-detail-name">${esc(sel.name)}</div>
          <div class="hw-detail-region">${esc(sel.region)}</div>
          <div class="hw-detail-state${inst ? ' is-installed' : ''}">${inst ? `installed: ${esc(inst)}` : 'slot empty'}</div>
          <div class="hw-detail-about">${esc(sel.about)}</div>
        </div>
      </div>
    </div>`;
  el.querySelectorAll<HTMLElement | SVGGElement>('[data-slot]').forEach((n) => {
    const pick = () => {
      selected.id = n.dataset.slot as ImplantId;
      renderHardware(el, memoryGB, selected);
    };
    n.addEventListener('click', pick);
    n.addEventListener('mouseenter', () => {
      if (selected.id !== n.dataset.slot) pick();
    });
  });
}
