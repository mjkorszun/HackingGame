import { ICON_COLORS, iconBody, iconSvg, loadAllIcons, registerIcon } from './icons';

export interface IconPickerOptions {
  title: string;
  /** Icons shown first. */
  suggested: string[];
  icon: string;
  color: string;
  /** The chosen icon, its colour, and its SVG body (to keep icons from the full set). */
  onPick(icon: string, color: string, body: string): void;
}

/** How many icons of the full set are drawn at once (the rest are reached by searching). */
const SHOWN = 240;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let open: HTMLElement | null = null;

function close(): void {
  open?.remove();
  open = null;
}

/** A window to choose an icon and its colour: suggested icons first, and a search over the full set. */
export function showIconPicker(o: IconPickerOptions): void {
  close();
  let icon = o.icon;
  let color = o.color;
  let all: Record<string, string> | null = null;
  const overlay = document.createElement('div');
  overlay.className = 'pi-overlay';
  overlay.innerHTML = `
    <div class="pi-panel ip-panel" role="dialog" aria-label="${esc(o.title)}">
      <h2>${esc(o.title)}</h2>
      <div class="ip-top"><span class="ip-preview"></span><span class="ip-name"></span></div>
      <div class="ip-colors">${ICON_COLORS.map((c) => `<button type="button" class="ip-color" data-color="${c}" style="background:${c}" aria-label="colour ${c}"></button>`).join('')}</div>
      <h3>suggested</h3>
      <div class="ip-grid ip-suggested"></div>
      <h3>all icons</h3>
      <input class="ip-search" placeholder="search, e.g. eye, sword, skull" aria-label="search icons">
      <div class="ip-grid ip-all"><span class="ip-note">type to search about 4000 icons</span></div>
      <div class="pi-btns">
        <button type="button" class="pi-act">Choose</button>
        <button type="button" class="pi-close">Cancel</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const cell = (name: string, body?: string) =>
    `<button type="button" class="ip-icon${name === icon ? ' is-on' : ''}" data-icon="${name}" title="${name}"><svg viewBox="0 0 512 512" aria-hidden="true">${body ?? iconBody(name) ?? ''}</svg></button>`;
  const drawTop = () => {
    $('.ip-preview').innerHTML = iconSvg(icon, 'ip-big', color);
    $('.ip-name').textContent = icon;
    overlay.querySelectorAll<HTMLElement>('.ip-color').forEach((b) => b.classList.toggle('is-on', b.dataset.color === color));
    overlay.querySelectorAll<HTMLElement>('.ip-icon').forEach((b) => b.classList.toggle('is-on', b.dataset.icon === icon));
    overlay.querySelectorAll<HTMLElement>('.ip-grid svg').forEach((s) => { s.style.color = color; });
  };
  $('.ip-suggested').innerHTML = o.suggested.map((n) => cell(n)).join('');
  const search = $<HTMLInputElement>('.ip-search');
  const drawAll = () => {
    if (!all) return;
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const names = Object.keys(all).filter((n) => words.every((w) => n.includes(w)));
    $('.ip-all').innerHTML = names.length
      ? names.slice(0, SHOWN).map((n) => cell(n, all![n])).join('') + (names.length > SHOWN ? `<span class="ip-note">${names.length - SHOWN} more: narrow the search</span>` : '')
      : '<span class="ip-note">nothing found</span>';
    drawTop();
  };
  search.addEventListener('input', () => {
    if (all) return drawAll();
    $('.ip-all').innerHTML = '<span class="ip-note">loading icons...</span>';
    loadAllIcons().then((icons) => { all = icons; drawAll(); }).catch(() => { $('.ip-all').innerHTML = '<span class="ip-note">could not load the icons</span>'; });
  });
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay) return close();
    const ic = t.closest<HTMLElement>('.ip-icon');
    if (ic) {
      icon = ic.dataset.icon!;
      if (all?.[icon] && !iconBody(icon)) registerIcon(icon, all[icon]);
      drawTop();
    }
    const col = t.closest<HTMLElement>('.ip-color');
    if (col) {
      color = col.dataset.color!;
      drawTop();
    }
  });
  $('.pi-close').addEventListener('click', close);
  $('.pi-act').addEventListener('click', () => {
    const body = iconBody(icon) ?? '';
    close();
    o.onPick(icon, color, body);
  });
  document.body.appendChild(overlay);
  open = overlay;
  drawTop();
  search.focus();
}

document.addEventListener('keydown', (e) => {
  if (open && e.key === 'Escape') {
    e.stopPropagation();
    close();
  }
}, true);
