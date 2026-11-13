import type { Rarity } from './development';
import type { NodeKind } from './types';
import { COMPUTE_POINTS, statOf, traitsOf } from './training';
/** A program in the player's deck. */
export const PROGRAM_TYPES = ['warrior', 'shield', 'scout', 'silence', 'deceive', 'hide', 'analyze', 'skimmer', 'scan', 'evaluate', 'identify', 'defuse', 'decrypt', 'scrub', 'forge', 'mask'] as const;

/** Programs used on one data file: evaluate f3, defuse f3, ... */
export const FILE_PROGRAMS = ['evaluate', 'identify', 'defuse', 'decrypt', 'scrub', 'forge'] as const;
export type FileProgram = (typeof FILE_PROGRAMS)[number];
export type ProgramType = (typeof PROGRAM_TYPES)[number];

/** Placeholder results for programs whose systems don't exist yet. */
/** Programs that act on an agent in your node: silence W1, deceive (answers a query). Warriors are released as your own agents. */
export const AGENT_PROGRAMS = ['silence', 'deceive'] as const;
export type AgentProgram = (typeof AGENT_PROGRAMS)[number];

/** Passive programs: they work on their own. */
export const PROGRAM_STUBS: Record<'hide' | 'analyze', string> = {
  hide: 'works on its own: agents roll their detection against it when they query you',
  analyze: 'works on its own: every agent that deals with you gets analyzed',
};

export interface Program {
  /** Unique within the deck. */
  id: string;
  type: ProgramType;
  /** Its own name, like "Hawkeye V2". Programs of one type can have any names. */
  name: string;
  rating: number;
  /** Skimmer: how much of the base daily take it gets (1 = standard, 2 = twice as much). */
  efficiency?: number;
  /** Skimmer: chance per day, in %, that the business finds and removes it (5 is a poor skimmer). */
  detection?: number;
  /** Programs you develop yourself get a rarity and random traits. */
  rarity?: Rarity;
  traits?: string[];
  /** Bugs left in a program you wrote: each one is a drawback until you spend days fixing it. */
  bugs?: string[];
  /** Icon name from its type's pool (game-icons.net); without one, the name picks it. */
  icon?: string;
  /** Colour of the icon (CSS), if the player chose one. */
  color?: string;
  /** A legendary program carries its author's name. */
  author?: string;
  /** Trained models: the Compute put into each category, and the base stats that came out of it. */
  compute?: Record<string, number>;
  stats?: Record<string, number>;
  /** Trained models: how its size came out, times the usual (0.9 to 1.1). */
  sizeRoll?: number;
}

/** Base size (hundredths of a TB) of a rating-2 program of each type (placeholder numbers). */
const BASE_SIZE: Record<ProgramType, number> = {
  warrior: 60, shield: 40, scout: 30, silence: 40, deceive: 50, hide: 40, analyze: 30, skimmer: 30, scan: 30,
  evaluate: 20, identify: 20, defuse: 30, decrypt: 50, scrub: 30, forge: 40, mask: 40,
};

/**
 * Size of a program, in hundredths of a TB (shown as 0.30 TB). Mostly the rating: it grows in step with it (rating 1 is half the base, rating 2
 * the base). Then, for trained models, speed and noise: a lean model is fast and quiet, so the more Compute
 * goes there, the smaller it is (0% on both is 1.5 times an even split, 100% on both half of it).
 */
export function programSize(p: Pick<Program, 'type' | 'rating' | 'compute' | 'sizeRoll'>): number {
  const lean = p.compute && ('speed' in p.compute || 'noise' in p.compute) ? 1.5 - ((p.compute.speed ?? 0) + (p.compute.noise ?? 0)) / COMPUTE_POINTS : 1;
  return Math.max(1, Math.round(BASE_SIZE[p.type] * 0.5 * p.rating * lean * (p.sizeRoll ?? 1)));
}

/** Memory as shown: hundredths of a TB, e.g. 30 is "0.30 TB". */
export function tb(units: number): string {
  return `${(units / 100).toFixed(2)} TB`;
}

/** Memory taken by a set of programs. */
export function usedMemory(list: Pick<Program, 'type' | 'rating'>[]): number {
  return list.reduce((sum, p) => sum + programSize(p), 0);
}

/** Scout: each instance after the first adds this share of the cooldown (placeholder: +45%). */
export const SCOUT_EXTRA_PER_INSTANCE = 0.45;

type Scout = Pick<Program, 'type' | 'rating' | 'stats' | 'traits'>;

/** Ticks of cooldown after sending `instances` scouts at once. */
export function scoutCooldown(p: Scout, instances: number): number {
  const extra = Math.min(SCOUT_EXTRA_PER_INSTANCE, ...traitsOf(p).map((t) => t.extraPerInstance ?? SCOUT_EXTRA_PER_INSTANCE));
  return Math.round(statOf(p, 'cooldown') * 10 * (1 + extra * Math.max(0, instances - 1)));
}

/** A scout's d100 chance to tell what a node of this kind is. */
export function scoutChance(p: Scout, kind?: NodeKind): number {
  if (kind && traitsOf(p).some((t) => t.sure?.includes(kind))) return 100;
  return Math.min(100, statOf(p, 'accuracy'));
}

/** Noise a scout launch makes in your node (nothing reacts to noise yet). */
export function scoutNoise(p: Scout): number {
  return statOf(p, 'noise');
}

/** How fast a scout flies, times the usual agent speed. */
export function scoutSpeed(p: Scout): number {
  return statOf(p, 'speed') || 1;
}
