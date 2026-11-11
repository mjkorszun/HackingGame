import { DEFAULT_MEMORY, STARTING_PROGRAMS } from '../sim/game';
import type { Program } from '../sim/programs';

/** What the player keeps between runs: sats and software. Saved in the browser. */
export interface Account {
  sats: number;
  /** Every program the player owns. */
  programs: Program[];
  /** Ids of the programs loaded in memory: the ones you take into the net. */
  loaded: string[];
  /** Memory slots of your hardware. */
  memory: number;
}

/** Starting programs that do not fit in the starting memory: they wait in storage. */
const START_STORED = ['Owl 1.0', 'Sapper 1.0', 'Bleach 1.1', 'Mimic 1.0'];

function fresh(): Account {
  const programs = STARTING_PROGRAMS.map((p) => ({ ...p }));
  return { sats: 0, programs, loaded: programs.filter((p) => !START_STORED.includes(p.name)).map((p) => p.id), memory: DEFAULT_MEMORY };
}

export function loadedPrograms(a: Account): Program[] {
  return a.programs.filter((p) => a.loaded.includes(p.id));
}

/** First free program id number across everything the player owns. */
export function nextProgramId(a: Account): number {
  return Math.max(100, ...a.programs.map((p) => Number(p.id.replace(/\D/g, '')) + 1 || 0));
}

/** Loads a stored program into memory, or unloads a loaded one. Returns false when memory is full. */
export function toggleLoaded(a: Account, id: string): boolean {
  if (a.loaded.includes(id)) {
    a.loaded = a.loaded.filter((x) => x !== id);
    return true;
  }
  if (a.loaded.length >= a.memory) return false;
  a.loaded.push(id);
  return true;
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
  return fresh();
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
  renameOld(programs);
  if (typeof a.memory !== 'number') a.memory = DEFAULT_MEMORY;
  if (!Array.isArray(a.loaded)) a.loaded = a.programs.filter((p) => !START_STORED.includes(p.name)).slice(0, a.memory).map((p) => p.id);
  // New starting programs reach old saves too.
  for (const p of STARTING_PROGRAMS) {
    if (a.programs.some((q) => q.type === p.type)) continue;
    const added = { ...p, id: `p${nextProgramId(a)}` };
    a.programs.push(added);
    if (a.loaded.length < a.memory) a.loaded.push(added.id);
  }
  return a;
}

function renameOld(programs: { type: string; name: string }[]): void {
  if (!programs.some((p) => p.type === 'brute')) return;
  for (const p of programs) {
    if (p.type === 'decrypt') {
      p.type = 'scan';
      if (p.name === 'Lockpick 1.0') p.name = 'Probe 1.0';
    } else if (p.type === 'brute') {
      p.type = 'decrypt';
      if (p.name === 'Battering Ram 2.0') p.name = 'Lockpick 1.0';
    }
  }
}
