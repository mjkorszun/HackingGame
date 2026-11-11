/** A program in the player's deck. */
export const PROGRAM_TYPES = ['attack', 'silence', 'deceive', 'hide', 'analyze', 'skimmer', 'scout', 'scan', 'evaluate', 'identify', 'defuse', 'decrypt', 'scrub', 'forge'] as const;

/** Programs used on one data file: evaluate f3, defuse f3, ... */
export const FILE_PROGRAMS = ['evaluate', 'identify', 'defuse', 'decrypt', 'scrub', 'forge'] as const;
export type FileProgram = (typeof FILE_PROGRAMS)[number];
export type ProgramType = (typeof PROGRAM_TYPES)[number];

/** Placeholder results for programs whose systems don't exist yet. */
/** Programs that act on an agent in your node: attack W1, silence W1, deceive (answers a query). */
export const AGENT_PROGRAMS = ['attack', 'silence', 'deceive'] as const;
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
}

/** How long the scout's eyes take to reach the next ring of nodes. */
export const SCOUT_HOP_TICKS = 15;

/** Placeholder: noise Scout makes in the node it runs from. Nothing reacts to noise yet. */
export const SCOUT_NOISE = 40;

/**
 * Scout's d100 chances against a system's encryption.
 * identify: chance to identify each hidden node it reaches.
 * extend: chance to look one more link further after each hop. Only a strong
 * program gets this: a very high rating in a weakly encrypted system can see the whole map.
 */
export function scoutChances(rating: number, encryption: number): { identify: number; extend: number } {
  const e = Math.max(1, encryption);
  // Identifying a node next to you is easy; looking further is hard.
  const identify = (100 * rating) / (rating + e / SCOUT_EASE);
  const extend = (100 * rating) / (rating + e * SCOUT_EASE);
  return { identify, extend };
}

/** Scout 3 vs encryption 2: 90% to identify, 20% to look one link further. */
const SCOUT_EASE = 6;
