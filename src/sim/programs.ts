import type { Rarity } from './development';
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
}

/** Base size in GB of a rating-1 program of each type (placeholder numbers). */
const BASE_SIZE: Record<ProgramType, number> = {
  warrior: 60, shield: 40, scout: 30, silence: 40, deceive: 50, hide: 40, analyze: 30, skimmer: 30, scan: 30,
  evaluate: 20, identify: 20, defuse: 30, decrypt: 50, scrub: 30, forge: 40, mask: 40,
};

/** Size of a program in GB: bigger for higher ratings. */
export function programSize(p: Pick<Program, 'type' | 'rating'>): number {
  return Math.round(BASE_SIZE[p.type] * (1 + 0.5 * (p.rating - 1)));
}

/** GB taken by a set of programs. */
export function usedMemory(list: Pick<Program, 'type' | 'rating'>[]): number {
  return list.reduce((sum, p) => sum + programSize(p), 0);
}

/** Scout: seconds before it can fly again, for one instance (placeholder). Better scouts will trade a longer wait for more skill. */
export const SCOUT_COOLDOWN_S = 30;
/** Scout: each instance after the first adds this share of the cooldown (placeholder: +45%). */
export const SCOUT_EXTRA_PER_INSTANCE = 0.45;
/** Placeholder: noise a scout launch makes in your node. Nothing reacts to noise yet. */
export const SCOUT_NOISE = 30;

/** Ticks of cooldown after sending `instances` scouts at once. */
export function scoutCooldown(instances: number): number {
  return Math.round(SCOUT_COOLDOWN_S * 10 * (1 + SCOUT_EXTRA_PER_INSTANCE * Math.max(0, instances - 1)));
}

/** A scout's d100 chance to tell what a node is (placeholder: rating 1 = 50%, +15 per rating). */
export function scoutChance(rating: number): number {
  return Math.min(100, 35 + 15 * rating);
}
