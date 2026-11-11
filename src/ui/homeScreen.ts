import type { ContractDef, SystemDef } from '../sim/types';
import { sats } from '../sim/money';

/** A contract on offer: the job and the system it is in. */
export interface ContractOffer {
  contract: ContractDef;
  system: SystemDef;
}

export interface HomeActions {
  /** The player picked (or dropped) a contract. */
  choose(offer: ContractOffer | undefined): void;
  /** Jack in: start the run. */
  enter(): void;
  click(): void;
}

/**
 * The main screen, where the game starts: your gear on the left, and for now two options,
 * choose a contract and enter the network.
 */
export class HomeScreen {
  private chosen: ContractOffer | undefined;
  private listOpen = false;
  private readonly main: HTMLElement;
  readonly gear: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly offers: ContractOffer[],
    private readonly actions: HomeActions,
  ) {
    root.innerHTML = `
      <section class="home-gear" aria-label="Your gear"></section>
      <section class="home-main"></section>`;
    this.gear = root.querySelector('.home-gear')!;
    this.main = root.querySelector('.home-main')!;
    this.render();
  }

  get contract(): ContractOffer | undefined {
    return this.chosen;
  }

  hide(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const job = this.chosen?.contract;
    this.main.innerHTML = `
      <h1 class="home-title">CYBERHACK</h1>
      <nav class="home-menu">
        <button type="button" class="home-btn${this.listOpen ? ' is-open' : ''}" data-act="contracts">Choose contract</button>
        <button type="button" class="home-btn" data-act="enter">Enter the network</button>
      </nav>
      <div class="home-active">active contract: ${job ? `<span class="home-job">${job.title}</span> <span class="home-dim">(${this.chosen!.system.name}, pays ${sats(job.pay)})</span>` : '<span class="home-dim">none</span>'}</div>
      <div class="home-list"></div>`;
    this.main.querySelector('[data-act="contracts"]')!.addEventListener('click', () => {
      this.actions.click();
      this.listOpen = !this.listOpen;
      this.render();
    });
    this.main.querySelector('[data-act="enter"]')!.addEventListener('click', () => {
      this.actions.click();
      this.actions.enter();
    });
    if (!this.listOpen) return;
    const list = this.main.querySelector('.home-list')!;
    for (const offer of this.offers) {
      const { contract: c, system: s } = offer;
      const taken = this.chosen === offer;
      const card = document.createElement('div');
      card.className = `contract-card${taken ? ' is-taken' : ''}`;
      card.innerHTML = `
        <div class="cc-head"><span class="cc-title">${c.title}</span><span class="cc-pay">${sats(c.pay)}</span></div>
        <div class="cc-line">${s.name} <span class="home-dim">(${s.location})</span></div>
        <div class="cc-line home-dim">${c.need} one file in the company's databases. security level ${s.security ?? 1}</div>
        <button type="button" class="home-btn cc-btn">${taken ? 'Accepted' : 'Accept'}</button>`;
      card.querySelector('button')!.addEventListener('click', () => {
        this.actions.click();
        this.chosen = taken ? undefined : offer;
        this.actions.choose(this.chosen);
        this.render();
      });
      list.appendChild(card);
    }
  }
}
