import { chipById, chipValue, KINDS, marketOffers, REMOVE_DAYS, sellPrice, SOCKETS, type ChipModel, type SocketId } from '../sim/implants';
import { sats } from '../sim/money';
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

export interface HardwareState {
  installed: Partial<Record<SocketId, string>>;
  spare: string[];
  sats: number;
  day: number;
  code: string;
  /** Market offers already bought today. */
  bought: string[];
}

/** What the Hardware tab can do; each returns a line saying what happened. */
export interface HardwareActions {
  state(): HardwareState;
  buy(chipId: string, price: number): string;
  sell(chipId: string): string;
  install(chipId: string, socket: SocketId): string;
  remove(socket: SocketId): string;
  click(): void;
  /** Days or sats changed: the rest of the main screen redraws. */
  changed(): void;
}

/** What the tab shows between redraws. */
export interface HardwareView {
  sel: SocketId;
  market: boolean;
  line: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** The side numbers of a chip, with the good ones in green and the bad ones in orange. */
function sidesHtml(c: ChipModel): string {
  const s = c.sides;
  const part = (label: string, text: string, good: boolean | null) => `<span class="hw-side-stat${good === null ? '' : good ? ' is-good' : ' is-bad'}">${label} ${text}</span>`;
  return [
    part('speed', `${signed(s.speed)}%`, s.speed === 0 ? null : s.speed > 0),
    part('noise', `${signed(s.noise)}%`, s.noise === 0 ? null : s.noise < 0),
    part('strain', s.strain ? `-${s.strain} integrity` : 'none', s.strain === 0 ? null : false),
    part('reliability', `${s.reliability}%`, s.reliability >= 90 ? true : s.reliability < 80 ? false : null),
  ].join('');
}

/** A chip as a card: name in its rarity colour, maker, main number, side numbers, recovery days. */
function chipCard(c: ChipModel, extra = ''): string {
  return `<div class="hw-chip">
    <div class="hw-chip-head"><span class="hw-chip-name rarity-${c.rarity}">${esc(c.name)}</span><span class="hw-chip-value">${esc(chipValue(c))}</span></div>
    <div class="hw-chip-sub">${esc(KINDS[c.kind].name)} · ${esc(c.maker)} · <span class="rarity-${c.rarity}">${c.rarity}</span></div>
    <div class="hw-chip-sides">${sidesHtml(c)}</div>
    <div class="hw-chip-foot"><span class="hw-surgery">surgery: ${c.surgery} day${c.surgery === 1 ? '' : 's'} to recover</span>${extra}</div>
  </div>`;
}

/**
 * Hardware tab: a cross-section of your brain with a square socket for every chip, or the Hardware
 * Market. Hover or click a socket (or a row) to see what is in it, what fits, and your spare chips
 * that you can put in.
 */
export function renderHardware(el: HTMLElement, act: HardwareActions, view: HardwareView): void {
  const st = act.state();
  const redraw = () => renderHardware(el, act, view);
  const done = (line: string) => {
    view.line = line;
    act.changed();
    redraw();
  };
  const head = `<h2 class="sw-head">${view.market ? 'hardware market' : 'hardware'} <span class="home-dim">${view.market ? `day ${st.day} · you have ${sats(st.sats)}` : 'chips wired into your brain'}</span>
    <button type="button" class="home-btn hw-market-btn" data-act="market">${view.market ? 'Back to your brain' : 'Hardware Market'}</button></h2>
    ${view.line ? `<div class="hw-line">${esc(view.line)}</div>` : ''}`;

  if (view.market) {
    const offers = marketOffers(st.code, st.day);
    const spare = st.spare.map((id) => chipById(id)).filter((c): c is ChipModel => !!c);
    el.innerHTML = `${head}
      <div class="home-dim hw-note">new stock every day. prices swing around the list price</div>
      <div class="hw-grid">${offers.map((o) => {
        const sold = st.bought.includes(o.chip.id);
        const afford = st.sats >= o.price;
        return chipCard(o.chip, `<button type="button" class="home-btn hw-buy" data-buy="${o.chip.id}" data-price="${o.price}"${sold || !afford ? ' disabled' : ''}>${sold ? 'bought' : `buy ${sats(o.price)}`}</button>`);
      }).join('')}</div>
      <h2 class="sw-head">your spare chips</h2>
      <div class="hw-grid">${spare.length ? spare.map((c) => chipCard(c, `<button type="button" class="home-btn hw-sell" data-sell="${c.id}">sell ${sats(sellPrice(c))}</button>`)).join('') : '<div class="home-dim">none. chips you buy or take out wait here</div>'}</div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      act.click();
      done(act.buy(b.dataset.buy!, Number(b.dataset.price)));
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) => b.addEventListener('click', () => {
      act.click();
      done(act.sell(b.dataset.sell!));
    }));
  } else {
    const chipIn = (id: SocketId) => {
      const cid = st.installed[id];
      return cid ? chipById(cid) : undefined;
    };
    const sockets = SOCKETS.map((s) => {
      const { x, y } = SOCKET_XY[s.id];
      const inst = chipIn(s.id);
      const h = SIZE / 2;
      // An installed chip shows as a small die with pins inside the socket.
      const chip = inst
        ? `<rect class="hw-die" x="${x - 11}" y="${y - 11}" width="22" height="22" rx="2"/>
           <path class="hw-pins" d="${[-6, 0, 6].map((o) => `M${x + o} ${y - 16}v5M${x + o} ${y + 11}v5M${x - 16} ${y + o}h5M${x + 11} ${y + o}h5`).join('')}"/>`
        : '';
      return `<g class="hw-socket${inst ? ' is-installed' : ''}${view.sel === s.id ? ' is-selected' : ''}" data-slot="${s.id}" tabindex="0">
        <rect class="hw-box" x="${x - h}" y="${y - h}" width="${SIZE}" height="${SIZE}" rx="3"/>${chip}
        <title>${esc(s.name)}: ${inst ? esc(inst.name) : 'empty'}</title></g>`;
    }).join('');
    const rows = SOCKETS.map((s) => {
      const inst = chipIn(s.id);
      return `<button type="button" class="hw-row${inst ? ' is-installed' : ''}${view.sel === s.id ? ' is-selected' : ''}" data-slot="${s.id}">
        <span class="hw-name">${esc(s.name)}</span><span class="hw-state${inst ? ` rarity-${inst.rarity}` : ''}">${inst ? esc(inst.name.includes(String(inst.value)) && inst.kind === 'memory' ? `${inst.name} GB` : `${inst.name} ${chipValue(inst)}`) : 'empty'}</span></button>`;
    }).join('');
    const sel = SOCKETS.find((s) => s.id === view.sel)!;
    const inst = chipIn(sel.id);
    const fitting = [...new Set(st.spare)].map((id) => chipById(id)).filter((c): c is ChipModel => !!c && sel.fits.includes(c.kind));
    el.innerHTML = `${head}
      <div class="hw-layout">
        <svg class="hw-brain" viewBox="95 55 475 500" role="img" aria-label="Brain cross-section with chip sockets">${BRAIN_ART}${sockets}</svg>
        <div class="hw-side">
          <div class="hw-list">${rows}</div>
          <div class="hw-detail">
            <div class="hw-detail-name">${esc(sel.name)}</div>
            ${inst ? chipCard(inst, inst.kind === 'memory' ? '' : `<button type="button" class="home-btn hw-remove" data-remove="${sel.id}">take out (${REMOVE_DAYS} day)</button>`) : '<div class="hw-detail-state">socket empty</div>'}
            <div class="hw-detail-fits">fits: ${sel.fits.map((k) => `<span class="hw-fit-name" title="${esc(KINDS[k].about)}">${esc(KINDS[k].name)}</span>`).join(', ')}</div>
            <div class="hw-fit-about">${esc(sel.fits.map((k) => KINDS[k].about).join('. '))}</div>
            ${fitting.length ? `<div class="hw-detail-fits">your spare chips for it:</div>${fitting.map((c) => chipCard(c, `<button type="button" class="home-btn hw-install" data-install="${c.id}">${inst ? 'swap in' : 'put in'} (${c.surgery} day${c.surgery === 1 ? '' : 's'})</button>`)).join('')}` : ''}
          </div>
        </div>
      </div>`;
    el.querySelectorAll<HTMLElement | SVGGElement>('[data-slot]').forEach((n) => {
      const pick = () => {
        view.sel = n.dataset.slot as SocketId;
        redraw();
      };
      n.addEventListener('click', pick);
      n.addEventListener('mouseenter', () => {
        if (view.sel !== n.dataset.slot) pick();
      });
    });
    el.querySelector<HTMLButtonElement>('[data-remove]')?.addEventListener('click', () => {
      act.click();
      done(act.remove(sel.id));
    });
    el.querySelectorAll<HTMLButtonElement>('[data-install]').forEach((b) => b.addEventListener('click', () => {
      act.click();
      done(act.install(b.dataset.install!, sel.id));
    }));
  }
  el.querySelector('[data-act="market"]')!.addEventListener('click', () => {
    act.click();
    view.market = !view.market;
    view.line = '';
    redraw();
  });
}

