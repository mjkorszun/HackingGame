import { DEFAULT_MEMORY, STARTING_PROGRAMS } from '../sim/game';
import { programSize, usedMemory, type Program } from '../sim/programs';
import { newPizzeria, type NetworkSeed } from '../sim/generate';
import type { DevProject } from '../sim/development';
import { newGameCode } from '../sim/progression';
import { MAX_HEALTH, REST_PER_DAY } from '../sim/health';
import { chipById, KINDS, REMOVE_DAYS, sellPrice, SOCKETS, STARTER_CHIPS, RENAMED_CHIPS, type SocketId } from '../sim/implants';

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
  /** The game's code: it alone decides which skills each level offers. */
  code: string;
  /** How the player looks in the net: an icon and its colour. */
  avatar: { icon: string; color: string };
  /** Icons picked from the full set (name to SVG body), so they show without loading the whole set. */
  customIcons: Record<string, string>;
  /** Your health, 0-100: at 0 you die. */
  health: number;
  /** The contract you took and the last day to finish it. */
  contract?: { title: string; deadline: number };
  /** Chips wired into your brain (socket to chip model id), spare chips you own, and market offers bought today. */
  hardware: { installed: Partial<Record<SocketId, string>>; spare: string[]; bought: { day: number; ids: string[] } };
  /** Save format: 2 = the scout is the agent, the old scout is the mapper. */
  version?: number;
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
  if (a.contract && a.day > a.contract.deadline) {
    news.push(`the deadline for ${a.contract.title} has passed: the contract is lost`);
    a.contract = undefined;
  }
  a.news = news;
}

/** Rests at your base: days pass and you heal. */
export function rest(a: Account, days: number): void {
  passDay(a, Math.random, days);
  const before = a.health;
  a.health = Math.min(MAX_HEALTH, a.health + days * REST_PER_DAY);
  a.news.unshift(`you rested ${days} day${days === 1 ? '' : 's'}: health ${before}% → ${a.health}%`);
}

/** The bare minimum to go online: a basic jack in the spinal cord and memory in the hippocampus. */
function newHardware(): Account['hardware'] {
  return { installed: { spine1: STARTER_CHIPS.jack.id, hippocampus: STARTER_CHIPS.memory.id }, spare: [], bought: { day: 0, ids: [] } };
}

/** Memory size comes from the memory chip in the hippocampus. Unloads programs from the end until they fit. */
function syncMemory(a: Account): void {
  const mem = chipById(a.hardware.installed.hippocampus ?? '');
  a.memory = mem ? mem.value : 0;
  while (a.loaded.length && usedMemory(loadedPrograms(a)) > a.memory) a.loaded.pop();
}

/** Buys a chip from today's market into your spare chips. */
export function buyChip(a: Account, chipId: string, price: number): string {
  const c = chipById(chipId);
  if (!c) return 'no such chip';
  if (a.hardware.bought.day !== a.day) a.hardware.bought = { day: a.day, ids: [] };
  if (a.hardware.bought.ids.includes(chipId)) return `${c.name} is sold out today`;
  if (a.sats < price) return `${c.name} costs ${price} §: not enough sats`;
  a.sats = Math.round((a.sats - price) * 100) / 100;
  a.hardware.spare.push(chipId);
  a.hardware.bought.ids.push(chipId);
  return `bought ${c.name} for ${price} §. put it in from the Hardware screen`;
}

/** Sells one spare chip to a dealer. */
export function sellChip(a: Account, chipId: string): string {
  const i = a.hardware.spare.indexOf(chipId);
  const c = chipById(chipId);
  if (i < 0 || !c) return 'you have no such chip';
  a.hardware.spare.splice(i, 1);
  const p = sellPrice(c);
  a.sats = Math.round((a.sats + p) * 100) / 100;
  return `sold ${c.name} for ${p} §`;
}

/**
 * Puts a spare chip into a socket (the chip that was there goes back to your spares).
 * Returns the days of recovery, or a reason it cannot be done.
 */
export function installChip(a: Account, chipId: string, socket: SocketId): { days: number } | string {
  const c = chipById(chipId);
  const s = SOCKETS.find((x) => x.id === socket);
  const i = a.hardware.spare.indexOf(chipId);
  if (!c || !s || i < 0) return 'you have no such chip';
  if (!s.fits.includes(c.kind)) return `a ${KINDS[c.kind].name} does not fit the ${s.name}`;
  a.hardware.spare.splice(i, 1);
  const old = a.hardware.installed[socket];
  if (old) a.hardware.spare.push(old);
  a.hardware.installed[socket] = chipId;
  syncMemory(a);
  return { days: c.surgery };
}

/** Takes a chip out into your spares. You cannot take out your memory or your only jack: you could not go online. */
export function removeChip(a: Account, socket: SocketId): { days: number } | string {
  const id = a.hardware.installed[socket];
  const c = id ? chipById(id) : undefined;
  if (!id || !c) return 'the socket is empty';
  if (c.kind === 'memory') return 'without memory you cannot go online: swap it for another memory chip instead';
  const jacks = Object.values(a.hardware.installed).filter((x) => x && chipById(x)?.kind === 'jack').length;
  if (c.kind === 'jack' && jacks <= 1) return 'without a jack you cannot go online: swap it for another jack instead';
  delete a.hardware.installed[socket];
  a.hardware.spare.push(id);
  return { days: REMOVE_DAYS };
}

/** Starting programs that do not fit in the starting memory: they wait in storage. */
const START_STORED = ['Sparrow 1.0', 'Owl 1.0', 'Sapper 1.0', 'Bleach 1.1', 'Mimic 1.0', 'Skimmer 1.0'];

/** A new game's account. */
export function fresh(): Account {
  const programs = STARTING_PROGRAMS.map((p) => ({ ...p }));
  return { sats: 0, programs, loaded: programs.filter((p) => !START_STORED.includes(p.name)).map((p) => p.id), memory: DEFAULT_MEMORY, day: 1, reputation: 0, networks: [newPizzeria(randomSeed())], skimmers: [], news: [], level: 1, xp: 0, skills: [], skillPicks: 0, code: newGameCode(), avatar: { ...DEFAULT_AVATAR }, customIcons: {}, hardware: newHardware(), health: MAX_HEALTH, version: SAVE_VERSION };
}

const SAVE_VERSION = 2;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The programs in memory, in the order the player set. */
export function loadedPrograms(a: Account): Program[] {
  return a.loaded.map((id) => a.programs.find((p) => p.id === id)).filter((p) => p !== undefined);
}

/**
 * Drag and drop in the Software tab: puts a program into memory at a place in the order
 * (or moves it there if it is already loaded), or takes it out of memory when `index` is null.
 * Returns false when it does not fit in memory.
 */
export function placeProgram(a: Account, id: string, index: number | null): boolean {
  const p = a.programs.find((x) => x.id === id);
  if (!p) return false;
  const was = a.loaded.indexOf(id);
  if (index === null) {
    if (was >= 0) a.loaded.splice(was, 1);
    return true;
  }
  if (was < 0 && usedMemory(loadedPrograms(a)) + programSize(p) > a.memory) return false;
  let at = Math.max(0, Math.min(index, a.loaded.length));
  if (was >= 0) {
    a.loaded.splice(was, 1);
    if (was < at) at--;
  }
  a.loaded.splice(at, 0, id);
  return true;
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

export const DEFAULT_AVATAR = { icon: 'hood', color: '#3dff7a' };

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
  if ((a.version ?? 0) < 2) {
    // Before version 2 every load turned scouts into mappers, the new Sparrow too: put it back.
    for (const p of programs) if (p.type === 'scout' && p.name !== 'Sparrow 1.0') p.type = 'mapper';
    for (const p of programs) if (p.type === 'mapper' && p.name === 'Sparrow 1.0') p.type = 'scout';
    const sparrows = a.programs.filter((p) => p.type === 'scout' && p.name === 'Sparrow 1.0');
    for (const extra of sparrows.slice(1)) {
      a.programs = a.programs.filter((p) => p !== extra);
      if (Array.isArray(a.loaded)) a.loaded = a.loaded.filter((id) => id !== extra.id);
    }
    if ((a.project?.type as string) === 'scout') a.project!.type = 'mapper';
  }
  a.version = SAVE_VERSION;
  renameOld(a.programs as { type: string; name: string }[]);
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
  if (typeof a.code !== 'string' || !a.code) a.code = newGameCode();
  if (!a.avatar || typeof a.avatar.icon !== 'string') a.avatar = { ...DEFAULT_AVATAR };
  if (!a.customIcons || typeof a.customIcons !== 'object') a.customIcons = {};
  if (!a.hardware || typeof a.hardware !== 'object') a.hardware = newHardware();
  if (typeof a.health !== 'number') a.health = MAX_HEALTH;
  if (!a.hardware.bought) a.hardware.bought = { day: 0, ids: [] };
  // The first starting chips were renamed to catalogue models.
  const renamed = (id: string) => RENAMED_CHIPS[id] ?? id;
  for (const k of Object.keys(a.hardware.installed) as SocketId[]) a.hardware.installed[k] = renamed(a.hardware.installed[k]!);
  a.hardware.spare = a.hardware.spare.map(renamed);
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
  // Attack programs became warriors you release.
  for (const p of programs) if (p.type === 'attack') p.type = 'warrior';
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
