/** A program in the player's deck. */
export interface Program {
  id: string;
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
  const identify = (100 * rating) / (rating + Math.max(1, encryption));
  const extend = Math.max(0, (identify - 50) * 2);
  return { identify, extend };
}
