/**
 * Experience, levels and skills. Level 2 costs 200 XP, every next level 100 more (300, 400...).
 * On each level up you pick one of three skills. Skills have no effect yet.
 */

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return 200 + 100 * (level - 1);
}

/** Adds XP: returns the new level, the XP into it, and how many levels were gained. */
export function addXp(level: number, xp: number, gained: number): { level: number; xp: number; levelsUp: number } {
  let l = level;
  let x = xp + gained;
  while (x >= xpToNext(l)) {
    x -= xpToNext(l);
    l++;
  }
  return { level: l, xp: x, levelsUp: l - level };
}

export interface Skill {
  id: string;
  name: string;
  /** What it will do (not built yet). */
  text: string;
}

/** Skills you can learn (placeholder list, no effects yet). */
export const SKILLS: Skill[] = [
  { id: 'coder', name: 'Coder', text: 'software development takes fewer days' },
  { id: 'debugger', name: 'Debugger', text: 'fewer bugs while developing' },
  { id: 'craftsman', name: 'Craftsman', text: 'better odds of a rare program' },
  { id: 'ghost', name: 'Ghost', text: 'agents notice you less' },
  { id: 'smooth', name: 'Smooth Talker', text: 'deceive works more often' },
  { id: 'gunner', name: 'Gunner', text: 'attack programs hit harder' },
  { id: 'iron', name: 'Iron Will', text: 'more integrity' },
  { id: 'cracker', name: 'Cracker', text: 'decrypt cracks seals faster' },
  { id: 'appraiser', name: 'Appraiser', text: 'files sell for more' },
  { id: 'cartographer', name: 'Cartographer', text: 'scout sees further' },
  { id: 'speedreader', name: 'Speed Reader', text: 'scanning files is faster' },
  { id: 'analyst', name: 'Analyst', text: 'analyze reads agents more often' },
  { id: 'cool', name: 'Cool Head', text: 'the alarm calms down sooner' },
  { id: 'fixer', name: 'Fixer', text: 'contracts pay more' },
  { id: 'skimmer', name: 'Skimmer Artist', text: 'skimmers are found less often' },
  { id: 'overclock', name: 'Overclocker', text: 'programs run faster' },
];

/** Three different skills you don't have yet, to choose from. */
export function skillChoices(owned: string[], roll: () => number = Math.random): Skill[] {
  const pool = SKILLS.filter((s) => !owned.includes(s.id));
  const out: Skill[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  return out;
}
