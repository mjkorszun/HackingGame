import type { ContractDef, SystemDef } from '../sim/types';
import type { NetworkSeed } from '../sim/generate';
import { sats } from '../sim/money';

/** A contract on offer: the job and the system it is in. */
export interface ContractOffer {
  contract: ContractDef;
  system: SystemDef;
}

/** What the player picked to hack next: a known local network, or a contract. */
export type Choice = { kind: 'network'; net: NetworkSeed } | { kind: 'contract'; offer: ContractOffer };

/** Reputation needed before anyone offers you contracts. */
export const CONTRACT_REPUTATION = 3;

export interface HomeState {
  day: number;
  reputation: number;
  networks: NetworkSeed[];
  offers: ContractOffer[];
}

export interface HomeActions {
  /** Jack in: start the run. */
  enter(choice: Choice): void;
  click(): void;
}

/**
 * The main screen, where the game starts: your gear on the left; on the right, known networks,
 * contracts (once you have the reputation) and entering the network.
 */
export class HomeScreen {
  private chosen: Choice | undefined;
  private open: 'networks' | 'contracts' | null = null;
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

  private render(): void {
    const s = this.state;
    const locked = s.reputation < CONTRACT_REPUTATION;
    this.main.innerHTML = `
      <h1 class="home-title">CYBERHACK</h1>
      <div class="home-stats">day ${s.day} · reputation ${s.reputation}</div>
      <nav class="home-menu">
        <button type="button" class="home-btn${this.open === 'networks' ? ' is-open' : ''}" data-act="networks">Known networks</button>
        <button type="button" class="home-btn${this.open === 'contracts' ? ' is-open' : ''}" data-act="contracts"${locked ? ` disabled title="Needs reputation ${CONTRACT_REPUTATION}"` : ''}>Choose contract${locked ? ` <span class="home-lock">(rep. ${CONTRACT_REPUTATION})</span>` : ''}</button>
        <button type="button" class="home-btn" data-act="enter"${this.chosen ? '' : ' disabled title="Pick a network or a contract first"'}>Enter the network</button>
      </nav>
      <div class="home-active">chosen network: ${this.label()}</div>
      <div class="home-list"></div>`;
    for (const which of ['networks', 'contracts'] as const) {
      this.main.querySelector(`[data-act="${which}"]`)!.addEventListener('click', () => {
        this.actions.click();
        this.open = this.open === which ? null : which;
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
          <div class="cc-line home-dim">${net.location}. security level ${net.security}</div>`, () => ({ kind: 'network', net }));
      }
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
}
