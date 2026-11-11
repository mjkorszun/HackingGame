import { STARTING_PROGRAMS } from '../sim/game';
import type { Program } from '../sim/programs';

/** What the player keeps between runs: sats and software. Saved in the browser. */
export interface Account {
  sats: number;
  programs: Program[];
}

const KEY = 'cyberhack.account';

export function loadAccount(): Account {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw) as Account;
      if (typeof a.sats === 'number' && Array.isArray(a.programs)) return a;
    }
  } catch {
    // No storage (private window, blocked): start fresh.
  }
  return { sats: 0, programs: STARTING_PROGRAMS.map((p) => ({ ...p })) };
}

export function saveAccount(a: Account): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Nowhere to save: the account lasts only this page.
  }
}
