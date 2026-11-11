/** AI agents that defend a system. For now one kind: the warrior. */

/** How an agent moves around its system. Only roam is built so far. */
export type AgentAi = 'roam' | 'guard-entry' | 'path' | 'defend' | 'zone';

/**
 * Warrior archetypes: decide stats and colour. Each system gives every archetype it uses a name
 * drawn from WARRIOR_NAMES, so a heavy warrior may be a "knight" in one system and a "rocket" in another.
 * Agents of one type share their stats, so analyzing one reveals the others.
 */
export type WarriorType = 'balanced' | 'watchful' | 'heavy';

/** Military names for warrior types, drawn when a system is created. */
export const WARRIOR_NAMES = [
  'musketeer', 'ranger', 'guardian', 'tank', 'knight', 'rocket', 'hussar', 'grenadier', 'sentinel', 'dragoon',
  'lancer', 'sniper', 'cuirassier', 'legionnaire', 'centurion', 'trooper', 'marine', 'commando', 'gunner', 'sapper',
  'scout', 'warden', 'paladin', 'halberdier', 'pikeman', 'cavalier', 'mortar', 'howitzer', 'artillery', 'bombardier',
  'corsair', 'praetorian', 'janissary', 'samurai', 'ronin', 'spartan', 'hoplite', 'templar', 'crusader', 'vanguard',
];

/** Names for the warrior types a system uses: distinct, and the same every time for the same seed. */
export function typeNames(seedText: string, types: WarriorType[]): Map<WarriorType, string> {
  let s = 7;
  for (const ch of seedText) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...WARRIOR_NAMES];
  const out = new Map<WarriorType, string>();
  for (const t of types) {
    if (out.has(t)) continue;
    s = (s * 1664525 + 1013904223) >>> 0;
    out.set(t, pool.splice(Math.floor((s / 2 ** 32) * pool.length), 1)[0]);
  }
  return out;
}

export interface AgentStats {
  kind: 'warrior';
  /** Which type of warrior: decides its stats and colour. */
  type: WarriorType;
  /** Detection: rolled against the player's hide when it queries. */
  detection: number;
  /** Ticks between query attempts while it shares a node with the player. */
  queryEvery: number;
  /** Damage of one hit on the player's integrity. */
  damage: number;
  /** Ticks between hits. */
  attackEvery: number;
  /** How hard it is to hit. */
  armor: number;
  hp: number;
  silenceResist: number;
  deceiveResist: number;
  /** Resistance to the player's passive Analyze. */
  scanResist: number;
  /** Ticks it stays in a node before moving on: min and max. */
  stay: [number, number];
  /** Ticks for one hop along a link. */
  hopTicks: number;
  ai: AgentAi;
  /** Can leave its system for a linked one (rare). Not used yet. */
  crossSystem?: boolean;
}

/** Placeholder warrior: detection 3, query every 3 s, hits 4 every 2 s (DPS 2), armour 2, 30 HP. */
export const WARRIOR: AgentStats = {
  kind: 'warrior',
  type: 'balanced',
  detection: 3,
  queryEvery: 30,
  damage: 4,
  attackEvery: 20,
  armor: 2,
  hp: 30,
  silenceResist: 2,
  deceiveResist: 2,
  scanResist: 2,
  stay: [50, 100],
  hopTicks: 15,
  ai: 'roam',
};

/**
 * Three archetypes of warrior (placeholder numbers):
 * balanced; watchful but fragile (asks often, easy to kill, hard to fool);
 * heavy gun (rarely asks, hits hard, tough, hard to silence, easy to fool).
 */
export const WARRIORS: Record<WarriorType, AgentStats> = {
  balanced: WARRIOR,
  watchful: { ...WARRIOR, type: 'watchful', detection: 4, queryEvery: 20, damage: 3, attackEvery: 20, armor: 1, hp: 20, silenceResist: 1, deceiveResist: 3, scanResist: 1, stay: [40, 80] },
  heavy: { ...WARRIOR, type: 'heavy', detection: 2, queryEvery: 60, damage: 8, attackEvery: 30, armor: 4, hp: 60, silenceResist: 4, deceiveResist: 1, scanResist: 3, stay: [80, 140], hopTicks: 20 },
};

/** A code name like Decker's: two letters, a dash, three digits (KX-271). Same seed, same name. */
export function codeName(seedText: string): string {
  let s = 0;
  for (const ch of seedText) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const L = 'ABCDEFGHJKLMNPRSTVWXZ';
  return `${L[Math.floor(next() * L.length)]}${L[Math.floor(next() * L.length)]}-${100 + Math.floor(next() * 900)}`;
}

/** How much the player's Analyze revealed about an agent. */
export type Knowledge = 'none' | 'partial' | 'full';

export interface Agent {
  id: string;
  /** Its type's name in this system (e.g. knight). */
  typeName: string;
  /** Short name used in the console: W1, W2... */
  name: string;
  stats: AgentStats;
  hp: number;
  /** Node it is in, or the node it is leaving while on a link. */
  node: string;
  /** Hop in progress. */
  hop: { to: string; elapsed: number } | null;
  stayLeft: number;
  queryLeft: number;
  attackLeft: number;
  /** patrol: going about its job. trusting: fooled until the player leaves its node. hostile: knows you are an enemy. */
  mood: 'patrol' | 'trusting' | 'hostile';
  /** Unanswered or failed queries in this encounter (the second one makes it hostile). */
  strikes: number;
  /** Silenced: its messages cannot leave the node, so it raises no alarm. */
  silenced: boolean;
  known: Knowledge;
}

/** Ticks per second, for showing intervals. */
const TPS = 10;

export function dps(s: AgentStats): number {
  return Math.round((s.damage / (s.attackEvery / TPS)) * 10) / 10;
}

/** Lines describing an agent, as far as the player's Analyze revealed it. */
export function agentInfo(a: Agent): string[] {
  const s = a.stats;
  const lines = [`${a.name}: ${a.typeName} (${s.kind})`];
  if (a.known === 'none') return [...lines, 'not analyzed: stats unknown'];
  lines.push(`HP ${a.hp}/${s.hp}   hits ${s.damage} every ${s.attackEvery / TPS} s (DPS ${dps(s)})`);
  if (a.known === 'partial') return [...lines, 'partly analyzed'];
  lines.push(`armour ${s.armor}   detection ${s.detection}   queries every ${s.queryEvery / TPS} s`);
  lines.push(`resists: silence ${s.silenceResist}, deceive ${s.deceiveResist}, analyze ${s.scanResist}`);
  lines.push(`AI: ${s.ai}`);
  return lines;
}

/** d100 chance for rating r against resistance d: 100r/(r+d). */
export function versus(r: number, d: number): number {
  return (100 * r) / (r + Math.max(0.01, d));
}

/** Words for odds, as agreed: none, minimal, very low, low, medium, high, very high, almost certain, certain. */
export function oddsWord(chance: number): string {
  const c = Math.round(chance);
  if (c <= 0) return 'none';
  if (c < 10) return 'minimal';
  if (c < 20) return 'very low';
  if (c < 40) return 'low';
  if (c < 60) return 'medium';
  if (c < 80) return 'high';
  if (c < 96) return 'very high';
  if (c < 100) return 'almost certain';
  return 'certain';
}
