export interface MenuItem {
  label: string;
  /** Shortcut hint shown on the right, e.g. "dbl-click" or "1". */
  hint?: string;
  disabled?: boolean;
  action: () => void;
}

/** A single right-click menu shared by every clickable object. */
export class ContextMenu {
  private readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'ctx-menu';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    document.addEventListener('mousedown', (e) => {
      if (!this.el.contains(e.target as Node)) this.hide();
    });
    window.addEventListener('blur', () => this.hide());
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(x: number, y: number, title: string, items: MenuItem[]): void {
    this.el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'ctx-title';
    head.textContent = title;
    this.el.appendChild(head);
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !!item.disabled;
      btn.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'ctx-hint';
        hint.textContent = item.hint;
        btn.appendChild(hint);
      }
      btn.addEventListener('click', () => {
        this.hide();
        item.action();
      });
      this.el.appendChild(btn);
    }
    this.el.hidden = false;
    const rect = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.min(x, window.innerWidth - rect.width - 4)}px`;
    this.el.style.top = `${Math.min(y, window.innerHeight - rect.height - 4)}px`;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
