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
      if (typeof a.sats === 'number' && Array.isArray(a.programs)) return migrate(a);
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

/** Saves from before the rename: old "decrypt" read archives (now scan), old "brute" cracked seals (now decrypt). */
function migrate(a: Account): Account {
  const programs = a.programs as { type: string; name: string }[];
  if (!programs.some((p) => p.type === 'brute')) return a;
  for (const p of programs) {
    if (p.type === 'decrypt') {
      p.type = 'scan';
      if (p.name === 'Lockpick 1.0') p.name = 'Probe 1.0';
    } else if (p.type === 'brute') {
      p.type = 'decrypt';
      if (p.name === 'Battering Ram 2.0') p.name = 'Lockpick 1.0';
    }
  }
  return a;
}
