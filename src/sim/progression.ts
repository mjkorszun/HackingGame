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

/** Letters for a game code (no 0/O or 1/I, so it is easy to read and type). */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A new game's code: 8 characters. */
export function newGameCode(roll: () => number = Math.random): string {
  return Array.from({ length: 8 }, () => CODE_LETTERS[Math.floor(roll() * CODE_LETTERS.length)]).join('');
}

/** Cleans a typed code: capitals and allowed characters only, 4-16 long; empty string when not valid. */
export function cleanGameCode(text: string): string {
  const c = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= 4 && c.length <= 16 ? c : '';
}

/**
 * The roll for the skill choice at one level: it comes only from the game code and the level,
 * so loading a save and playing the mission again gives exactly the same three skills.
 */
export function levelRoll(code: string, level: number): () => number {
  let s = 2166136261;
  for (const ch of `${code}#${level}`) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Three different skills you don't have yet, to choose from. */
export function skillChoices(owned: string[], roll: () => number = Math.random): Skill[] {
  const pool = SKILLS.filter((s) => !owned.includes(s.id));
  const out: Skill[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  return out;
}
