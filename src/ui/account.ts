import { DEFAULT_MEMORY, STARTING_PROGRAMS } from '../sim/game';
import { programSize, usedMemory, type Program } from '../sim/programs';
import { newPizzeria, type NetworkSeed } from '../sim/generate';
import type { DevProject } from '../sim/development';

/** What the player keeps between runs: sats and software. Saved in the browser. */
export interface Account {
  sats: number;
  /** Every program the player owns. */
  programs: Program[];
  /** Ids of the programs loaded in memory: the ones you take into the net. */
  loaded: string[];
  /** Memory slots of your hardware. */
  memory: number;
  /** Day counter: every trip into the net is one day. */
  day: number;
  reputation: number;
  /** Networks you know, saved as tiny seed records. */
  networks: NetworkSeed[];
  /** Skimmers planted in local businesses. */
  skimmers: { netId: string; program: Program }[];
  /** What happened on the last day (skimmer income, a skimmer found), shown on the main screen. */
  news: string[];
  /** The program you are writing, if any. */
  project?: DevProject;
  /** Character level, XP into the current level, and the skills learned. */
  level: number;
  xp: number;
  skills: string[];
  /** Level ups whose skill has not been picked yet. */
  skillPicks: number;
}

/**
 * Days pass (one by default): every skimmer takes its cut each day, and each may be found and removed
 * (the business then tightens security). The day counter moves on too.
 */
export function passDay(a: Account, roll: () => number = Math.random, days = 1): void {
  const news: string[] = [];
  let earned = 0;
  for (let d = 0; d < days; d++) for (const sk of [...a.skimmers]) {
    const net = a.networks.find((n) => n.id === sk.netId);
    if (!net) continue;
    if (roll() * 100 < (sk.program.detection ?? 5)) {
      a.skimmers.splice(a.skimmers.indexOf(sk), 1);
      net.security++;
      news.push(`${net.name} found your ${sk.program.name} and removed it. its security is now ${net.security}`);
      continue;
    }
    earned += (net.income ?? 0.08) * (sk.program.efficiency ?? 1);
  }
  earned = Math.round(earned * 100) / 100;
  if (earned > 0) {
    a.sats = Math.round((a.sats + earned) * 100) / 100;
    news.unshift(`skimmers brought in ${earned.toFixed(2)} §${days > 1 ? ` in ${days} days` : ''}`);
  }
  a.day += days;
  a.news = news;
}

/** Starting programs that do not fit in the starting memory: they wait in storage. */
const START_STORED = ['Owl 1.0', 'Sapper 1.0', 'Bleach 1.1', 'Mimic 1.0', 'Skimmer 1.0'];

function fresh(): Account {
  const programs = STARTING_PROGRAMS.map((p) => ({ ...p }));
  return { sats: 0, programs, loaded: programs.filter((p) => !START_STORED.includes(p.name)).map((p) => p.id), memory: DEFAULT_MEMORY, day: 1, reputation: 0, networks: [newPizzeria(randomSeed())], skimmers: [], news: [], level: 1, xp: 0, skills: [], skillPicks: 0 };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
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
  const p = a.programs.find((x) => x.id === id);
  if (!p || usedMemory(loadedPrograms(a)) + programSize(p) > a.memory) return false;
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
  // Memory used to count programs; now it is GB.
  if (typeof a.memory !== 'number' || a.memory < 100) a.memory = DEFAULT_MEMORY;
  if (typeof a.day !== 'number') a.day = 1;
  if (typeof a.reputation !== 'number') a.reputation = 0;
  if (!Array.isArray(a.networks) || !a.networks.length) a.networks = [newPizzeria(randomSeed())];
  if (!Array.isArray(a.skimmers)) a.skimmers = [];
  if (!Array.isArray(a.news)) a.news = [];
  if (typeof a.level !== 'number') a.level = 1;
  if (typeof a.xp !== 'number') a.xp = 0;
  if (!Array.isArray(a.skills)) a.skills = [];
  if (typeof a.skillPicks !== 'number') a.skillPicks = 0;
  if (!Array.isArray(a.loaded)) a.loaded = a.programs.filter((p) => !START_STORED.includes(p.name)).map((p) => p.id);
  // Unload from the end until what is loaded fits.
  while (a.loaded.length && usedMemory(loadedPrograms(a)) > a.memory) a.loaded.pop();
  // New starting programs reach old saves too.
  for (const p of STARTING_PROGRAMS) {
    if (a.programs.some((q) => q.type === p.type)) continue;
    const added = { ...p, id: `p${nextProgramId(a)}` };
    a.programs.push(added);
    if (usedMemory(loadedPrograms(a)) + programSize(added) <= a.memory) a.loaded.push(added.id);
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
