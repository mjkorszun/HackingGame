/** One line of a tooltip, with an optional colour class (c-info, c-system, ...). */
export interface TipLine {
  text: string;
  cls?: string;
}

/** Delay before a tooltip shows, much shorter than the browser's own. */
const SHOW_DELAY_MS = 120;

/** The game's own tooltip: black box, green frame, follows the cursor. */
export class Tooltip {
  private readonly el: HTMLElement;
  private timer = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'game-tip';
    this.el.hidden = true;
    document.body.appendChild(this.el);
  }

  /** Shows the lines near the cursor after a short delay, and keeps following it. */
  attach(target: Element, lines: () => TipLine[]): void {
    target.addEventListener('mouseenter', (e) => {
      const ev = e as MouseEvent;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.show(lines(), ev.clientX, ev.clientY), SHOW_DELAY_MS);
    });
    target.addEventListener('mousemove', (e) => this.move((e as MouseEvent).clientX, (e as MouseEvent).clientY));
    target.addEventListener('mouseleave', () => this.hide());
    target.addEventListener('mousedown', () => this.hide());
    target.addEventListener('contextmenu', () => this.hide());
  }

  private show(lines: TipLine[], x: number, y: number): void {
    this.el.replaceChildren(
      ...lines.map((l) => {
        const d = document.createElement('div');
        d.textContent = l.text;
        if (l.cls) d.className = l.cls;
        return d;
      }),
    );
    this.el.hidden = false;
    this.move(x, y);
  }

  private move(x: number, y: number): void {
    if (this.el.hidden) return;
    const r = this.el.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - r.width - 4);
    const top = y + 18 + r.height > window.innerHeight ? y - r.height - 8 : y + 18;
    this.el.style.transform = `translate(${left}px, ${top}px)`;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.hidden = true;
  }
}
