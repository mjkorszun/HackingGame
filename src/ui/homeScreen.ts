import type { ContractDef, SystemDef } from '../sim/types';
import type { NetworkSeed } from '../sim/generate';
import { sats } from '../sim/money';
import { bugFixDays, devDays, MAX_BUGS, MAX_DEV_RATING, RARITY_TRAITS, type DevProject } from '../sim/development';
import { cleanGameCode, SKILLS, xpToNext } from '../sim/progression';
import { daysToHeal, REST_PER_DAY } from '../sim/health';
import { showCredits } from './credits';
import { renderHardware, type HardwareActions, type HardwareView } from './hardwareView';
import { AVATAR_ICONS, ICON_POOLS, MENU_ICONS, iconSvg, programIcon, randomIcon } from './icons';
import { showIconPicker } from './iconPicker';
import { showProgramInfo, statHtml } from './programInfo';
import { CATEGORIES, COMPUTE_POINTS, evenCompute, variantCost, VARIANTS_PER_DAY } from '../sim/training';
import { PROGRAM_TYPES, programSize, tb, type Program, type ProgramType } from '../sim/programs';

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
  /** Backdoors you left, by network id. */
  backdoors?: Record<string, string[]>;
}

export interface HomeActions {
  /** Jack in: start the run. */
  enter(choice: Choice): void;
  click(): void;
  /** Your character: level, XP into it, skills, and level ups not picked yet. */
  character(): { level: number; xp: number; skills: string[]; picks: number; code: string; health: number };
  /** Rests at your base for some days to heal. */
  rest(days: number): void;
  /** The contract you took, with its last day. */
  contract(): { title: string; deadline: number } | undefined;
  day(): number;
  /** Money you have. */
  money(): number;
  /** Days passing at the base right now, if any. */
  dayJob(): { label: string; total: number; done: number } | null;
  /** Sets the game code (for testing for now). */
  setCode(code: string): void;
  /** For testing: gains exactly the XP the next level needs. */
  levelUp(): void;
  /** How the player looks in the net. */
  avatar(): { icon: string; color: string };
  setAvatar(icon: string, color: string, body: string): void;
  /** Opens the skill choice for the level ups not picked yet; `done` runs after. */
  pickSkills(done: () => void): void;
  /** Hardware tab and market (click and changed are filled in by the screen). */
  hardware: Omit<HardwareActions, 'click' | 'changed'>;
  /** Software tab: the programs in memory (in order) and in storage, and moving them by drag and drop. */
  software: {
    list(): { loaded: Program[]; stored: Program[]; used: number; memory: number };
    /** Into memory at `index` (or moved there), or out of memory with null. False when it does not fit. */
    place(id: string, index: number | null): boolean;
    /** A drop that did not work. */
    refused(): void;
    /** Deletes a stored program for good. */
    remove(id: string): void;
    /** Spends the days to fix one bug of a program; returns what happened. */
    fix(id: string, index: number): string | undefined;
  };
  /** Software development: the project in progress, starting one, and working on it. */
  dev: {
    project(): DevProject | undefined;
    start(type: ProgramType, rating: number, name: string, icon: string, color: string, body: string, compute?: Record<string, number>): void;
    /** Works a day, a week, or the days left. Returns what happened, and the program if it got finished. */
    work(mode: 'day' | 'week' | 'finish'): { lines: string[]; program?: Program };
    /** Abandons the project in progress (the days spent are lost). */
    cancel(): void;
  };
  /** Refine: rolling the rarity and traits of a base again into variants, and saving the ones you want. */
  refine: {
    /** The base being refined and its variants not saved yet, if they are still there. */
    state(): { base: Program; variants: Program[] } | undefined;
    /** Refines this base for a day. Returns what happened. */
    day(baseId: string): string[];
    /** Saves a variant under this name; returns what happened. */
    save(variantId: string, name: string): string;
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
  private open: 'networks' | 'contracts' | 'software' | 'hardware' | 'character' | null = null;
  /** The Hardware tab's socket, market toggle and last message. */
  private hwView: HardwareView = { sel: null, hover: null, market: false, line: '' };
  /** What the last stretch of development did, shown under the project. */
  private devLines: string[] = [];
  private devDone: Program | undefined;
  /** The Abandon project button was clicked once and asks to be clicked again. */
  private cancelArmed = false;
  /** What the last bug fix did, shown in the Software tab. */
  private fixLine = '';
  /** The new-project form keeps its choices between renders. */
  private form = { type: 'hide' as ProgramType, rating: 1, name: '', icon: randomIcon('hide'), color: '#3dff7a', picked: false, body: '', compute: evenCompute('hide') };
  /** The program whose Refine card is open (from its card's refine button). */
  private refineTarget: string | null = null;
  /** What the last refine or save did. */
  private refineLines: string[] = [];
  /** Names typed for variants, kept between renders. */
  private variantNames = new Map<string, string>();
  private readonly main: HTMLElement;
  /** The Software tab takes the whole left side while it is open. */
  private readonly soft: HTMLElement;
  /** The Hardware tab (your brain and its implants) also takes the whole left side. */
  private readonly hard: HTMLElement;
  /** Known networks, contracts and the character also open on the left, like Software and Hardware. */
  private readonly panel: HTMLElement;
  readonly gear: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: HomeState,
    private readonly actions: HomeActions,
  ) {
    root.innerHTML = `
      <section class="home-gear" aria-label="Your gear"></section>
      <section class="home-soft" aria-label="Software" hidden></section>
      <section class="home-soft home-hard" aria-label="Hardware" hidden></section>
      <section class="home-soft home-panel" aria-label="Networks, contracts and character" hidden></section>
      <section class="home-empty" aria-hidden="true"></section>
      <section class="home-main"></section>`;
    this.gear = root.querySelector('.home-gear')!;
    this.soft = root.querySelector('.home-soft:not(.home-hard):not(.home-panel)')!;
    this.hard = root.querySelector('.home-hard')!;
    this.panel = root.querySelector('.home-panel')!;
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

  /** A progress bar for the days passing at the base (or nothing). Several can show; tickDays moves them all. */
  private dayJobHtml(): string {
    const j = this.actions.dayJob();
    if (!j) return '';
    return `<div class="day-job"><div class="day-job-label">${esc(j.label)}</div><div class="day-job-track"><div class="day-job-fill" style="width:${(100 * j.done) / j.total}%"></div></div><div class="day-job-count">day ${j.done}/${j.total}</div></div>`;
  }

  /** One more day went by: moves the bars and the day number in place, so scrolling and typing are not lost. */
  tickDays(): void {
    const j = this.actions.dayJob();
    this.root.querySelectorAll('.home-day').forEach((n) => { n.textContent = String(this.state.day); });
    if (!j) return;
    this.root.querySelectorAll<HTMLElement>('.day-job-fill').forEach((n) => { n.style.width = `${(100 * j.done) / j.total}%`; });
    this.root.querySelectorAll('.day-job-count').forEach((n) => { n.textContent = `day ${j.done}/${j.total}`; });
    // Resting: health climbs day by day.
    const hp = this.actions.character().health;
    this.root.querySelectorAll('[data-health]').forEach((n) => { n.textContent = String(hp); });
    this.root.querySelectorAll('.home-health').forEach((n) => n.classList.toggle('is-low', hp < 50));
    this.root.querySelectorAll<HTMLElement>('.health-bar .xp-fill').forEach((n) => { n.style.width = `${hp}%`; });
  }

  /** Draws the screen again (after days passed elsewhere). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    // Redrawing must not jump the open tab back to the top.
    const scroll = [this.soft, this.hard, this.panel].map((n) => n.scrollTop);
    this.renderAll();
    [this.soft, this.hard, this.panel].forEach((n, i) => { n.scrollTop = scroll[i]; });
  }

  private renderAll(): void {
    const s = this.state;
    const locked = s.reputation < CONTRACT_REPUTATION;
    this.main.innerHTML = `
      <h1 class="home-title">CYBERHACK</h1>
      <div class="home-stats"><button type="button" class="home-avatar" title="Change avatar">${iconSvg(this.actions.avatar().icon, 'home-avatar-icon', this.actions.avatar().color)}</button> day <span class="home-day">${s.day}</span> · <span class="home-money">${sats(this.actions.money())}</span> · reputation ${s.reputation} · <span class="home-health${this.actions.character().health < 50 ? ' is-low' : ''}">health <span data-health>${this.actions.character().health}</span>%</span></div>
      ${this.dayJobHtml()}
      ${s.news.length ? `<div class="home-news">${s.news.map((n) => `<div>${n}</div>`).join('')}</div>` : ''}
      <nav class="home-menu">
        <button type="button" class="home-btn${this.open === 'networks' ? ' is-open' : ''}" data-act="networks">Known networks${iconSvg(MENU_ICONS.networks, 'menu-icon')}</button>
        <button type="button" class="home-btn${this.open === 'contracts' ? ' is-open' : ''}" data-act="contracts"${locked ? ` disabled title="Needs reputation ${CONTRACT_REPUTATION}"` : ''}>Choose contract${iconSvg(MENU_ICONS.contracts, 'menu-icon')}${locked ? ` <span class="home-lock">(rep. ${CONTRACT_REPUTATION})</span>` : ''}</button>
        <button type="button" class="home-btn${this.open === 'software' ? ' is-open' : ''}" data-act="software">Software${iconSvg(MENU_ICONS.software, 'menu-icon')}</button>
        <button type="button" class="home-btn${this.open === 'hardware' ? ' is-open' : ''}" data-act="hardware">Hardware${iconSvg(MENU_ICONS.hardware, 'menu-icon is-flipped')}</button>
        <button type="button" class="home-btn${this.open === 'character' ? ' is-open' : ''}${this.actions.character().picks ? ' is-pending' : ''}" data-act="character">Character${iconSvg(this.actions.avatar().icon, 'menu-icon')}</button>
        <button type="button" class="home-btn" data-act="enter"${this.chosen ? '' : ' disabled title="Pick a network or a contract first"'}>Enter the network${iconSvg(MENU_ICONS.enter, 'menu-icon')}</button>
      </nav>
      <div class="home-active">chosen network: ${this.label()}</div>
      <div class="home-list"></div>
      <button type="button" class="credits-btn" data-credits>credits</button>`;
    for (const which of ['networks', 'contracts', 'software', 'hardware', 'character'] as const) {
      this.main.querySelector(`[data-act="${which}"]`)!.addEventListener('click', () => {
        this.actions.click();
        this.open = this.open === which ? null : which;
        this.devLines = [];
        this.devDone = undefined;
        this.fixLine = '';
        this.hwView.line = '';
        this.render();
      });
    }
    this.main.querySelector('.home-avatar')!.addEventListener('click', () => this.changeAvatar());
    this.main.querySelector('[data-credits]')!.addEventListener('click', () => {
      this.actions.click();
      showCredits();
    });
    this.main.querySelector('[data-act="enter"]')!.addEventListener('click', () => {
      if (!this.chosen) return;
      this.actions.click();
      this.actions.enter(this.chosen);
    });
    const software = this.open === 'software';
    const hardware = this.open === 'hardware';
    const panel = this.open === 'networks' || this.open === 'contracts' || this.open === 'character';
    // The left side keeps its size; with no tab open it is just empty.
    this.root.classList.add('is-software');
    this.root.classList.toggle('is-days', !!this.actions.dayJob());
    this.gear.hidden = true;
    this.soft.hidden = !software;
    this.hard.hidden = !hardware;
    this.panel.hidden = !panel;
    this.root.querySelector<HTMLElement>('.home-empty')!.hidden = !!this.open;
    const title = this.open === 'networks' ? 'known networks' : this.open === 'contracts' ? 'contracts' : 'character';
    this.panel.innerHTML = panel ? `<h2 class="sw-head">${title}</h2><div class="home-list panel-list"></div>` : '';
    const list = (panel ? this.panel.querySelector('.panel-list') : this.main.querySelector('.home-list'))!;
    if (software) this.renderSoftware();
    if (hardware) {
      renderHardware(this.hard, { ...this.actions.hardware, click: () => this.actions.click(), changed: () => this.render() }, this.hwView);
      this.hard.querySelector('.sw-head')?.insertAdjacentHTML('afterend', this.dayJobHtml());
    }
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
          ${this.lasting(net.id, net.income)}`, () => ({ kind: 'network', net }));
      }
    } else if (this.open === 'character') {
      this.renderCharacter(list);
    } else if (this.open === 'contracts') {
      for (const offer of s.offers) {
        const { contract: c, system: sys } = offer;
        const taken = this.chosen?.kind === 'contract' && this.chosen.offer === offer;
        card(taken, `
          <div class="cc-head"><span class="cc-title">${c.title}</span><span class="cc-pay">${sats(c.pay)}</span></div>
          <div class="cc-line">${sys.name} <span class="home-dim">(${sys.location})</span></div>
          <div class="cc-line home-dim">${c.need} one file in the company's databases. security level ${sys.security ?? 1}</div>
          ${this.deadlineLine(c.title, c.days ?? 5)}
          ${this.lasting(sys.id)}`, () => ({ kind: 'contract', offer }));
      }
    }
  }

  /** What you left behind in a network that is still there: planted skimmers, other agents of yours, backdoors. */
  private lasting(netId: string, income = 0.08): string {
    const lines = this.state.skimmers
      .filter((k) => k.netId === netId)
      .map((k) => `${k.program.name} (skimmer) planted: +${sats(Math.round(income * (k.program.efficiency ?? 1) * 100) / 100)} a day`);
    const doors = this.state.backdoors?.[netId]?.length ?? 0;
    if (doors) lines.push(`${doors > 1 ? `${doors} backdoors` : 'a backdoor'}: you can enter the system there`);
    if (!lines.length) return '';
    return `<div class="cc-lasting"><div class="cc-lasting-head">left in this network:</div>${lines.map((l) => `<div class="cc-line cc-skim">${l}</div>`).join('')}</div>`;
  }

  /** How long you have for a contract: days left once taken, or how many days it gives. */
  private deadlineLine(title: string, days: number): string {
    const taken = this.actions.contract();
    if (taken?.title === title) {
      const left = taken.deadline - this.actions.day();
      return `<div class="cc-line cc-deadline${left <= 1 ? ' is-urgent' : ''}">taken. ${left > 0 ? `${left} more day${left === 1 ? '' : 's'} after today` : 'last day today'} (until day ${taken.deadline})</div>`;
    }
    return `<div class="cc-line home-dim">deadline: ${days} days from the day you take it. you can try again if a run fails</div>`;
  }

  /** Opens the icon picker for the player's avatar. */
  private changeAvatar(): void {
    this.actions.click();
    const a = this.actions.avatar();
    showIconPicker({ title: 'your avatar', suggested: AVATAR_ICONS, icon: a.icon, color: a.color, onPick: (icon, color, body) => {
      this.actions.setAvatar(icon, color, body);
      this.render();
    } });
  }

  /** Character: level, the XP bar, the skills you have, and a pending skill choice. */
  private renderCharacter(list: Element): void {
    const c = this.actions.character();
    const need = xpToNext(c.level);
    const box = document.createElement('div');
    box.className = 'contract-card';
    const owned = c.skills.map((id) => SKILLS.find((s) => s.id === id)).filter((s) => s !== undefined);
    box.innerHTML = `
      <div class="ch-avatar">${iconSvg(this.actions.avatar().icon, 'ch-avatar-icon', this.actions.avatar().color)}<button type="button" class="home-btn cc-btn" data-avatar>Change avatar</button></div>
      <div class="cc-head"><span class="cc-title">level ${c.level}</span><span class="home-dim">${c.xp} / ${need} XP</span></div>
      <div class="xp-bar"><div class="xp-fill" style="width:${(100 * c.xp) / need}%"></div></div>
      <div class="cc-line home-dim">next level in ${need - c.xp} XP</div>
      <button type="button" class="home-btn cc-btn" data-levelup title="For testing: gain the XP the next level needs">Level up (test)</button>
      ${c.picks ? `<button type="button" class="home-btn cc-btn" data-pick>Choose a skill${c.picks > 1 ? ` (${c.picks})` : ''}</button>` : ''}
      <div class="cc-line ch-head">health</div>
      <div class="cc-head"><span class="home-health${c.health < 50 ? ' is-low' : ''}"><span data-health>${c.health}</span>%</span><span class="home-dim">${c.health < 100 ? `${daysToHeal(c.health)} days of rest to heal fully` : 'fully healthy'}</span></div>
      <div class="xp-bar health-bar"><div class="xp-fill" style="width:${c.health}%"></div></div>
      <div class="cc-line home-dim">leaving the net badly hurt, or being thrown out, damages your brain. at 0 you die</div>
      <div class="dev-row"><button type="button" class="home-btn cc-btn" data-rest="1"${c.health >= 100 ? ' disabled title="You are not hurt"' : ''}>Rest 1 day (+${REST_PER_DAY}%)</button><button type="button" class="home-btn cc-btn" data-rest="${Math.max(1, daysToHeal(c.health))}"${c.health >= 100 ? ' disabled title="You are not hurt"' : ''}>Rest until healed${c.health < 100 ? ` (${daysToHeal(c.health)} days)` : ''}</button></div>
      <div class="cc-line ch-head">skills</div>
      ${owned.length ? owned.map((s) => `<div class="cc-line"><span class="ch-skill">${s.name}</span> <span class="home-dim">${s.text}</span></div>`).join('') : '<div class="cc-line home-dim">none yet. every level up lets you pick one of three</div>'}
      <div class="cc-line ch-head">game code</div>
      <label class="dev-row"><input class="ch-code" maxlength="16" value="${c.code}"><button type="button" class="home-btn ch-code-btn">Set</button></label>
      <div class="cc-line home-dim">the code decides which skills every level offers: playing a mission again gives the same choice</div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-rest]').forEach((b) => b.addEventListener('click', () => {
      this.actions.click();
      this.actions.rest(Number(b.dataset.rest));
      this.render();
    }));
    const codeEl = box.querySelector<HTMLInputElement>('.ch-code')!;
    box.querySelector('.ch-code-btn')!.addEventListener('click', () => {
      const code = cleanGameCode(codeEl.value);
      if (!code) {
        codeEl.classList.add('is-bad');
        return;
      }
      this.actions.click();
      this.actions.setCode(code);
      this.render();
    });
    box.querySelector('[data-avatar]')!.addEventListener('click', () => this.changeAvatar());
    box.querySelector('[data-levelup]')!.addEventListener('click', () => {
      this.actions.click();
      this.actions.levelUp();
      this.render();
    });
    box.querySelector('[data-pick]')?.addEventListener('click', () => {
      this.actions.click();
      this.actions.pickSkills(() => this.render());
    });
    list.appendChild(box);
  }

  /**
   * Software tab, on the whole left side: big cards for the programs in memory (in the order you set)
   * and for the ones in storage. Drag a card into memory to load it, back to storage to unload it,
   * or within memory to change the order. Software development sits at the bottom.
   */
  private renderSoftware(): void {
    const sw = this.actions.software.list();
    const card = (p: Program, stored = false) => {
      const rarity = p.rarity ?? 'common';
      const traits = (p.traits ?? []).map((t) => `<div class="sw-trait">${esc(t)}</div>`).join('');
      const bugs = (p.bugs ?? []).map((b, i) => `<div class="sw-bug">- ${esc(b)} <button type="button" class="sw-fix" data-fix="${i}" title="Spend ${bugFixDays(p)} days fixing this bug">fix ${bugFixDays(p)} d</button></div>`).join('');
      return `<div class="sw-card rarity-${rarity}${p.id === this.devDone?.id ? ' is-new' : ''}" draggable="true" data-id="${esc(p.id)}" title="drag to load, unload or reorder; right-click for details">
        <div class="sw-icon">${programIcon(p, 'sw-icon-svg')}</div>
        <div class="sw-body">
          <div class="sw-name">${esc(p.name)}</div>
          <div class="sw-meta">${p.type} ${p.rating}</div>
          <div class="sw-rarity">${rarity} · ${tb(programSize(p))}${p.author ? ` · by ${esc(p.author)}` : ''}</div>
          ${statHtml(p).map((st) => `<div class="sw-stat">${st.label} ${st.html}</div>`).join('')}
          ${traits}
          ${bugs}
        </div>
        ${CATEGORIES[p.type] ? `<button type="button" class="sw-refine" title="Roll its rarity and traits again into variants">refine</button>` : ''}
        ${stored ? `<button type="button" class="sw-del" title="Delete this program for good">delete</button>` : ''}
      </div>`;
    };
    this.soft.innerHTML = `
      <h2 class="sw-head">memory <span class="sw-used${sw.used > sw.memory * 0.9 ? ' is-full' : ''}">${tb(sw.used)} / ${tb(sw.memory)}</span><span class="mem-bar sw-mem-bar${sw.used > sw.memory * 0.9 ? ' is-full' : ''}" title="${tb(sw.used)} used, ${tb(sw.memory - sw.used)} free"><span class="mem-fill" style="width:${Math.min(100, (100 * sw.used) / sw.memory)}%"></span></span><span class="home-dim">${tb(sw.memory - sw.used)} free</span></h2>
      <div class="sw-zone" data-zone="loaded">${sw.loaded.map((p) => card(p)).join('') || '<div class="sw-empty">drag programs here to take them into the net</div>'}</div>
      <h2 class="sw-head">storage <span class="home-dim">known, not loaded</span></h2>
      <div class="sw-zone" data-zone="stored">${sw.stored.map((p) => card(p, true)).join('') || '<div class="sw-empty">nothing in storage</div>'}</div>
      ${this.fixLine ? `<div class="sw-fixed">${esc(this.fixLine)}</div>` : ''}
      <h2 class="sw-head">software development</h2>
      <div class="sw-dev"></div>`;
    this.renderDev(this.soft.querySelector('.sw-dev')!);
    const all = [...sw.loaded, ...sw.stored];
    let dragId: string | null = null;
    const clearMarks = () => this.soft.querySelectorAll('.drop-before, .drop-end').forEach((e) => e.classList.remove('drop-before', 'drop-end'));
    /** Where in the memory row a drop at this point lands: before the first card the pointer is ahead of. */
    const dropIndex = (zone: HTMLElement, x: number, y: number): number => {
      const cards = [...zone.querySelectorAll<HTMLElement>('.sw-card')];
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return i;
      }
      return cards.length;
    };
    this.soft.querySelectorAll<HTMLElement>('.sw-card').forEach((el) => {
      const p = all.find((x) => x.id === el.dataset.id)!;
      el.addEventListener('dragstart', (e) => {
        dragId = p.id;
        e.dataTransfer?.setData('text/plain', p.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-dragging');
      });
      el.addEventListener('dragend', () => {
        dragId = null;
        el.classList.remove('is-dragging');
        clearMarks();
      });
      el.querySelectorAll<HTMLElement>('.sw-fix').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.actions.click();
        this.fixLine = this.actions.software.fix(p.id, Number(b.dataset.fix)) ?? '';
        this.render();
      }));
      el.querySelector('.sw-refine')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.actions.click();
        this.refineTarget = p.id;
        this.refineLines = [];
        this.render();
        this.soft.querySelector('.rf-card')?.scrollIntoView({ block: 'nearest' });
      });
      const del = el.querySelector<HTMLButtonElement>('.sw-del');
      // Two clicks: the first asks, the second deletes for good.
      del?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('is-sure')) {
          this.actions.click();
          del.classList.add('is-sure');
          del.textContent = 'delete for good?';
          setTimeout(() => {
            del.classList.remove('is-sure');
            del.textContent = 'delete';
          }, 3000);
          return;
        }
        this.actions.software.remove(p.id);
        this.fixLine = `${p.name} deleted`;
        this.render();
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const loaded = sw.loaded.includes(p);
        showProgramInfo(p, { status: loaded ? 'loaded in memory' : 'in storage', action: { label: loaded ? 'Unload' : 'Load', run: () => this.place(p.id, loaded ? null : sw.loaded.length) } });
      });
    });
    this.soft.querySelectorAll<HTMLElement>('.sw-zone').forEach((zone) => {
      const intoMemory = zone.dataset.zone === 'loaded';
      zone.addEventListener('dragover', (e) => {
        if (!dragId) return;
        e.preventDefault();
        clearMarks();
        if (!intoMemory) {
          zone.classList.add('drop-end');
          return;
        }
        const i = dropIndex(zone, e.clientX, e.clientY);
        const cards = zone.querySelectorAll<HTMLElement>('.sw-card');
        if (i < cards.length) cards[i].classList.add('drop-before');
        else zone.classList.add('drop-end');
      });
      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget as Node)) clearMarks();
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = dragId ?? e.dataTransfer?.getData('text/plain');
        clearMarks();
        if (!id) return;
        this.place(id, intoMemory ? dropIndex(zone, e.clientX, e.clientY) : null);
      });
    });
  }

  /** Moves a program and draws the tab again; a program that does not fit is refused. */
  private place(id: string, index: number | null): void {
    if (this.actions.software.place(id, index)) this.actions.click();
    else {
      this.actions.software.refused();
      this.soft.querySelector('[data-zone="loaded"]')?.classList.add('is-refused');
      setTimeout(() => this.soft.querySelector('[data-zone="loaded"]')?.classList.remove('is-refused'), 500);
      return;
    }
    this.render();
  }

  /** Software development: a form for a new project, or the project in progress with its buttons. */
  private renderDev(list: Element): void {
    const p = this.actions.dev.project();
    const box = document.createElement('div');
    box.className = 'contract-card dev-card';
    // What the last work did, until the next click elsewhere (a finished program shows up highlighted in storage).
    const result = this.devLines.length && !p ? '' : this.devLines.length ? `<div class="dev-log">${this.devLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : '';
    const job = this.actions.dayJob();
    if (job && job.label.startsWith('developing')) {
      box.innerHTML = this.dayJobHtml();
    } else if (!p) {
      const f = this.form;
      const name = f.name || `${cap(f.type)} ${f.rating}.0`;
      box.innerHTML = `
        ${result}
        <div class="cc-head"><span class="cc-title">new program</span><span class="home-dim">${devDays(f.rating)} days of work</span></div>
        <label class="dev-row">type <select class="dev-type">${PROGRAM_TYPES.map((t) => `<option${t === f.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="dev-row">icon <button type="button" class="dev-icon-btn" title="Choose the icon and its colour">${iconSvg(f.icon, 'dev-icon', f.color)} change</button></div>
        <label class="dev-row">rating <select class="dev-rating">${Array.from({ length: MAX_DEV_RATING }, (_, i) => `<option${i + 1 === f.rating ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <label class="dev-row">name <input class="dev-name" maxlength="20" value="${esc(name)}"></label>
        ${this.computeHtml()}
        <div class="cc-line home-dim">size about ${tb(programSize(f))}. when it is done it may have up to ${MAX_BUGS} bugs: use it as it is, or fix them later (${bugFixDays(f)} days a bug). rarity and traits are rolled when it is done: common ${RARITY_TRAITS.common} traits, uncommon ${RARITY_TRAITS.uncommon}, rare ${RARITY_TRAITS.rare}, epic ${RARITY_TRAITS.epic}, legendary ${RARITY_TRAITS.legendary} and your name</div>
        <button type="button" class="home-btn cc-btn" data-dev="start"${this.computeLeft() ? ` disabled title="Spend all ${COMPUTE_POINTS} points of Compute first"` : ''}>Train Model</button>`;
      const type = box.querySelector<HTMLSelectElement>('.dev-type')!;
      const rating = box.querySelector<HTMLSelectElement>('.dev-rating')!;
      const nameEl = box.querySelector<HTMLInputElement>('.dev-name')!;
      const auto = !f.name;
      const change = () => {
        // A new type draws a new icon from its pool, unless the player chose one.
        if (!f.picked && f.type !== type.value) f.icon = randomIcon(type.value as ProgramType);
        if (f.type !== type.value) f.compute = evenCompute(type.value as ProgramType);
        f.type = type.value as ProgramType;
        f.rating = Number(rating.value);
        if (auto) f.name = '';
        this.render();
      };
      type.addEventListener('change', change);
      rating.addEventListener('change', change);
      nameEl.addEventListener('input', () => { f.name = nameEl.value; });
      box.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        const key = b.dataset.cat!;
        const d = Number(b.dataset.d);
        const v = (f.compute[key] ?? 0) + d;
        if (v < 0 || (d > 0 && !this.computeLeft())) return;
        this.actions.click();
        f.compute[key] = v;
        this.render();
      }));
      box.querySelector('.dev-icon-btn')!.addEventListener('click', () => {
        this.actions.click();
        showIconPicker({ title: `icon for ${f.type}`, suggested: ICON_POOLS[f.type], icon: f.icon, color: f.color, onPick: (icon, color, body) => {
          Object.assign(f, { icon, color, picked: true, body });
          this.render();
        } });
      });
      box.querySelector('[data-dev="start"]')!.addEventListener('click', () => {
        this.actions.click();
        if (this.computeLeft()) return;
        this.actions.dev.start(f.type, f.rating, (nameEl.value.trim() || name).slice(0, 20), f.icon, f.color, f.body, CATEGORIES[f.type] ? { ...f.compute } : undefined);
        Object.assign(f, { name: '', picked: false, icon: randomIcon(f.type), body: '', compute: evenCompute(f.type) });
        this.devLines = [];
        this.devDone = undefined;
        this.render();
      });
    } else {
      const total = p.daysSpent + p.daysLeft;
      const width = 20;
      const filled = Math.round((p.daysSpent / total) * width);
      box.innerHTML = `
        <div class="cc-head"><span class="cc-title">${programIcon(p, 'dev-icon')} ${esc(p.name)}</span><span class="home-dim">${p.type} ${p.rating}</span></div>
        <div class="cc-line dev-bar">[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${p.daysSpent}/${total} days</div>
        <div class="cc-line">${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} of work left</div>
        <div class="dev-btns">
          <button type="button" class="home-btn cc-btn" data-dev="day">Train for day</button>
          <button type="button" class="home-btn cc-btn" data-dev="week"${p.daysLeft < 7 ? ' disabled title="Needs at least 7 days of work left"' : ''}>Train for week</button>
          <button type="button" class="home-btn cc-btn" data-dev="finish" title="Works the ${p.daysLeft} days left">Finish (${p.daysLeft} d)</button>
          <button type="button" class="home-btn cc-btn dev-cancel" data-dev-cancel>${this.cancelArmed ? 'Really abandon it? The days are lost' : 'Abandon project'}</button>
        </div>
        ${result}`;
      box.querySelector('[data-dev-cancel]')!.addEventListener('click', () => {
        this.actions.click();
        if (!this.cancelArmed) {
          this.cancelArmed = true;
        } else {
          this.cancelArmed = false;
          this.devLines = [];
          this.actions.dev.cancel();
        }
        this.render();
      });
      for (const mode of ['day', 'week', 'finish'] as const) {
        box.querySelector(`[data-dev="${mode}"]`)!.addEventListener('click', () => {
          this.actions.click();
          const r = this.actions.dev.work(mode);
          this.devLines = r.lines;
          this.devDone = r.program;
          this.cancelArmed = false;
          this.render();
        });
      }
    }
    list.appendChild(box);
    this.renderRefine(list);
  }

  /** Compute points not spread yet on the new-program form (0 for types that have no categories). */
  private computeLeft(): number {
    if (!CATEGORIES[this.form.type]) return 0;
    return COMPUTE_POINTS - Object.values(this.form.compute).reduce((a, b) => a + b, 0);
  }

  /** The Compute rows of the new-program form: 20 points, 5% each, spread over the type's categories. */
  private computeHtml(): string {
    const defs = CATEGORIES[this.form.type];
    if (!defs) return '';
    const left = this.computeLeft();
    const rows = defs.map((d) => {
      const pts = this.form.compute[d.key] ?? 0;
      return `<div class="dev-cat"><span class="dev-cat-name">${d.label}</span><button type="button" class="dev-cat-btn" data-cat="${d.key}" data-d="-1"${pts ? '' : ' disabled'}>-</button><span class="dev-cat-bar"><span style="width:${(100 * pts) / COMPUTE_POINTS}%"></span></span><button type="button" class="dev-cat-btn" data-cat="${d.key}" data-d="1"${left ? '' : ' disabled'}>+</button><span class="dev-cat-pct">${pts * 5}%</span></div>`;
    }).join('');
    return `<div class="dev-row">compute <span class="home-dim">${left ? `${left} of ${COMPUTE_POINTS} points left (5% each)` : 'all points spent'}</span></div>${rows}`;
  }

  /** Refine: the base, a button to refine it for a day, and the variants waiting to be saved. */
  private renderRefine(list: Element): void {
    const st = this.actions.refine.state();
    const all = (() => { const sw = this.actions.software.list(); return [...sw.loaded, ...sw.stored]; })();
    const base = all.find((p) => p.id === (this.refineTarget ?? st?.base.id));
    if (!base) return;
    const variants = st && st.base.id === base.id ? st.variants : [];
    const dropping = st && st.base.id !== base.id && st.variants.length ? st : undefined;
    const busy = !!this.actions.dayJob();
    const cost = variantCost(base);
    const box = document.createElement('div');
    box.className = 'contract-card dev-card rf-card';
    const variant = (v: Program) => {
      const rarity = v.rarity ?? 'common';
      const name = this.variantNames.get(v.id) ?? v.name;
      return `<div class="rf-var rarity-${rarity}" data-v="${esc(v.id)}">
        <div class="rf-var-head">${programIcon(v, 'dev-icon')}<input class="rf-name" maxlength="20" value="${esc(name)}"><span>${rarity}</span></div>
        ${statHtml(v).map((s) => `<div class="sw-stat">${s.label} ${s.html}</div>`).join('')}
        ${(v.traits ?? []).map((t) => `<div class="sw-trait">${esc(t)}</div>`).join('') || '<div class="home-dim">no traits</div>'}
        ${(v.bugs ?? []).map((b) => `<div class="sw-bug">- ${esc(b)}</div>`).join('')}
        <button type="button" class="home-btn cc-btn" data-save="${esc(v.id)}">Save (${cost} §)</button>
      </div>`;
    };
    box.innerHTML = `
      <div class="cc-head"><span class="cc-title">${programIcon(base, 'dev-icon')} refine ${esc(base.name)}</span><span class="home-dim">${VARIANTS_PER_DAY} variants a day</span></div>
      <div class="cc-line home-dim">rolls the rarity and traits again; the base stays the same. save the variants you want (${cost} § each), the rest are lost when another day passes</div>
      ${dropping ? `<div class="cc-line sw-bug">refining ${esc(base.name)} drops the ${dropping.variants.length} unsaved variant${dropping.variants.length === 1 ? '' : 's'} of ${esc(dropping.base.name)}</div>` : ''}
      <div class="dev-btns">
        <button type="button" class="home-btn cc-btn" data-refine-day${busy ? ' disabled title="Wait for the days to pass"' : ''}>Refine for day</button>
        ${variants.length ? '' : '<button type="button" class="home-btn cc-btn" data-refine-close>Close</button>'}
      </div>
      ${this.refineLines.length ? `<div class="dev-log">${this.refineLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
      ${variants.length ? `<div class="rf-variants">${variants.map(variant).join('')}</div>` : ''}`;
    box.querySelector('[data-refine-day]')!.addEventListener('click', () => {
      this.actions.click();
      this.refineTarget = base.id;
      this.refineLines = this.actions.refine.day(base.id);
      this.render();
    });
    box.querySelector('[data-refine-close]')?.addEventListener('click', () => {
      this.actions.click();
      this.refineTarget = null;
      this.refineLines = [];
      this.render();
    });
    box.querySelectorAll<HTMLInputElement>('.rf-name').forEach((inp) => inp.addEventListener('input', () => {
      this.variantNames.set(inp.closest<HTMLElement>('.rf-var')!.dataset.v!, inp.value);
    }));
    box.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.save!;
      const v = variants.find((x) => x.id === id)!;
      this.refineLines = [this.actions.refine.save(id, this.variantNames.get(id) ?? v.name)];
      this.render();
    }));
    list.appendChild(box);
  }
}
