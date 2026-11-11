/**
 * Software development on the main screen: you write your own programs. Every project costs days;
 * a bug found on a day of work pushes the end back. A finished program gets a rarity and random traits.
 * All numbers here are placeholders. Traits have no effect yet.
 */
import type { Program, ProgramType } from './programs';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Traits each rarity gets: common 0, uncommon 1, rare 2, epic 3, legendary 4 (plus the author's name). */
export const RARITY_TRAITS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** Chance of each rarity in %, rolled when a program is finished (placeholder). */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

/** The pool traits are drawn from (placeholder; none of them works yet). */
export const TRAIT_POOL = [
  'compact: -15% size',
  'quick: -20% run time',
  'quiet: makes less noise',
  'stubborn: +10% against resistance',
  'lucky: one failed roll per run is rolled again',
  'lean: -15% CPU use',
  'first strike: +25% on its first use in a node',
  'patient: +15% when you have not moved for 5 s',
  'ghostly: no noise on its first use in a node',
  'sturdy: -20% chance to crash',
  'eager: starts 0.5 s sooner',
  'echo: 10% chance to run twice',
] as const;

/** Highest rating you can develop for now (later: skill and hardware). */
export const MAX_DEV_RATING = 5;

/** Chance in % that a day of work finds a bug. */
export const BUG_CHANCE = 10;

export interface DevProject {
  type: ProgramType;
  rating: number;
  name: string;
  /** Days of work still needed. */
  daysLeft: number;
  /** Days already worked. */
  daysSpent: number;
  bugs: number;
  /** Icon the finished program will have (picked by the UI). */
  icon?: string;
}

/** Days of work a new program needs (placeholder: 3 a rating point). */
export function devDays(rating: number): number {
  return 3 * rating;
}

export function newProject(type: ProgramType, rating: number, name: string): DevProject {
  return { type, rating, name, daysLeft: devDays(rating), daysSpent: 0, bugs: 0 };
}

/** What a stretch of work did. */
export interface WorkResult {
  days: number;
  /** Days each bug added, in order. */
  bugs: number[];
  done: boolean;
}

/**
 * Works on the project for up to `days` days. Each day may find a bug that adds 1-3 days.
 * Work stops early only when the project is done.
 */
export function work(p: DevProject, days: number, roll: () => number = Math.random): WorkResult {
  const result: WorkResult = { days: 0, bugs: [], done: false };
  for (let i = 0; i < days && p.daysLeft > 0; i++) {
    p.daysLeft--;
    p.daysSpent++;
    result.days++;
    if (roll() * 100 < BUG_CHANCE) {
      const extra = 1 + Math.floor(roll() * 3);
      p.daysLeft += extra;
      p.bugs++;
      result.bugs.push(extra);
    }
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
  const program: Program = { id, type: p.type, name: p.name, rating: p.rating, rarity, traits: rollTraits(RARITY_TRAITS[rarity], roll) };
  if (rarity === 'legendary') program.author = author;
  if (p.type === 'skimmer') {
    program.efficiency = 1;
    program.detection = 2;
  }
  return program;
}
