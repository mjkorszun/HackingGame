/**
 * Your health: jacking in through the spinal cord can hurt your brain. Leaving the net badly hurt
 * costs health, being thrown out costs more, and at zero health you die (game over). Resting at
 * your base heals, at the cost of days. All numbers are placeholders.
 */

export const MAX_HEALTH = 100;
/** Health you get back for every day of rest. */
export const REST_PER_DAY = 5;

/**
 * Health lost on leaving the net. Leaving on your own costs nothing above half integrity,
 * 5 below half, 10 below a quarter and 20 below a tenth. Being thrown out costs 20-30.
 */
export function exitDamage(integrity: number, maxIntegrity: number, kicked: boolean, roll: () => number = Math.random): number {
  if (kicked) return 20 + Math.floor(roll() * 11);
  const frac = integrity / maxIntegrity;
  if (frac < 0.1) return 20;
  if (frac < 0.25) return 10;
  if (frac < 0.5) return 5;
  return 0;
}

/** Days of rest it takes to heal fully. */
export function daysToHeal(health: number): number {
  return Math.ceil(Math.max(0, MAX_HEALTH - health) / REST_PER_DAY);
}
