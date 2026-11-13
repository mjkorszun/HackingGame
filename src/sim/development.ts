/**
 * Software development on the main screen: you write your own programs. Every project costs a fixed
 * number of days. A finished program gets a rarity and random traits, and may come out with up to two
 * bugs: you can use it as it is, or spend days fixing each bug later.
 * All numbers here are placeholders. Traits and bugs have no effect in the net yet.
 */
import type { Program, ProgramType } from './programs';
import { rollStats, rollTypeTraits } from './training';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Traits each rarity gets: common 0, uncommon 1, rare 2, epic 3, legendary 4 (plus the author's name). */
export const RARITY_TRAITS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** Chance of each rarity in %, rolled when a program is finished (placeholder). */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

/** The pool traits are drawn from (placeholder; none of them works yet). */
export const TRAIT_POOL = [
  '-15% size',
  '-20% run time',
  'makes less noise',
  '+10% against resistance',
  'one failed roll per run is rolled again',
  '-15% CPU use',
  '+25% on its first use in a node',
  '+15% when you have not moved for 5 s',
  'no noise on its first use in a node',
  '-20% chance to crash',
  'starts 0.5 s sooner',
  '10% chance to run twice',
] as const;

/** Highest rating you can develop for now (later: skill and hardware). */
export const MAX_DEV_RATING = 5;

/** Most bugs a finished program can have. */
export const MAX_BUGS = 2;

/** Chance in % of each possible bug when a program is finished (placeholder; later: complexity and your skills). */
export const BUG_CHANCE = 35;

/** The drawbacks a bug can bring (placeholder; none of them works yet). */
export const BUG_POOL = [
  'unstable: 10% chance to crash when run',
  'sloppy: -10% on its rolls',
  'slow: +30% run time',
  'leaky: makes more noise',
  'bloated: +20% size',
  'flaky: 10% chance to do nothing',
] as const;

/** Days it takes to fix one bug (placeholder: 1 + rating). */
export function bugFixDays(p: Pick<Program, 'rating'>): number {
  return 1 + p.rating;
}

/** Up to MAX_BUGS different bugs for a newly finished program. */
export function rollBugs(roll: () => number = Math.random): string[] {
  const pool: string[] = [...BUG_POOL];
  const out: string[] = [];
  for (let i = 0; i < MAX_BUGS; i++) if (roll() * 100 < BUG_CHANCE) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  return out;
}

/** Fixes one bug of a program. Returns false if there is no such bug. */
export function fixBug(p: Program, index: number): boolean {
  if (!p.bugs || index < 0 || index >= p.bugs.length) return false;
  p.bugs.splice(index, 1);
  if (!p.bugs.length) delete p.bugs;
  return true;
}

export interface DevProject {
  type: ProgramType;
  rating: number;
  name: string;
  /** Days of work still needed. */
  daysLeft: number;
  /** Days already worked. */
  daysSpent: number;
  /** Old saves only: bugs used to push the end back during work. */
  bugs?: number;
  /** Icon and its colour the finished program will have (chosen by the player). */
  icon?: string;
  color?: string;
  /** Train Model: the Compute spread over the program's categories. */
  compute?: Record<string, number>;
}

/** Days of work a new program needs (placeholder: 3 a rating point). */
export function devDays(rating: number): number {
  return 3 * rating;
}

export function newProject(type: ProgramType, rating: number, name: string): DevProject {
  return { type, rating, name, daysLeft: devDays(rating), daysSpent: 0 };
}

/** What a stretch of work did. */
export interface WorkResult {
  days: number;
  done: boolean;
}

/** Works on the project for up to `days` days; it stops early when the project is done. */
export function work(p: DevProject, days: number): WorkResult {
  const result: WorkResult = { days: 0, done: false };
  for (let i = 0; i < days && p.daysLeft > 0; i++) {
    p.daysLeft--;
    p.daysSpent++;
    result.days++;
  }
  result.done = p.daysLeft === 0;
  return result;
}

export function rollRarity(roll: () => number = Math.random): Rarity {
  let r = roll() * 100;
  for (const rarity of RARITIES) {
    r -= RARITY_WEIGHTS[rarity];
    if (r < 0) return rarity;
  }
  return 'common';
}

/** Different traits drawn from the pool. */
export function rollTraits(count: number, roll: () => number = Math.random): string[] {
  const pool: string[] = [...TRAIT_POOL];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  return out;
}

/** Turns a finished project into a program with a rolled rarity and traits. */
export function finishProgram(p: DevProject, id: string, author: string, roll: () => number = Math.random): Program {
  const rarity = rollRarity(roll);
  const program: Program = { id, type: p.type, name: p.name, rating: p.rating, rarity, traits: rollTypeTraits(p.type, RARITY_TRAITS[rarity], TRAIT_POOL, roll) };
  if (p.compute) {
    program.compute = { ...p.compute };
    program.stats = rollStats(p.type, p.compute, p.rating, roll);
  }
  if (rarity === 'legendary') program.author = author;
  const bugs = rollBugs(roll);
  if (bugs.length) program.bugs = bugs;
  if (p.type === 'skimmer') {
    program.efficiency = 1;
    program.detection = 2;
  }
  return program;
}
