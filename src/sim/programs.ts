/** A program in the player's deck. */
export const PROGRAM_TYPES = ['attack', 'hide', 'scout', 'scan', 'decrypt'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

/** Placeholder results for programs whose systems don't exist yet. */
export const PROGRAM_STUBS: Record<Exclude<ProgramType, 'scout' | 'scan'>, string> = {
  attack: 'no agent here to attack (agents come later)',
  hide: 'you blend into the normal traffic (hiding comes later)',
  decrypt: 'nothing encrypted here (encryption comes later)',
};

export interface Program {
  /** Unique within the deck. */
  id: string;
  type: ProgramType;
  /** Its own name, like "Hawkeye V2". Programs of one type can have any names. */
  name: string;
  rating: number;
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
