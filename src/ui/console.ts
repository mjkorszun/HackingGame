import type { LogLine, ProgressLine } from '../sim/types';
import type { Completion } from './commands';

const BAR_WIDTH = 20;

export function progressBar(progress: number, width = BAR_WIDTH): string {
  const p = Math.max(0, Math.min(1, progress));
  const filled = Math.round(p * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${String(Math.round(p * 100)).padStart(3)}%`;
}

/**
 * A plain scrolling terminal: log lines on top, a prompt at the bottom.
 * Typed commands are handed to the onCommand callback.
 */
export class Console {
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly progressEls = new Map<number, HTMLElement>();
  private readonly history: string[] = [];
  private historyPos = 0;

  /** Called for every printable key typed into the prompt (for sound). */
  onType: (() => void) | null = null;
  /** Tab completion for the prompt. */
  completer: ((value: string) => Completion) | null = null;
  private lastTabValue: string | null = null;

  constructor(root: HTMLElement, private readonly onCommand: (cmd: string) => void) {
    root.innerHTML = '';
    this.log = document.createElement('div');
    this.log.className = 'log';
    const prompt = document.createElement('label');
    prompt.className = 'prompt';
    prompt.textContent = '> ';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', 'Command');
    prompt.appendChild(this.input);
    root.append(this.log, prompt);

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('mouseup', () => {
      // Clicking the console focuses the prompt, unless the user is selecting text.
      if (!window.getSelection()?.toString()) this.input.focus();
    });
  }

  get inputFocused(): boolean {
    return document.activeElement === this.input;
  }

  write(line: LogLine): void {
    const el = document.createElement('div');
    el.className = `line c-${line.color}`;
    el.textContent = line.text;
    this.append(el);
  }

  progress(line: ProgressLine): void {
    let el = this.progressEls.get(line.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'line c-normal';
      this.progressEls.set(line.id, el);
      this.append(el);
    }
    el.textContent = `${line.label} ${progressBar(line.progress)}`;
    if (line.done) this.progressEls.delete(line.id);
  }

  /** Shows a command issued from the graphical UI as if it had been typed. */
  echo(cmd: string): void {
    this.history.push(cmd);
    this.historyPos = this.history.length;
    this.write({ text: `> ${cmd}`, color: 'command' });
  }

  clear(): void {
    this.log.innerHTML = '';
    this.progressEls.clear();
  }

  /** First Tab completes; a second Tab with nothing more to complete lists the options. */
  private tab(): void {
    if (!this.completer) return;
    const current = this.input.value;
    const result = this.completer(current);
    if (result.value !== current) {
      this.input.value = result.value;
      this.lastTabValue = null;
      this.onType?.();
      return;
    }
    if (this.lastTabValue === current && result.options.length > 1) {
      this.write({ text: `> ${current}`, color: 'command' });
      this.write({ text: result.options.join('    '), color: 'normal' });
      this.lastTabValue = null;
      return;
    }
    this.lastTabValue = current;
  }

  private append(el: HTMLElement): void {
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.appendChild(el);
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.tab();
      return;
    }
    this.lastTabValue = null;
    if (e.key.length === 1 || e.key === 'Backspace') this.onType?.();
    if (e.key === 'Enter') {
      const cmd = this.input.value.trim();
      this.input.value = '';
      if (!cmd) return;
      this.history.push(cmd);
      this.historyPos = this.history.length;
      this.write({ text: `> ${cmd}`, color: 'command' });
      this.onCommand(cmd);
    } else if (e.key === 'ArrowUp' && this.history.length) {
      this.historyPos = Math.max(0, this.historyPos - 1);
      this.input.value = this.history[this.historyPos];
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && this.history.length) {
      this.historyPos = Math.min(this.history.length, this.historyPos + 1);
      this.input.value = this.history[this.historyPos] ?? '';
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.input.blur();
    }
    e.stopPropagation();
  }
}
