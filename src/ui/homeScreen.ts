import type { ContractDef, SystemDef } from '../sim/types';
import type { NetworkSeed } from '../sim/generate';
import { sats } from '../sim/money';
import { devDays, MAX_DEV_RATING, RARITY_TRAITS, type DevProject } from '../sim/development';
import { PROGRAM_TYPES, programSize, type Program, type ProgramType } from '../sim/programs';

/** A contract on offer: the job and the system it is in. */
export interface ContractOffer {
  contract: ContractDef;
  system: SystemDef;
}

/** What the player picked to hack next: a known local network, or a contract. */
export type Choice = { kind: 'network'; net: NetworkSeed } | { kind: 'contract'; offer: ContractOffer };

/** Reputation needed before anyone offers you contracts. */
export const CONTRACT_REPUTATION = 0;

export interface HomeState {
  day: number;
  reputation: number;
  networks: NetworkSeed[];
  offers: ContractOffer[];
  skimmers: { netId: string; program: { name: string; efficiency?: number } }[];
  /** What happened on the last day. */
  news: string[];
}

export interface HomeActions {
  /** Jack in: start the run. */
  enter(choice: Choice): void;
  click(): void;
  /** Software development: the project in progress, starting one, and working on it. */
  dev: {
    project(): DevProject | undefined;
    start(type: ProgramType, rating: number, name: string): void;
    /** Works a day, a week, or the days left. Returns what happened, and the program if it got finished. */
    work(mode: 'day' | 'week' | 'finish'): { lines: string[]; program?: Program };
  };
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/**
 * The main screen, where the game starts: your gear on the left; on the right, known networks,
 * contracts (once you have the reputation) and entering the network.
 */
export class HomeScreen {
  private chosen: Choice | undefined;
  private open: 'networks' | 'contracts' | 'dev' | null = null;
  /** What the last stretch of development did, shown under the project. */
  private devLines: string[] = [];
  private devDone: Program | undefined;
  /** The new-project form keeps its choices between renders. */
  private form = { type: 'hide' as ProgramType, rating: 1, name: '' };
  private readonly main: HTMLElement;
  readonly gear: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: HomeState,
    private readonly actions: HomeActions,
  ) {
    root.innerHTML = `
      <section class="home-gear" aria-label="Your gear"></section>
      <section class="home-main"></section>`;
    this.gear = root.querySelector('.home-gear')!;
    this.main = root.querySelector('.home-main')!;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private label(): string {
    const c = this.chosen;
    if (!c) return '<span class="home-dim">none. pick a known network or a contract</span>';
    if (c.kind === 'network') return `<span class="home-job">${c.net.name}</span> <span class="home-dim">(${c.net.location})</span>`;
    return `<span class="home-job">${c.offer.system.name}</span> <span class="home-dim">(contract: ${c.offer.contract.title}, pays ${sats(c.offer.contract.pay)})</span>`;
  }

  /** Draws the screen again (after days passed elsewhere). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    const s = this.state;
    const locked = s.reputation < CONTRACT_REPUTATION;
    this.main.innerHTML = `
      <h1 class="home-title">CYBERHACK</h1>
      <div class="home-stats">day ${s.day} · reputation ${s.reputation}</div>
      ${s.news.length ? `<div class="home-news">${s.news.map((n) => `<div>${n}</div>`).join('')}</div>` : ''}
      <nav class="home-menu">
        <button type="button" class="home-btn${this.open === 'networks' ? ' is-open' : ''}" data-act="networks">Known networks</button>
        <button type="button" class="home-btn${this.open === 'contracts' ? ' is-open' : ''}" data-act="contracts"${locked ? ` disabled title="Needs reputation ${CONTRACT_REPUTATION}"` : ''}>Choose contract${locked ? ` <span class="home-lock">(rep. ${CONTRACT_REPUTATION})</span>` : ''}</button>
        <button type="button" class="home-btn${this.open === 'dev' ? ' is-open' : ''}" data-act="dev">Software development</button>
        <button type="button" class="home-btn" data-act="enter"${this.chosen ? '' : ' disabled title="Pick a network or a contract first"'}>Enter the network</button>
      </nav>
      <div class="home-active">chosen network: ${this.label()}</div>
      <div class="home-list"></div>`;
    for (const which of ['networks', 'contracts', 'dev'] as const) {
      this.main.querySelector(`[data-act="${which}"]`)!.addEventListener('click', () => {
        this.actions.click();
        this.open = this.open === which ? null : which;
        this.devLines = [];
        this.devDone = undefined;
        this.render();
      });
    }
    this.main.querySelector('[data-act="enter"]')!.addEventListener('click', () => {
      if (!this.chosen) return;
      this.actions.click();
      this.actions.enter(this.chosen);
    });
    const list = this.main.querySelector('.home-list')!;
    const card = (taken: boolean, html: string, pick: () => Choice) => {
      const el = document.createElement('div');
      el.className = `contract-card${taken ? ' is-taken' : ''}`;
      el.innerHTML = `${html}<button type="button" class="home-btn cc-btn">${taken ? 'Chosen' : 'Choose'}</button>`;
      el.querySelector('button')!.addEventListener('click', () => {
        this.actions.click();
        this.chosen = taken ? undefined : pick();
        if (this.chosen) this.open = null;
        this.render();
      });
      list.appendChild(el);
    };
    if (this.open === 'networks') {
      if (!s.networks.length) list.innerHTML = '<div class="home-dim">no known networks</div>';
      for (const net of s.networks) {
        const taken = this.chosen?.kind === 'network' && this.chosen.net.id === net.id;
        card(taken, `
          <div class="cc-head"><span class="cc-title">${net.name}</span><span class="home-dim">local network</span></div>
          <div class="cc-line home-dim">${net.location}. security level ${net.security}</div>
          ${s.skimmers.filter((k) => k.netId === net.id).map((k) => `<div class="cc-line cc-skim">${k.program.name} planted: +${sats(Math.round((net.income ?? 0.08) * (k.program.efficiency ?? 1) * 100) / 100)} a day</div>`).join('')}`, () => ({ kind: 'network', net }));
      }
    } else if (this.open === 'dev') {
      this.renderDev(list);
    } else if (this.open === 'contracts') {
      for (const offer of s.offers) {
        const { contract: c, system: sys } = offer;
        const taken = this.chosen?.kind === 'contract' && this.chosen.offer === offer;
        card(taken, `
          <div class="cc-head"><span class="cc-title">${c.title}</span><span class="cc-pay">${sats(c.pay)}</span></div>
          <div class="cc-line">${sys.name} <span class="home-dim">(${sys.location})</span></div>
          <div class="cc-line home-dim">${c.need} one file in the company's databases. security level ${sys.security ?? 1}</div>`, () => ({ kind: 'contract', offer }));
      }
    }
  }

  /** Software development: a form for a new project, or the project in progress with its buttons. */
  private renderDev(list: Element): void {
    const p = this.actions.dev.project();
    const box = document.createElement('div');
    box.className = 'contract-card dev-card';
    const done = this.devDone;
    const result = `${this.devLines.length ? `<div class="dev-log">${this.devLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}${done ? `
      <div class="dev-new rarity-${done.rarity}">
        <div class="cc-head"><span class="cc-title">${esc(done.name)}</span><span>${done.rarity}</span></div>
        <div class="cc-line">${done.type} ${done.rating} · ${programSize(done)} GB${done.author ? ` · by ${esc(done.author)}` : ''}</div>
        ${(done.traits ?? []).map((t) => `<div class="cc-line dev-trait">+ ${esc(t)}</div>`).join('') || '<div class="cc-line home-dim">no traits</div>'}
        <div class="cc-line home-dim">saved in storage</div>
      </div>` : ''}`;
    if (!p) {
      const f = this.form;
      const name = f.name || `${cap(f.type)} ${f.rating}.0`;
      box.innerHTML = `
        ${result}
        <div class="cc-head"><span class="cc-title">new program</span><span class="home-dim">${devDays(f.rating)} days of work</span></div>
        <label class="dev-row">type <select class="dev-type">${PROGRAM_TYPES.map((t) => `<option${t === f.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="dev-row">rating <select class="dev-rating">${Array.from({ length: MAX_DEV_RATING }, (_, i) => `<option${i + 1 === f.rating ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <label class="dev-row">name <input class="dev-name" maxlength="20" value="${esc(name)}"></label>
        <div class="cc-line home-dim">size ${programSize(f)} GB. bugs can make it take longer. rarity and traits are rolled when it is done: common ${RARITY_TRAITS.common} traits, enhanced ${RARITY_TRAITS.enhanced}, rare ${RARITY_TRAITS.rare}, experimental ${RARITY_TRAITS.experimental}, prototype ${RARITY_TRAITS.prototype} and your name</div>
        <button type="button" class="home-btn cc-btn" data-dev="start">Start project</button>`;
      const type = box.querySelector<HTMLSelectElement>('.dev-type')!;
      const rating = box.querySelector<HTMLSelectElement>('.dev-rating')!;
      const nameEl = box.querySelector<HTMLInputElement>('.dev-name')!;
      const auto = !f.name;
      const change = () => {
        f.type = type.value as ProgramType;
        f.rating = Number(rating.value);
        if (auto) f.name = '';
        this.render();
      };
      type.addEventListener('change', change);
      rating.addEventListener('change', change);
      nameEl.addEventListener('input', () => { f.name = nameEl.value; });
      box.querySelector('[data-dev="start"]')!.addEventListener('click', () => {
        this.actions.click();
        this.actions.dev.start(f.type, f.rating, (nameEl.value.trim() || name).slice(0, 20));
        f.name = '';
        this.devLines = [];
        this.devDone = undefined;
        this.render();
      });
    } else {
      const total = p.daysSpent + p.daysLeft;
      const width = 20;
      const filled = Math.round((p.daysSpent / total) * width);
      box.innerHTML = `
        <div class="cc-head"><span class="cc-title">${esc(p.name)}</span><span class="home-dim">${p.type} ${p.rating}</span></div>
        <div class="cc-line dev-bar">[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${p.daysSpent}/${total} days</div>
        <div class="cc-line">${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} of work left${p.bugs ? ` · bugs found: ${p.bugs}` : ''}</div>
        <div class="dev-btns">
          <button type="button" class="home-btn cc-btn" data-dev="day">Develop for day</button>
          <button type="button" class="home-btn cc-btn" data-dev="week"${p.daysLeft < 7 ? ' disabled title="Needs at least 7 days of work left"' : ''}>Develop for week</button>
          <button type="button" class="home-btn cc-btn" data-dev="finish" title="Works the ${p.daysLeft} days left. A bug can still push the end back">Finish (${p.daysLeft} d)</button>
        </div>
        ${result}`;
      for (const mode of ['day', 'week', 'finish'] as const) {
        box.querySelector(`[data-dev="${mode}"]`)!.addEventListener('click', () => {
          this.actions.click();
          const r = this.actions.dev.work(mode);
          this.devLines = r.lines;
          this.devDone = r.program;
          this.render();
        });
      }
    }
    list.appendChild(box);
  }
}
