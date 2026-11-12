/**
 * AI agents in a system. Security agents defend it: fighters, inspectors that only check you, and
 * sentries that sit in one node and guard its data. Workers are not security at all: they do the business's work.
 */

/** How an agent moves around its system: roam at random, stay in one node, or shuttle along a fixed route. */
export type AgentAi = 'roam' | 'stationary' | 'path' | 'guard-entry' | 'defend' | 'zone';

/** What an agent is for. */
export type AgentRole = 'fighter' | 'inspector' | 'sentry' | 'worker';

/** How a role reads in the game. */
export const ROLE_LABEL: Record<AgentRole, string> = {
  fighter: 'security agent, fighter',
  inspector: 'security agent, inspector: checks you, does not fight',
  sentry: 'security agent, sentry: stays here and checks who touches the data',
  worker: 'worker: does the business work, not security',
};

/**
 * Warrior archetypes: decide stats and colour. Each system gives every archetype it uses a kind drawn from
 * KINDS: an icon first, then one of the names that fit that icon (a battle axe makes an axeman, a barbarian...).
 * So a heavy warrior may be a "barbarian" in one system and a "rocketeer" in another.
 * Agents of one type share their stats, so analyzing one reveals the others.
 */
export type WarriorType = 'balanced' | 'watchful' | 'heavy' | 'inspector' | 'sentry' | 'worker';

/** An icon (game-icons.net name) and the names that suit it. */
export interface KindPick {
  icon: string;
  names: string[];
}

/** Icons for each role, each with names that match the picture. */
export const KINDS: Record<AgentRole, KindPick[]> = {
  fighter: [
    { icon: 'broadsword', names: ['knight', 'swordsman', 'paladin', 'templar', 'crusader', 'champion', 'squire', 'baron', 'warlord', 'vassal', 'liege', 'lancer'] },
    { icon: 'katana', names: ['samurai', 'ronin', 'kensei', 'shogun', 'daimyo', 'hatamoto', 'bushi', 'yojimbo', 'iaido master', 'shinobi', 'sensei'] },
    { icon: 'daggers', names: ['assassin', 'cutthroat', 'rogue', 'thief', 'stalker', 'shiv', 'backstabber', 'nightblade', 'footpad', 'cutpurse', 'knifeman', 'shadow'] },
    { icon: 'energy-sword', names: ['blademaster', 'arc knight', 'duelist', 'photon knight', 'ion blade', 'plasma duelist', 'beam saber', 'neon knight', 'volt fencer', 'laser blade'] },
    { icon: 'battle-axe', names: ['axeman', 'barbarian', 'berserker', 'viking', 'raider', 'jarl', 'huscarl', 'marauder', 'reaver', 'headsman', 'woodsman'] },
    { icon: 'flying-dagger', names: ['knife thrower', 'skirmisher', 'dartman', 'slinger', 'javelineer', 'harrier', 'quickblade', 'throwing ace', 'needle', 'flinger'] },
    { icon: 'lightning-saber', names: ['stormblade', 'arc duelist', 'thunderer', 'tempest', 'spark knight', 'shocktrooper', 'storm knight', 'voltblade', 'static duelist', 'surge fencer'] },
    { icon: 'crossed-swords', names: ['legionnaire', 'gladiator', 'centurion', 'praetorian', 'hoplite', 'spartan', 'myrmidon', 'decurion', 'optio', 'retiarius', 'murmillo'] },
    { icon: 'fist', names: ['brawler', 'bruiser', 'pugilist', 'boxer', 'thug', 'heavyweight', 'slugger', 'knuckler', 'grappler', 'street fighter', 'enforcer'] },
    { icon: 'crescent-blade', names: ['reaper', 'harvester', 'scythe', 'deathblade', 'crescent knight', 'moonblade', 'grim warden', 'soul taker', 'sickleman', 'nightreaper'] },
    { icon: 'ak47', names: ['trooper', 'rifleman', 'insurgent', 'partisan', 'guerrilla', 'militiaman', 'fusilier', 'infantryman', 'commando', 'soldier', 'recruit'] },
    { icon: 'winchester-rifle', names: ['ranger', 'marksman', 'sniper', 'sharpshooter', 'deadeye', 'frontiersman', 'longshot', 'hunter', 'tracker', 'rifle scout'] },
    { icon: 'uzi', names: ['gunner', 'spray gunner', 'hitman', 'gangster', 'mobster', 'wheelman', 'hoodlum', 'triggerman', 'henchman', 'goon'] },
    { icon: 'revolver', names: ['gunslinger', 'sheriff', 'outlaw', 'deputy', 'bandit', 'desperado', 'cowboy', 'bounty hunter', 'lawman', 'pistolero', 'drifter'] },
    { icon: 'machine-gun', names: ['heavy gunner', 'suppressor', 'minigunner', 'autogunner', 'gatling', 'rattler', 'hailstorm', 'ripper', 'chaingunner', 'shredder'] },
    { icon: 'grenade', names: ['grenadier', 'bombardier', 'sapper', 'demolisher', 'blaster', 'pyro', 'bomber', 'miner', 'breacher', 'detonator', 'boomer'] },
    { icon: 'rocket', names: ['rocket', 'rocketeer', 'skyburner', 'jetblast', 'comet', 'firebird', 'starbolt', 'thruster', 'flare', 'meteor', 'afterburner'] },
    { icon: 'missile-launcher', names: ['artillery', 'howitzer', 'mortar', 'launcher', 'siegebreaker', 'cannoneer', 'battery', 'bazooka', 'barrage', 'salvo', 'warhead'] },
  ],
  inspector: [
    { icon: 'police-badge', names: ['inspector', 'marshal', 'officer', 'constable', 'patrolman', 'detective', 'lieutenant', 'agent', 'cop', 'commissioner', 'sergeant'] },
    { icon: 'checklist', names: ['auditor', 'assessor', 'checker', 'reviewer', 'compliance officer', 'tallyman', 'bookkeeper', 'accountant', 'validator', 'scorer', 'actuary'] },
    { icon: 'magnifying-glass', names: ['examiner', 'investigator', 'sleuth', 'tracer', 'seeker', 'prober', 'scrutineer', 'analyst', 'snoop', 'gumshoe', 'observer'] },
    { icon: 'stamper', names: ['controller', 'verifier', 'notary', 'registrar', 'certifier', 'licenser', 'approver', 'stampman', 'permit clerk', 'bureaucrat', 'official'] },
  ],
  sentry: [
    { icon: 'guards', names: ['sentry', 'watchman', 'guard', 'sentinel', 'picket', 'lookout', 'patrol', 'warder', 'garrison', 'nightwatch', 'vigil'] },
    { icon: 'visored-helm', names: ['warden', 'custodian', 'keeper', 'protector', 'defender', 'bastion', 'bulwark', 'ironhelm', 'aegis', 'shieldman', 'castellan'] },
    { icon: 'closed-doors', names: ['doorkeeper', 'porter', 'concierge', 'doorman', 'usher', 'threshold', 'hallkeeper', 'gatehouse', 'bouncer', 'doorwarden'] },
    { icon: 'padlock', names: ['lockkeeper', 'gatekeeper', 'locksmith', 'turnkey', 'jailer', 'vaultkeeper', 'bolt', 'latch', 'keyholder', 'deadbolt', 'sealer'] },
  ],
  worker: [
    { icon: 'cardboard-box', names: ['courier', 'packer', 'shipper', 'parcel hand', 'stocker', 'sorter', 'mover', 'handler', 'bundler', 'wrapper', 'picker'] },
    { icon: 'papers', names: ['clerk', 'dispatcher', 'secretary', 'typist', 'filer', 'archivist', 'scribe', 'copyist', 'recorder', 'paperpusher', 'assistant'] },
    { icon: 'envelope', names: ['messenger', 'runner', 'postman', 'mailer', 'carrier pigeon', 'herald', 'dispatch rider', 'letterman', 'envoy', 'page', 'post boy'] },
    { icon: 'cargo-crate', names: ['carrier', 'loader', 'stevedore', 'dockhand', 'freighter', 'hauler', 'lifter', 'crate hand', 'forklift', 'teamster', 'lugger'] },
  ],
};

/** The kind (name and icon) of each agent type a system uses: distinct, and the same every time for the same seed. */
export function typeKinds(seedText: string, types: WarriorType[]): Map<WarriorType, { name: string; icon: string }> {
  let s = 7;
  for (const ch of seedText) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const pools: Record<AgentRole, KindPick[]> = { fighter: [...KINDS.fighter], inspector: [...KINDS.inspector], sentry: [...KINDS.sentry], worker: [...KINDS.worker] };
  const out = new Map<WarriorType, { name: string; icon: string }>();
  for (const t of types) {
    if (out.has(t)) continue;
    const pool = pools[WARRIORS[t].role];
    const pick = pool.splice(Math.floor(next() * pool.length), 1)[0];
    out.set(t, { icon: pick.icon, name: pick.names[Math.floor(next() * pick.names.length)] });
  }
  return out;
}

export interface AgentStats {
  role: AgentRole;
  /** Which type of agent: decides its stats and colour. */
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
  role: 'fighter',
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
  // Placeholder numbers. An inspector only checks: it asks often and sees well, but never hits you;
  // when it finds you out it raises the alarm and the fighters come.
  inspector: { ...WARRIOR, role: 'inspector', type: 'inspector', detection: 5, queryEvery: 15, damage: 0, attackEvery: 20, armor: 1, hp: 15, silenceResist: 1, deceiveResist: 3, scanResist: 1, stay: [30, 70] },
  // A sentry never leaves its node. It checks whoever works with the data there, and it can fight.
  sentry: { ...WARRIOR, role: 'sentry', type: 'sentry', detection: 4, queryEvery: 100_000, damage: 5, attackEvery: 20, armor: 3, hp: 40, silenceResist: 3, deceiveResist: 2, scanResist: 2, stay: [100_000, 100_000], ai: 'stationary' },
  // A worker carries the business's data along its route. It does not check anyone and does not fight.
  worker: { ...WARRIOR, role: 'worker', type: 'worker', detection: 0, queryEvery: 100_000, damage: 0, attackEvery: 20, armor: 0, hp: 10, silenceResist: 0, deceiveResist: 0, scanResist: 0, stay: [20, 40], hopTicks: 20, ai: 'path' },
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
  /** Its type's icon in this system (matches the name). */
  typeIcon: string;
  /** Short name used in the console: W1, W2... */
  name: string;
  stats: AgentStats;
  /** A worker's fixed route (node ids), walked back and forth. */
  route?: string[];
  /** Walking its route backwards. */
  routeBack?: boolean;
  /** The stop on its route it is heading for (index into route). */
  routeStop?: number;
  hp: number;
  /** Node it is in, or the node it is leaving while on a link. */
  node: string;
  /**
   * Hop in progress: the first LEAVE_TICKS it walks to the link's end in its node, then it crosses the link.
   * total = LEAVE_TICKS + the crossing.
   */
  hop: { to: string; elapsed: number; total: number } | null;
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

/** Placeholder: an agent takes 1.125 s to walk to the link before it crosses it. */
export const LEAVE_TICKS = 11.25;

/** Placeholder: an agent chasing you crosses a link in 0.5 s, so with the walk to the link it takes 1.25 s a node (you take 1 s). */
export const CHASE_HOP_TICKS = 5;

/** Ticks per second, for showing intervals. */
const TPS = 10;

export function dps(s: AgentStats): number {
  return Math.round((s.damage / (s.attackEvery / TPS)) * 10) / 10;
}

/** Lines describing an agent, as far as the player's Analyze revealed it. */
export function agentInfo(a: Agent): string[] {
  const s = a.stats;
  const lines = [`${a.name}: ${a.typeName}`, ROLE_LABEL[s.role]];
  if (a.known === 'none') return [...lines, 'not analyzed: stats unknown'];
  lines.push(`HP ${a.hp}/${s.hp}   ${s.damage ? `hits ${s.damage} every ${s.attackEvery / TPS} s (DPS ${dps(s)})` : 'does not fight'}`);
  if (a.known === 'partial') return [...lines, 'partly analyzed'];
  const asks = s.role === 'worker' ? 'never checks you' : s.role === 'sentry' ? 'checks you when you touch data here' : `queries every ${s.queryEvery / TPS} s`;
  lines.push(`armour ${s.armor}   detection ${s.detection}   ${asks}`);
  lines.push(`resists: silence ${s.silenceResist}, deceive ${s.deceiveResist}, analyze ${s.scanResist}`);
  lines.push(`AI: ${s.ai}`);
  return lines;
}

/** A role in a few words, for one-line lists. */
export const ROLE_SHORT: Record<AgentRole, string> = {
  fighter: 'fighter',
  inspector: 'inspector',
  sentry: 'sentry',
  worker: 'worker',
};

/**
 * Everything about a kind of agent, as far as your Analyze read it: what is not known yet says "unknown".
 * Partly analyzed shows its health and attack; fully analyzed shows everything.
 */
export function kindInfo(typeName: string, s: AgentStats, known: Knowledge): { label: string; value: string }[] {
  const part = known !== 'none';
  const full = known === 'full';
  const u = 'unknown';
  const asks = s.role === 'worker' ? 'never checks you' : s.role === 'sentry' ? 'when you touch data in its node' : `every ${s.queryEvery / TPS} s`;
  return [
    { label: 'kind', value: `${typeName}, ${ROLE_LABEL[s.role]}` },
    { label: 'analyzed', value: full ? 'fully' : part ? 'partly' : 'not yet' },
    { label: 'HP', value: part ? String(s.hp) : u },
    { label: 'attack', value: part ? (s.damage ? `${s.damage} every ${s.attackEvery / TPS} s (DPS ${dps(s)})` : 'does not fight') : u },
    { label: 'armour', value: full ? String(s.armor) : u },
    { label: 'detection', value: full ? String(s.detection) : u },
    { label: 'checks you', value: full ? asks : u },
    { label: 'speed', value: full ? (s.ai === 'stationary' ? 'never leaves its node' : `crosses a link in ${s.hopTicks / TPS} s`) : u },
    { label: 'resists', value: full ? `silence ${s.silenceResist}, deceive ${s.deceiveResist}, analyze ${s.scanResist}` : u },
    { label: 'AI', value: full ? s.ai : u },
  ];
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
