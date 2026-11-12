import { sats } from './money';
import { codeName, typeNames, versus, WARRIORS, type Agent } from './agents';
import { actionsFor, type NodeAction, type Privilege } from './actions';
import { apparentContent, CONTENT_LABEL, fileActions, PROTECTION_PROGRAM, generateFiles, scanTicks, type DataFile, type FileAction } from './files';
import { Network } from './network';
import { programSize, usedMemory } from './programs';
import { FILE_PROGRAMS, PROGRAM_STUBS, MAPPER_COOLDOWN, MAPPER_HOP_TICKS, MAPPER_NOISE, mapperChances, type Program, type ProgramType } from './programs';
import type { FxTarget, LogColor, NodeDef, NodeKind, SimEvent, SystemDef } from './types';

/** Unidentified nodes are called ?1, ?2, ... */
export const UNKNOWN_PREFIX = '?';

export const TICKS_PER_SECOND = 10;

/** Placeholder: how long one hop between nodes takes. To be tuned later. */
export const MOVE_TICKS = 10;

/** A d100 roll: 1..100. Success when roll <= chance. */
export type Rng = () => number;

/** Something taken in this run. A program is paid out into the deck, a file in sats. */
export interface LootItem {
  /** Where it came from: node name and file id. */
  name: string;
  /** What it is, in a few words. */
  label: string;
  price: number;
  /** The player knew its price when taking it. */
  evaluated: boolean;
  software?: Program;
  /** A downloaded program already loaded into memory during the run. */
  loaded?: boolean;
}

/** The summary shown when a run ends. */
export interface RunReport {
  contract?: { title: string; pay: number };
  success: boolean;
  files: { name: string; label: string; price: number }[];
  software: Program[];
  pay: number;
  filesTotal: number;
  total: number;
  reputation: number;
  /** Experience earned, and what it was for. */
  xp: number;
  xpLines: { what: string; xp: number }[];
}

/** Placeholder XP for things done well in a run (counted, paid at the end). */
export const FEAT_XP = { kill: 10, deceive: 5, silence: 5, protection: 5, honeytoken: 10 } as const;
export type Feat = keyof typeof FEAT_XP;
const FEAT_LABEL: Record<Feat, string> = {
  kill: 'agents destroyed',
  deceive: 'agents deceived',
  silence: 'agents silenced',
  protection: 'file protections removed',
  honeytoken: 'honeytokens spotted',
};

interface MapperTask {
  /** Hop number: 1 = neighbours, 2 = two links away, ... */
  depth: number;
  /** Connections the eyes fly along in this hop. */
  edges: [string, string][];
  /** Every node the mapper reached so far. */
  reached: Set<string>;
  elapsed: number;
  identify: number;
  extend: number;
  progressId: number;
}

interface ScanTask {
  nodeId: string;
  /** Indexes of the files still to scan, the current one first. */
  queue: number[];
  elapsed: number;
  ticksPerFile: number;
  name: string;
  rating: number;
  progressId: number;
}

/** One of the player's programs released as an agent in the net. */
export interface Ally {
  id: string;
  program: Program;
  hp: number;
  maxHp: number;
  /** Node it is in, or the node it is leaving while on a link. */
  node: string;
  hop: { to: string; elapsed: number } | null;
  /** stay: holds its node. follow: goes where you go. unload: comes back to you and is loaded again. */
  order: AllyOrder;
  attackLeft: number;
  /** The enemy agent it was told to fight, if any. */
  target: string | null;
  /** Scout: the node it was sent to. */
  dest?: string | null;
  /** Scout: nodes it has been to. */
  visited?: Set<string>;
  /** Stays in this system between runs (a planted skimmer): not from your memory, takes no orders. */
  resident?: boolean;
}

/** explore: a scout flies on to unknown nodes by itself. */
export type AllyOrder = 'stay' | 'follow' | 'unload' | 'explore';

/** Placeholder scout numbers: it spends 1.5 s reading each node it reaches. */
export const SCOUT_DWELL = 15;

/** Placeholder warrior numbers: HP 20 + 10 per rating, hits 6 per rating every 1.5 s, hops in 1.2 s. */
export const ALLY_HOP_TICKS = 12;
export const WARRIOR_ATTACK_EVERY = 15;
export const warriorHp = (rating: number) => 20 + 10 * rating;
export const warriorDamage = (rating: number) => 6 * rating;
/** Placeholder shield HP: 15 + 10 per rating. */
export const shieldHp = (rating: number) => 15 + 10 * rating;
/** What a released warrior does until told otherwise (later each program can set its own). */
export const WARRIOR_DEFAULT_ORDER: AllyOrder = 'stay';

/** A file action that takes time (download, decrypt...); its effect lands when the bar is full. */
interface FileJob {
  nodeId: string;
  fileId: string;
  action: FileAction;
  program: Program | null;
  elapsed: number;
  ticks: number;
  progressId: number;
}

/**
 * Ticks a file action takes (10 ticks = 1 s). Placeholders: actions that need a program
 * get faster with its rating; download will later depend on the file's size.
 */
export function fileActionTicks(action: FileAction, rating = 1): number {
  const base: Record<FileAction, number> = { download: 15, decrypt: 25, defuse: 25, scrub: 25, forge: 25, evaluate: 12, identify: 12, extract: 12, alter: 10, delete: 8 };
  const byRating = action !== 'download' && action !== 'extract' && action !== 'alter' && action !== 'delete';
  return byRating ? Math.max(3, Math.round(base[action] / Math.max(1, rating))) : base[action];
}

interface MoveTask {
  to: string;
  elapsed: number;
  total: number;
  /** A gate on the link: still ahead, asking who you are, passed, or you are backing off from it. */
  gate?: 'ahead' | 'asking' | 'passed' | 'back';
}

/** Ticks an active Analyze of one agent takes (placeholder: 3 s). */
export const ANALYZE_TICKS = 30;
/** Where along a hop the gate stands (the avatar walks up to it before it may stop you). */
const GATE_POINT = 0.62;

const gateKey = (a: string, b: string) => [a, b].sort().join('|');

/** Ticks out of every agent's sight for your signature to drop one level (placeholder: 20 s). */
export const SIGNATURE_COOL = 200;
export const SIGNATURE_NAMES = ['anonymous', 'noticed', 'suspected', 'burned'] as const;

/**
 * The pure game simulation. No DOM here: the UI calls step() once per tick
 * and reads the events it produced.
 */
export class Game {
  readonly network: Network;
  tick = 0;
  /** The game starts paused, so the player can look around first. */
  paused = true;
  /** Half-turn mode: time stops by itself whenever a lasting action ends. */
  autoPause = true;
  currentNode: string;

  private move: MoveTask | null = null;
  private route: string[] = [];
  private events: SimEvent[] = [];
  private readonly identified = new Set<string>();
  /** Nodes the player knows exist: visited ones and their neighbours. The rest of the map is unseen. */
  private readonly known = new Set<string>();
  /** Stable number of each hidden node in this system, used for its ?N name. */
  private readonly unknownNumber = new Map<string, number>();
  /** Privileges the player holds in this system. */
  readonly privileges = new Set<Privilege>();
  /** Programs loaded in the player's memory: the ones usable in this run. */
  readonly programs: Program[];
  /** Memory size in GB: loaded programs must fit in it. */
  readonly memorySlots: number;
  /** What the player took in this run: paid out (sats, programs) only when the run ends. */
  readonly loot: LootItem[] = [];
  /** Things done well this run: each pays experience at the end. */
  readonly feats: Feat[] = [];
  /** The run is over: the player left the net. */
  ended = false;
  /** Agents defending the system. */
  readonly agents: Agent[] = [];
  /** The player's own agents (released programs). */
  readonly allies: Ally[] = [];
  /** Ids of programs that are out as agents, and of ones destroyed this run: neither can be used now. */
  private readonly released = new Set<string>();
  readonly lost = new Set<string>();
  /** Which ally each enemy agent fights (the last one that hit it). */
  private readonly foes = new Map<string, string>();
  private nextAllyId = 1;
  /** System alarm: 0 green, 1 yellow, 2 orange, 3 red. */
  alarm = 0;
  /** Ticks since the last thing that raised the alarm (yellow fades after a quiet minute). */
  private calm = 0;
  /**
   * How well agents know your signature (like wanted stars): 0 anonymous, 1 noticed, 2 suspected, 3 burned.
   * Burned: every agent that sees you is hostile at once. It drops by itself only while no agent sees you,
   * and not below 1; a mask program clears it.
   */
  signature = 0;
  private unseen = 0;
  readonly maxIntegrity = 20;
  /** The player's integrity: at 0 you are thrown out of the net. */
  integrity = 20;
  /** Thrown out of the net by losing all integrity. */
  kicked = false;
  /** The agent querying the player, waiting for an answer. */
  query: { agentId: string } | null = null;
  /** Changes whenever the deck's contents change (programs or loot). */
  deckVersion = 0;
  private nextProgramId: number;
  /** Noise the player made in each node. Nothing reacts to it yet. */
  readonly noise = new Map<string, number>();

  private mapper: MapperTask | null = null;
  private scan: ScanTask | null = null;
  /** Data files in each database (a honeypot posing as one has them too). */
  private readonly files = new Map<string, DataFile[]>();
  private nextProgressId = 1;
  private readonly d100: () => number;

  /**
   * programs: the ones loaded in your memory (usable in this run).
   * opts.memory: memory slots; opts.nextId: first free program id number (ids stay unique across the account).
   */
  constructor(system: SystemDef, rng: Rng = Math.random, programs: Program[] = STARTING_PROGRAMS, opts: { memory?: number; nextId?: number } = {}) {
    this.d100 = () => Math.floor(rng() * 100) + 1;
    this.programs = programs.map((p) => ({ ...p }));
    this.memorySlots = opts.memory ?? Math.max(DEFAULT_MEMORY, usedMemory(this.programs));
    this.nextProgramId = Math.max(100, opts.nextId ?? 0, ...this.programs.map((p) => Number(p.id.slice(1)) + 1 || 0));
    this.network = new Network(system);
    this.currentNode = system.entry;
    for (const n of system.nodes) if (!n.hidden || n.id === system.entry) this.identified.add(n.id);
    for (const n of system.nodes) {
      if (n.kind === 'database' || (n.kind === 'honeypot' && (n.disguise ?? 'database') === 'database')) this.files.set(n.id, generateFiles(system.fileSeed ? `${system.fileSeed}/${n.id}` : n.id, system.security ?? 1));
    }
    const job = system.contract;
    const target = job && this.files.get(job.node);
    if (job && target) target.push({ id: `f${target.length + 1}`, content: 'contract', scanned: false, need: job.need });
    const defs = system.agents ?? [];
    const names = typeNames(system.id, defs.map((a) => a.type ?? 'balanced'));
    defs.forEach((a, i) => {
      const stats = WARRIORS[a.type ?? 'balanced'];
      this.agents.push({
        id: `a${i + 1}`, typeName: names.get(stats.type)!, name: codeName(`${system.id}/${i}`), stats, hp: stats.hp, node: a.node, hop: null,
        stayLeft: stats.stay[0], queryLeft: stats.queryEvery, attackLeft: stats.attackEvery,
        mood: 'patrol', strikes: 0, silenced: false, known: 'none',
      });
    });
    this.discoverAround(this.currentNode);
    this.log(`link up: ${system.name} (${system.location})`, 'system');
    this.log(`you are at ${this.nameOf(this.currentNode)}`);
    if (job) this.log(`contract: ${job.title}. find the contract file in one of the databases and ${job.need} it. pays ${job.pay} sats`, 'system');
  }

  /** The contract's file, once it exists. */
  private get contractFile(): DataFile | undefined {
    const job = this.network.def.contract;
    return job ? this.files.get(job.node)?.find((f) => f.content === 'contract') : undefined;
  }

  /** The contract's task is done. */
  get contractDone(): boolean {
    const f = this.contractFile;
    const job = this.network.def.contract;
    if (!f || !job) return false;
    return job.need === 'alter' ? !!f.altered && !f.deleted : !!f.deleted;
  }

  /** The skimmer planted in this run, if any: it leaves your gear and keeps paying out day after day. */
  planted: Program | null = null;

  /** Plants a skimmer in a database of a local business. */
  plantSkimmer(program: Program): boolean {
    if (!this.network.def.local) {
      this.log(`${program.name}: skimmers go into local businesses, not contract targets`, 'alarm1');
      return false;
    }
    if (this.kindOf(this.currentNode) !== 'payment') {
      this.log(`${program.name}: plant it in the payment gateway (where the money moves)`, 'alarm1');
      return false;
    }
    if (this.planted || this.allies.some((x) => x.resident)) {
      this.log('a skimmer is already planted here', 'alarm1');
      return false;
    }
    this.planted = program;
    this.programs.splice(this.programs.indexOf(program), 1);
    this.deckVersion++;
    const ally = this.addResident(program, this.currentNode);
    this.outcome({ kind: 'ally', id: ally.id }, true, 'PLANTED');
    this.log(`${program.name} planted in ${this.nameOf(this.currentNode)}. it will skim a little every day (x${program.efficiency ?? 1}, ${program.detection ?? 5}% a day to be found)`, 'info');
    return true;
  }

  /** Loads a downloaded program from this run's data into a free memory slot, so it can be used at once. */
  loadProgram(name: string): boolean {
    const q = name.trim().toLowerCase();
    const item = this.loot.find((l) => l.software && !l.loaded && l.software.name.toLowerCase() === q);
    if (!item) {
      this.log(q ? `no downloaded program "${name}" to load` : 'usage: load <program>', 'alarm1');
      return false;
    }
    const size = programSize(item.software!);
    if (usedMemory(this.programs) + size > this.memorySlots) {
      this.log(`not enough memory: ${item.software!.name} needs ${size} GB, ${this.memorySlots - usedMemory(this.programs)} GB free. it waits in your data until you leave the net`, 'alarm1');
      return false;
    }
    item.loaded = true;
    this.programs.push(item.software!);
    this.deckVersion++;
    this.log(`${item.software!.name} loaded into memory (${usedMemory(this.programs)}/${this.memorySlots} GB)`, 'info');
    return true;
  }

  // ---------- agents ----------

  agentById(id: string): Agent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  /** Agents standing in a node (not on a link). */
  agentsIn(nodeId: string): Agent[] {
    return this.agents.filter((a) => a.node === nodeId && !a.hop);
  }

  /** Best hide rating in the gear (0 without one). */
  private get hideRating(): number {
    return this.findProgram('hide')?.rating ?? 0;
  }

  /** Detection after the alarm: agents grow more suspicious as it rises. */
  private detectionOf(a: Agent): number {
    return a.stats.detection * (1 + 0.5 * this.alarm);
  }

  /** Chance an agent's query catches the player (shown in its info). */
  queryChance(a: Agent): number {
    return versus(this.detectionOf(a), this.hideRating);
  }

  private pick<T>(list: T[]): T {
    return list[Math.min(list.length - 1, Math.floor(((this.d100() - 1) / 100) * list.length))];
  }

  private updateAgents(): void {
    const playerHere = this.move ? null : this.currentNode;
    for (const a of [...this.agents]) {
      if (this.ended) return;
      if (a.hop) {
        a.hop.elapsed++;
        if (a.hop.elapsed >= a.stats.hopTicks) {
          a.node = a.hop.to;
          a.hop = null;
          a.stayLeft = a.stats.stay[0] + Math.floor(((this.d100() - 1) / 100) * (a.stats.stay[1] - a.stats.stay[0]));
          a.queryLeft = a.stats.queryEvery;
        }
        continue;
      }
      const together = a.node === playerHere;
      if (a.mood === 'hostile') {
        // Your agents in its node draw its fire first: the one fighting it, or any.
        const near = this.allies.filter((x) => x.node === a.node && !x.hop && !x.resident);
        const foe = near.find((x) => x.id === this.foes.get(a.id)) ?? near[0];
        if (foe) {
          if (--a.attackLeft <= 0) {
            a.attackLeft = a.stats.attackEvery;
            this.hitAlly(a, foe);
          }
        } else if (together) {
          if (--a.attackLeft <= 0) {
            a.attackLeft = a.stats.attackEvery;
            this.hitPlayer(a);
          }
        } else {
          // Chase the player.
          const target = this.move ? this.move.to : this.currentNode;
          const path = this.network.path(a.node, target);
          if (path.length) a.hop = { to: path[0], elapsed: 0 };
        }
        continue;
      }
      if (together && this.signature >= 3) {
        if (this.query?.agentId === a.id) this.query = null;
        a.mood = 'hostile';
        a.attackLeft = a.stats.attackEvery;
        this.log(`${a.name} recognises your burned signature: ENEMY`, 'alarm3');
        continue;
      }
      if (together && a.mood === 'patrol' && !this.query && !this.gateQuery) {
        if (--a.queryLeft <= 0) {
          a.queryLeft = a.stats.queryEvery;
          // After a first unanswered query it asks again for sure.
          if (a.strikes > 0 || this.d100() <= this.queryChance(a)) this.startQuery(a);
        }
      }
      if (together && (a.mood === 'trusting' || this.query?.agentId === a.id)) continue;
      if (--a.stayLeft <= 0) {
        const next = this.network.neighbours(a.node).filter((n) => n.kind !== 'honeypot');
        if (next.length) a.hop = { to: this.pick(next).id, elapsed: 0 };
      }
    }
  }

  private updateAlarm(): void {
    this.calm++;
    if (this.alarm === 1 && this.calm >= 600) {
      this.alarm = 0;
      this.events.push({ type: 'alarm', level: 0 });
      this.log('alarm back to GREEN: the system calmed down', 'info');
    }
  }

  /** Your signature cools down while no agent sees you: one level every SIGNATURE_COOL ticks, not below 1. */
  private updateSignature(): void {
    if (!this.signature) return;
    const seen = !this.move && this.agents.some((a) => a.node === this.currentNode && !a.hop);
    if (seen) {
      this.unseen = 0;
      return;
    }
    if (this.signature > 1 && ++this.unseen >= SIGNATURE_COOL) {
      this.unseen = 0;
      this.setSignature(this.signature - 1, 'out of sight: agents are losing your trail');
    }
  }

  private setSignature(level: number, why: string): void {
    level = Math.max(0, Math.min(3, level));
    if (level === this.signature) return;
    const up = level > this.signature;
    this.signature = level;
    this.unseen = 0;
    const name = SIGNATURE_NAMES[level];
    this.log(`SIGNATURE ${name.toUpperCase()}: ${why}`, !up ? 'info' : level >= 3 ? 'alarm3' : level === 2 ? 'alarm2' : 'alarm1');
  }

  /** Raises your signature to at least this level. */
  exposeSignature(level: number, why: string): void {
    if (level > this.signature) this.setSignature(level, why);
  }

  /** Raises the system alarm to at least this level. */
  raiseAlarm(level: number): void {
    this.calm = 0;
    if (level <= this.alarm) return;
    this.alarm = level;
    const name = ['GREEN', 'YELLOW', 'ORANGE', 'RED'][level];
    this.events.push({ type: 'alarm', level });
    this.log(`ALARM ${name}`, level >= 3 ? 'alarm3' : level === 2 ? 'alarm2' : 'alarm1');
  }

  /** Active Analyze on one agent in your node: takes a few seconds, then rolls like the passive one. */
  private analysis: { agentId: string; elapsed: number; total: number; progressId: number } | null = null;

  /** The analyze command: an agent here by name, or the first one here. */
  analyzeCommand(target: string): boolean {
    if (!this.findProgram('analyze')) {
      this.log('no analyze program in your gear', 'alarm1');
      return false;
    }
    const here = this.agentsIn(this.currentNode);
    const q = target.trim().toLowerCase();
    const a = q ? here.find((x) => x.name.toLowerCase() === q) : here.find((x) => x.known !== 'full') ?? here[0];
    if (!a) {
      this.log(q ? `no agent "${target}" here` : 'no agent here to analyze', 'alarm1');
      return false;
    }
    return this.analyzeAgent(a.id);
  }

  /** Starts analyzing an agent in your node with the Analyze program. */
  analyzeAgent(agentId: string): boolean {
    const program = this.findProgram('analyze');
    const a = this.agentById(agentId);
    if (!program || !a) return false;
    if (a.node !== this.currentNode || a.hop || this.move) {
      this.log(`${program.name}: ${a.name} must be in your node`, 'alarm1');
      return false;
    }
    if (a.known === 'full') {
      this.log(`${a.name} is already fully analyzed (hover it to see)`, 'system');
      return false;
    }
    if (this.analysis) {
      this.log(`${program.name} is already analyzing`, 'alarm1');
      return false;
    }
    this.analysis = { agentId, elapsed: 0, total: ANALYZE_TICKS, progressId: this.nextProgressId++ };
    this.log(`${program.name}: analyzing ${a.name}...`);
    this.events.push({ type: 'program', programType: 'analyze' });
    this.actionStarted();
    return true;
  }

  private updateAnalysis(): void {
    const t = this.analysis;
    if (!t) return;
    const a = this.agentById(t.agentId);
    const label = `analyze ${a?.name ?? 'agent'}`;
    // It needs the agent in front of you the whole time.
    if (!a || a.node !== this.currentNode || a.hop || this.move) {
      this.events.push({ type: 'progress', line: { id: t.progressId, label: `${label}: lost it`, progress: t.elapsed / t.total, done: true } });
      this.log(`analysis broken off: ${a ? `${a.name} is out of reach` : 'the agent is gone'}`, 'alarm1');
      this.analysis = null;
      this.actionEnded();
      return;
    }
    t.elapsed++;
    const done = t.elapsed >= t.total;
    this.events.push({ type: 'progress', line: { id: t.progressId, label, progress: t.elapsed / t.total, done } });
    if (!done) return;
    this.analysis = null;
    const before = a.known;
    this.analyze(a, true);
    this.outcome({ kind: 'agent', id: a.id }, a.known !== before, a.known !== before ? 'ANALYZED' : 'NO READ');
    this.actionEnded();
  }

  /** Analyze: a roll each time an agent deals with you (or you analyze it on purpose), until it is fully known. */
  private analyze(a: Agent, active = false): void {
    if (a.known === 'full') return;
    const program = this.findProgram('analyze');
    if (!program) return;
    // On purpose it reads better than in passing (placeholder: twice the rating).
    const chance = versus(program.rating * (active ? 2 : 1), a.stats.scanResist);
    const roll = this.d100();
    const got = roll <= chance / 2 ? 'full' : roll <= chance ? 'partial' : 'none';
    if (got === 'none' || (got === 'partial' && a.known === 'partial')) {
      if (a.known === 'none' || active) this.log(`${program.name}: could not read ${a.name}${active ? ' this time' : ''}`, 'system');
      return;
    }
    // Agents of one type share their stats: what you learn about one applies to every agent of that type here.
    for (const b of this.agents) if (b.stats.type === a.stats.type && b.known !== 'full') b.known = got;
    const others = this.agents.filter((b) => b !== a && b.stats.type === a.stats.type).length;
    this.log(`${program.name}: ${a.name} (${a.typeName}) ${got === 'full' ? 'fully analyzed' : 'partly analyzed'}${others ? `. this applies to every ${a.typeName} here` : ''} (hover it to see)`, 'info');
  }

  private startQuery(a: Agent): void {
    this.query = { agentId: a.id };
    this.analyze(a);
    this.log(`${a.name} (${a.typeName}) QUERIES YOU${a.strikes ? ' again' : ''}: who are you?`, 'alarm2');
    this.setPaused(true);
    this.events.push({ type: 'query', agentId: a.id });
  }

  /** Answers the open query. */
  answerQuery(choice: 'present' | 'deceive' | 'silence' | 'attack' | 'ignore'): boolean {
    const a = this.query && this.agentById(this.query.agentId);
    if (!a) {
      this.log('no one is querying you', 'system');
      return false;
    }
    if (choice === 'present') {
      if (!this.privileges.size) {
        this.log('you hold no privilege to show', 'alarm1');
        return false;
      }
      this.query = null;
      a.mood = 'trusting';
      this.outcome({ kind: 'agent', id: a.id }, true, 'ACCEPTED');
      this.log(`you show your ${[...this.privileges].join(' / ')} privilege. ${a.name} lets you be`, 'info');
      return true;
    }
    if (choice === 'ignore') {
      this.query = null;
      this.log(`you ignore ${a.name}`, 'system');
      this.strike(a);
      return true;
    }
    if (choice === 'attack') return this.attackCommand(a.name);
    return this.agentCommand(choice, a.name);
  }

  /** Shows how an action went over its target in the map view. */
  private outcome(at: FxTarget, ok: boolean, text: string): void {
    this.events.push({ type: 'outcome', at, ok, text });
  }

  /** A failed or ignored query: first time yellow and it asks again; second time red and hostile. */
  private strike(a: Agent): void {
    a.strikes++;
    if (a.strikes === 1) {
      this.raiseAlarm(1);
      if (!a.silenced) this.exposeSignature(this.signature + 1, `${a.name} got a look at you`);
      a.queryLeft = 20;
      this.log(`${a.name} grows suspicious: it will ask again`, 'alarm1');
    } else {
      this.makeHostile(a, true);
    }
  }

  private makeHostile(a: Agent, alarm: boolean): void {
    a.mood = 'hostile';
    a.attackLeft = a.stats.attackEvery;
    this.log(`${a.name} marks you as an ENEMY`, 'alarm3');
    if (alarm && !a.silenced) this.raiseAlarm(3);
    // A fight burns your signature: every agent will know you (unless this one is silenced and cannot tell).
    if (!a.silenced) this.exposeSignature(3, `${a.name} passed it on to every agent`);
  }

  /** attack / silence / deceive an agent in your node (by name, or the one querying you, or the first one here). */
  agentCommand(type: 'silence' | 'deceive', target: string, program = this.findProgram(type)): boolean {
    if (!program) {
      this.log(`no ${type} program in your gear`, 'alarm1');
      return false;
    }
    if (this.move) {
      this.log('cannot do that while connecting', 'alarm1');
      return false;
    }
    const here = this.agentsIn(this.currentNode);
    const q = target.trim().toLowerCase();
    const a = q ? here.find((x) => x.name.toLowerCase() === q) : (this.query && this.agentById(this.query.agentId)) || here[0];
    if (!a) {
      this.log(q ? `no agent "${target}" here` : 'no agent here', 'alarm1');
      return false;
    }
    const querying = this.query?.agentId === a.id;
    if (type === 'deceive') {
      if (!querying) {
        this.log(`${program.name}: deceive answers a query. ${a.name} is not asking anything`, 'system');
        return false;
      }
      this.query = null;
      if (this.d100() <= versus(program.rating, a.stats.deceiveResist)) {
        a.mood = 'trusting';
        this.feats.push('deceive');
        this.outcome({ kind: 'agent', id: a.id }, true, 'DECEIVED');
        this.log(`${program.name}: ${a.name} is deceived. it leaves you alone while you stay here`, 'info');
      } else {
        this.outcome({ kind: 'agent', id: a.id }, false, 'NOT FOOLED');
        this.log(`${program.name}: ${a.name} saw through it`, 'alarm1');
        this.strike(a);
      }
      return true;
    }
    if (querying) this.query = null;
    this.analyze(a);
    if (type === 'silence') {
      if (a.silenced) {
        this.log(`${a.name} is already silenced`, 'system');
        return false;
      }
      if (this.d100() <= versus(program.rating, a.stats.silenceResist)) {
        a.silenced = true;
        this.feats.push('silence');
        this.outcome({ kind: 'agent', id: a.id }, true, 'SILENCED');
        this.log(`${program.name}: ${a.name} silenced. its messages cannot leave this node`, 'info');
        if (a.mood !== 'hostile') this.makeHostile(a, false);
      } else {
        this.outcome({ kind: 'agent', id: a.id }, false, 'SILENCE FAILED');
        this.log(`${program.name}: silence failed on ${a.name}`, 'alarm2');
        if (a.mood !== 'hostile') this.makeHostile(a, true);
        else if (!a.silenced) this.raiseAlarm(3);
      }
      return true;
    }
    return true;
  }

  /** An agent in your node, by name; or the one querying you; or the first one here. */
  private agentHere(target: string): Agent | undefined {
    const here = this.agentsIn(this.currentNode);
    const q = target.trim().toLowerCase();
    return q ? here.find((x) => x.name.toLowerCase() === q) : (this.query && this.agentById(this.query.agentId)) || here[0];
  }

  /**
   * attack: your warriors in this node go for an agent here (by name, or the one querying you, or the first one).
   * With no warrior here, your best free warrior is released to do it.
   */
  attackCommand(target: string): boolean {
    if (this.move) {
      this.log('cannot do that while connecting', 'alarm1');
      return false;
    }
    const a = this.agentHere(target);
    if (!a) {
      this.log(target.trim() ? `no agent "${target}" here` : 'no agent here', 'alarm1');
      return false;
    }
    const mine = this.allies.filter((x) => x.node === this.currentNode && !x.hop && x.program.type === 'warrior');
    if (!mine.length) {
      const program = this.findProgram('warrior');
      if (!program) {
        this.log('no warrior to send: release one or load one', 'alarm1');
        return false;
      }
      return this.releaseWarrior(program, a);
    }
    if (this.query?.agentId === a.id) this.query = null;
    for (const x of mine) x.target = a.id;
    this.log(`${mine.map((x) => x.program.name).join(', ')}: going for ${a.name}`, 'system');
    return true;
  }

  /** Releases a warrior program as your agent in this node, optionally sent at an agent. */
  releaseWarrior(program: Program, target: Agent | null): boolean {
    if (this.move) {
      this.log('cannot release an agent while connecting', 'alarm1');
      return false;
    }
    if (this.released.has(program.id) || this.lost.has(program.id)) {
      this.log(`${program.name} is ${this.lost.has(program.id) ? 'destroyed for this run' : 'already out'}`, 'alarm1');
      return false;
    }
    const hp = warriorHp(program.rating);
    const ally: Ally = { id: `y${this.nextAllyId++}`, program, hp, maxHp: hp, node: this.currentNode, hop: null, order: WARRIOR_DEFAULT_ORDER, attackLeft: 3, target: target?.id ?? null };
    this.allies.push(ally);
    this.released.add(program.id);
    this.deckVersion++;
    if (target && this.query?.agentId === target.id) this.query = null;
    this.events.push({ type: 'program', programType: 'warrior' });
    this.outcome({ kind: 'ally', id: ally.id }, true, 'RELEASED');
    this.log(`${program.name} released${target ? `: going for ${target.name}` : ''}. it ${ally.order === 'stay' ? 'holds this node' : 'follows you'} (stay / follow / unload)`, 'info');
    this.actionStarted();
    return true;
  }

  /** One of your agents that takes orders, by its program's name (or the only one out). */
  allyByName(name: string): Ally | undefined {
    const q = name.trim().toLowerCase();
    const mine = this.allies.filter((x) => !x.resident);
    if (!q) return mine.length === 1 ? mine[0] : undefined;
    return mine.find((x) => x.program.name.toLowerCase() === q || x.id === q);
  }

  /** A program of yours that lives in this system (a skimmer planted earlier), shown as your agent. */
  addResident(program: Program, node: string): Ally {
    const ally: Ally = { id: `y${this.nextAllyId++}`, program, hp: 1, maxHp: 1, node, hop: null, order: 'stay', attackLeft: 0, target: null, resident: true };
    this.allies.push(ally);
    return ally;
  }

  /** Gives one of your agents an order: stay, follow, or unload (come back and be loaded again). */
  orderAlly(name: string, order: AllyOrder): boolean {
    const ally = this.allyByName(name);
    if (!ally) {
      this.log(this.allies.length ? `which agent? ${this.allies.map((x) => x.program.name).join(', ')}` : 'you have no agents out', 'alarm1');
      return false;
    }
    ally.order = order;
    const what = { stay: 'holds its node', follow: 'follows you', unload: 'comes back to you', explore: 'explores on its own' }[order];
    this.log(`${ally.program.name} ${what}`, 'system');
    if (order === 'unload') this.tryUnload(ally);
    return true;
  }

  /** Where the player is, or is heading. */
  private get playerTarget(): string {
    return this.move ? this.move.to : this.currentNode;
  }

  private tryUnload(ally: Ally): boolean {
    if (ally.hop || this.move || ally.node !== this.currentNode) return false;
    this.allies.splice(this.allies.indexOf(ally), 1);
    this.released.delete(ally.program.id);
    this.deckVersion++;
    this.events.push({ type: 'shot', from: { kind: 'ally', id: ally.id }, to: { kind: 'player' }, hit: false, hostile: false, recall: true });
    this.outcome({ kind: 'player' }, true, 'UNLOADED');
    this.log(`${ally.program.name} is back in your memory`, 'info');
    return true;
  }

  /** Your agents: move as ordered, and fight enemy agents in their node. */
  private updateAllies(): void {
    for (const ally of [...this.allies]) {
      if (this.ended) return;
      if (ally.resident) continue;
      if (ally.hop) {
        if (++ally.hop.elapsed >= ALLY_HOP_TICKS) {
          ally.node = ally.hop.to;
          ally.hop = null;
          if (ally.order === 'explore') this.scoutArrives(ally);
        }
        continue;
      }
      if (ally.order === 'unload' && this.tryUnload(ally)) continue;
      if (ally.order === 'explore') {
        this.scoutStep(ally);
        continue;
      }
      if (ally.order !== 'stay' && ally.node !== this.playerTarget) {
        const path = this.network.path(ally.node, this.playerTarget);
        if (path.length) {
          ally.hop = { to: path[0], elapsed: 0 };
          continue;
        }
      }
      if (ally.program.type === 'shield') continue;
      const here = this.agentsIn(ally.node);
      const enemy = here.find((x) => x.id === ally.target) ?? (this.query ? here.find((x) => x.id === this.query!.agentId) : undefined) ?? here.find((x) => x.mood === 'hostile');
      if (!enemy || --ally.attackLeft > 0) continue;
      ally.attackLeft = WARRIOR_ATTACK_EVERY;
      this.allyHits(ally, enemy);
    }
  }

  /**
   * scout [node]: sends your best free scout from here, to that node or (with no node) to explore.
   * The argument can also name the scout program.
   */
  scoutCommand(arg: string): boolean {
    if (this.move) {
      this.log('cannot release an agent while connecting', 'alarm1');
      return false;
    }
    const q = arg.trim().toLowerCase();
    const byName = q ? this.findProgram('scout', q) : undefined;
    const program = byName ?? this.findProgram('scout');
    if (!program) {
      this.log(this.programs.some((p) => p.type === 'scout') ? 'every scout is already out' : 'no scout program in your gear', 'alarm1');
      return false;
    }
    let dest: string | null = null;
    if (q && !byName) {
      const node = this.network.def.nodes.find((n) => this.isKnown(n.id) && (this.nameOf(n.id).toLowerCase() === q || n.id === q));
      if (!node) {
        this.log(`unknown node: ${arg}`, 'alarm1');
        return false;
      }
      dest = node.id === this.currentNode ? null : node.id;
    }
    const ally: Ally = { id: `y${this.nextAllyId++}`, program, hp: 10 + 5 * program.rating, maxHp: 10 + 5 * program.rating, node: this.currentNode, hop: null, order: 'explore', attackLeft: 0, target: null, dest, visited: new Set([this.currentNode]) };
    this.allies.push(ally);
    this.released.add(program.id);
    this.deckVersion++;
    this.events.push({ type: 'program', programType: 'scout' });
    this.outcome({ kind: 'ally', id: ally.id }, true, 'SCOUT OUT');
    this.log(`${program.name} sent${dest ? ` to ${this.nameOf(dest)}` : ' to explore'}. it flies on until an agent catches it`, 'info');
    this.actionStarted();
    return true;
  }

  /** A scout reads its node for a moment, then flies on: to where it was sent, then to the nearest node not yet identified. */
  private scoutStep(ally: Ally): void {
    if (ally.attackLeft > 0) {
      ally.attackLeft--;
      return;
    }
    let next: string | undefined;
    if (ally.dest && ally.dest !== ally.node) next = this.network.path(ally.node, ally.dest)[0];
    if (!next) {
      ally.dest = null;
      // Breadth-first to the nearest node it has not been to and you have not identified.
      const seen = new Set([ally.node]);
      let ring = [ally.node];
      const first = new Map<string, string>();
      while (ring.length && !next) {
        const out: string[] = [];
        for (const id of ring) for (const n of this.network.neighbours(id)) {
          if (seen.has(n.id) || n.kind === 'honeypot' && this.isIdentified(n.id)) continue;
          seen.add(n.id);
          first.set(n.id, first.get(id) ?? n.id);
          if (!this.isIdentified(n.id) && !ally.visited!.has(n.id)) {
            next = first.get(n.id);
            break;
          }
          out.push(n.id);
        }
        ring = out;
      }
    }
    if (!next) {
      ally.order = 'stay';
      this.log(`${ally.program.name}: nothing left to find around here. it waits (follow / unload)`, 'system');
      return;
    }
    ally.hop = { to: next, elapsed: 0 };
  }

  /** A scout reaches a node: an agent may catch it; otherwise it identifies the node and reads the agents there. */
  private scoutArrives(ally: Ally): void {
    const id = ally.node;
    ally.visited!.add(id);
    ally.attackLeft = SCOUT_DWELL;
    const r = ally.program.rating;
    const trap = this.network.node(id).kind === 'honeypot';
    for (const a of trap ? [null] : this.agentsIn(id)) {
      if (a && (a.mood === 'trusting' || this.d100() > versus(this.detectionOf(a), r))) continue;
      this.outcome({ kind: 'ally', id: ally.id }, false, trap ? 'HONEYPOT!' : 'CAUGHT');
      this.allies.splice(this.allies.indexOf(ally), 1);
      this.released.delete(ally.program.id);
      this.lost.add(ally.program.id);
      this.deckVersion++;
      this.log(`${a ? a.name : 'a honeypot'} caught your ${ally.program.name} in ${this.nameOf(id)}. it is lost for this run`, 'alarm2');
      this.raiseAlarm(1);
      return;
    }
    const isNew = !this.isIdentified(id);
    this.identified.add(id);
    this.discoverAround(id);
    const agents = this.agentsIn(id);
    for (const a of agents) if (a.known === 'none') a.known = 'partial';
    if (isNew) this.outcome({ kind: 'ally', id: ally.id }, true, 'FOUND');
    this.log(`${ally.program.name}: ${this.nameOf(id)} (${this.kindOf(id)})${agents.length ? `, agents: ${agents.map((a) => `${a.name} (${a.typeName})`).join(', ')}` : ', no agents'}`, 'info');
  }

  private allyHits(ally: Ally, a: Agent): void {
    if (this.query?.agentId === a.id) this.query = null;
    this.analyze(a);
    const r = ally.program.rating;
    const hit = this.d100() <= versus(r, a.stats.armor);
    const damage = hit ? warriorDamage(r) : 0;
    const fresh = a.mood !== 'hostile';
    a.hp -= damage;
    this.foes.set(a.id, ally.id);
    this.events.push({ type: 'shot', from: { kind: 'ally', id: ally.id }, to: { kind: 'agent', id: a.id }, hit, hostile: false });
    this.outcome({ kind: 'agent', id: a.id }, hit, a.hp <= 0 ? 'DESTROYED' : hit ? `-${damage}` : 'MISS');
    if (a.hp <= 0) {
      this.agents.splice(this.agents.indexOf(a), 1);
      this.foes.delete(a.id);
      if (ally.target === a.id) ally.target = null;
      this.feats.push('kill');
      this.log(`${ally.program.name}: ${a.name} destroyed${fresh ? ' in one blow. no one noticed' : ''}`, 'info');
      return;
    }
    this.log(hit ? `${ally.program.name}: ${a.name} hit for ${damage} (HP ${a.hp}/${a.stats.hp})` : `${ally.program.name}: missed ${a.name}`, 'alarm2');
    if (fresh) this.makeHostile(a, true);
    else if (!a.silenced) this.raiseAlarm(3);
  }

  private hitAlly(a: Agent, ally: Ally): void {
    ally.hp -= a.stats.damage;
    this.events.push({ type: 'shot', from: { kind: 'agent', id: a.id }, to: { kind: 'ally', id: ally.id }, hit: true, hostile: true });
    if (ally.hp > 0) {
      this.outcome({ kind: 'ally', id: ally.id }, false, `-${a.stats.damage}`);
      return;
    }
    this.outcome({ kind: 'ally', id: ally.id }, false, 'DESTROYED');
    this.allies.splice(this.allies.indexOf(ally), 1);
    this.released.delete(ally.program.id);
    this.lost.add(ally.program.id);
    this.deckVersion++;
    this.log(`${a.name} destroyed your ${ally.program.name}. it is lost for this run`, 'alarm3');
  }

  private hitPlayer(a: Agent): void {
    // A loaded shield jumps out at the first shot and takes it.
    const shield = this.findProgram('shield');
    if (shield) {
      const hp = shieldHp(shield.rating);
      const ally: Ally = { id: `y${this.nextAllyId++}`, program: shield, hp, maxHp: hp, node: this.currentNode, hop: null, order: 'follow', attackLeft: 0, target: null };
      this.allies.push(ally);
      this.released.add(shield.id);
      this.deckVersion++;
      this.outcome({ kind: 'ally', id: ally.id }, true, 'SHIELD UP');
      this.log(`${shield.name} jumps out and takes the hits for you`, 'info');
      this.hitAlly(a, ally);
      return;
    }
    this.integrity = Math.max(0, this.integrity - a.stats.damage);
    this.events.push({ type: 'hit' });
    this.events.push({ type: 'shot', from: { kind: 'agent', id: a.id }, to: { kind: 'player' }, hit: true, hostile: true });
    this.outcome({ kind: 'player' }, false, `-${a.stats.damage}`);
    this.log(`${a.name} hits you: integrity ${this.integrity}/${this.maxIntegrity}`, 'alarm3');
    if (this.integrity <= 0 && !this.kicked) {
      this.kicked = true;
      this.query = null;
      this.log('INTEGRITY LOST: you are thrown out of the net', 'alarm3');
      this.events.push({ type: 'kicked' });
    }
  }

  /** Leaves the net: the run ends and its report says what the player earned. */
  endRun(): RunReport {
    this.ended = true;
    this.move = null;
    this.route = [];
    this.mapper = null;
    this.scan = null;
    this.analysis = null;
    this.gateQuery = null;
    this.fileJob = null;
    this.allies.length = 0;
    const job = this.network.def.contract;
    const success = this.contractDone;
    const files = this.loot.filter((l) => !l.software).map((l) => ({ name: l.name, label: l.label, price: l.price }));
    const software = this.loot.filter((l) => l.software).map((l) => l.software!);
    const pay = job && success ? job.pay : 0;
    // Placeholder reputation: a contract done +5; a local job +1 if you took something and the alarm never went red.
    const reputation = job ? (success ? 5 : 0) : this.loot.length && this.alarm < 3 ? 1 : 0;
    const filesTotal = files.reduce((sum, f) => sum + f.price, 0);
    // Placeholder experience: a contract done (more for a harder system), plus every feat counted during the run.
    const security = this.network.def.security ?? 1;
    const xpLines: { what: string; xp: number }[] = [];
    if (job && success) xpLines.push({ what: `contract done (security ${security})`, xp: 50 * security });
    for (const f of Object.keys(FEAT_XP) as Feat[]) {
      const n = this.feats.filter((x) => x === f).length;
      if (n) xpLines.push({ what: `${FEAT_LABEL[f]} x${n}`, xp: n * FEAT_XP[f] });
    }
    const xp = xpLines.reduce((sum, l) => sum + l.xp, 0);
    this.log('link down: you left the net', 'system');
    return { contract: job ? { title: job.title, pay: job.pay } : undefined, success, files, software, pay, filesTotal, total: pay + filesTotal, reputation, xp, xpLines };
  }


  /** Advances the simulation by one tick, unless paused. */
  step(): void {
    if (this.paused || this.ended) return;
    this.tick++;
    this.updateMove();
    this.updateMapper();
    this.updateScan();
    this.updateAnalysis();
    this.updateFileJob();
    this.updateAgents();
    this.updateAllies();
    this.updateAlarm();
    this.updateSignature();
  }

  setPaused(paused: boolean, auto = false): void {
    if (this.paused === paused) return;
    if (!paused && this.query) {
      this.log(`${this.agentById(this.query.agentId)?.name ?? 'an agent'} is querying you: answer first`, 'alarm1');
      return;
    }
    if (!paused && this.gateQuery) {
      this.log('the gate is asking who you are: answer first', 'alarm1');
      return;
    }
    this.paused = paused;
    this.events.push({ type: 'paused', paused, auto });
    this.log(paused ? 'paused' : 'resumed', 'system');
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setAutoPause(on: boolean): void {
    this.autoPause = on;
    this.log(on ? 'auto-pause on: time stops after every action' : 'auto-pause off', 'system');
  }

  /** In auto-pause mode, choosing a new lasting action lets time run again. */
  private actionStarted(): void {
    if (this.autoPause && this.paused) this.setPaused(false, true);
  }

  /** A lasting action (travel, a program) has ended. */
  private actionEnded(): void {
    if (this.autoPause) this.setPaused(true, true);
  }

  /** Whether the player knows this node exists (it is drawn and can be targeted). */
  isKnown(id: string): boolean {
    return this.known.has(id);
  }

  /** How many nodes are known (changes as the map is discovered). */
  get knownCount(): number {
    return this.known.size;
  }

  /** Makes every node of the system known, without identifying hidden ones. */
  revealMap(): void {
    for (const n of this.network.def.nodes) this.learn(n.id);
  }

  /** A node becomes known; a hidden one gets its ?N number in the order it was found. */
  private learn(id: string): void {
    if (this.known.has(id)) return;
    this.known.add(id);
    if (!this.identified.has(id)) this.unknownNumber.set(id, this.unknownNumber.size + 1);
  }

  /** Standing in a node shows it and its neighbours. */
  private discoverAround(id: string): void {
    this.learn(id);
    for (const n of this.network.neighbours(id)) this.learn(n.id);
  }

  /** Whether the player knows what this node is. */
  isIdentified(id: string): boolean {
    return this.identified.has(id);
  }

  /** How many nodes are identified (changes when one is revealed). */
  get identifiedCount(): number {
    return this.identified.size;
  }

  /** The node's name as the player knows it. */
  nameOf(id: string): string {
    return this.isIdentified(id) ? this.network.node(id).name : `${UNKNOWN_PREFIX}${this.unknownNumber.get(id) ?? ''}`;
  }

  /** The node's kind as the player knows it. */
  kindOf(id: string): NodeKind {
    if (!this.isIdentified(id)) return 'hidden';
    const node = this.network.node(id);
    return node.kind === 'honeypot' ? (node.disguise ?? 'database') : node.kind;
  }

  /**
   * Finds a node by what the player can see: the name or id of an identified node,
   * or ?N for an unidentified one. A bare "?" works when exactly one neighbour is unknown.
   */
  findNode(query: string): NodeDef | undefined {
    const q = query.trim().toLowerCase();
    if (q.startsWith(UNKNOWN_PREFIX)) {
      const unknown = (n: NodeDef) => !this.isIdentified(n.id);
      if (q === UNKNOWN_PREFIX) {
        const near = this.network.neighbours(this.currentNode).filter(unknown);
        return near.length === 1 ? near[0] : undefined;
      }
      return this.network.def.nodes.find((n) => this.isKnown(n.id) && unknown(n) && this.nameOf(n.id).toLowerCase() === q);
    }
    const node = this.network.find(q);
    return node && this.isKnown(node.id) && this.isIdentified(node.id) ? node : undefined;
  }

  /** Actions available in the current node, as the player sees them. */
  get currentActions(): NodeAction[] {
    return actionsFor(this.kindOf(this.currentNode));
  }

  /** Runs a node action in the current node. Returns false if it could not be used. */
  runAction(id: string): boolean {
    const action = this.currentActions.find((x) => x.id === id.trim().toLowerCase());
    if (!action) {
      this.log(`no action "${id}" here`, 'alarm1');
      return false;
    }
    if (this.move) {
      this.log('cannot do that while connecting', 'alarm1');
      return false;
    }
    if (this.network.node(this.currentNode).kind === 'honeypot') {
      this.outcome({ kind: 'player' }, false, 'HONEYPOT!');
      this.log('HONEYPOT: this node was a trap. alarm raised (alarms come later)', 'alarm3');
      return true;
    }
    if (action.requires && !this.privileges.has(action.requires)) {
      this.log(`${action.id}: requires ${action.requires} privilege`, 'alarm1');
      return false;
    }
    if (action.id === 'download-map') {
      const before = this.identified.size;
      this.revealMap();
      for (const n of this.network.def.nodes) this.identified.add(n.id);
      this.outcome({ kind: 'player' }, true, 'MAP DOWNLOADED');
      this.log(`map downloaded: ${this.identified.size - before} hidden nodes identified`, 'info');
      return true;
    }
    this.outcome({ kind: 'player' }, true, action.id.toUpperCase());
    this.log(`${action.id}: ${action.result}`, 'info');
    return true;
  }

  get isMoving(): boolean {
    return this.move !== null;
  }

  /** The node the hop in progress leads to, if any. */
  get nextHop(): string | null {
    return this.move?.to ?? null;
  }

  /** Progress of the hop in progress, 0..1 (0 when not moving). */
  get hopProgress(): number {
    return this.move ? this.move.elapsed / this.move.total : 0;
  }

  /** Hop progress part way into the next tick (for smooth drawing). */
  hopProgressAt(alpha: number): number {
    if (!this.move) return 0;
    const step = this.move.gate === 'back' ? -alpha : this.move.gate === 'asking' ? 0 : alpha;
    return Math.max(0, Math.min(1, (this.move.elapsed + step) / this.move.total));
  }

  /** Final destination of the current travel, if any. */
  get moveTarget(): string | null {
    return this.route[this.route.length - 1] ?? this.move?.to ?? null;
  }

  /**
   * Starts travelling to a node. Neighbours are reached in one hop; other
   * nodes are reached hop by hop along the shortest path.
   * Returns false if the target cannot be reached.
   */
  travelTo(target: string): boolean {
    if (!this.network.has(target) || !this.isKnown(target)) return false;
    if (this.isBusy) {
      this.log(`${this.busyName} is running: wait for it or stop it first`, 'alarm1');
      return false;
    }
    const start = this.move ? this.move.to : this.currentNode;
    if (target === this.currentNode && !this.move) return false;
    // Routes only go through nodes the player knows.
    const path = this.network.path(start, target, (id) => this.isKnown(id));
    if (target !== start && path.length === 0) return false;
    this.route = path;
    if (!this.move) this.startNextHop();
    this.actionStarted();
    return true;
  }

  /** Stops after the hop in progress. */
  cancelTravel(): void {
    this.route = [];
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** How many times each gate (by link) caught you lying this run. */
  private gateStrikes = new Map<string, number>();
  /** The gate stopping you and asking who you are, if any. */
  gateQuery: { to: string; strikes: number } | null = null;

  /** The gate's vigilance: higher with the system's security and the alarm. Placeholder numbers. */
  private get gateVigilance(): number {
    const security = this.network.def.security ?? 1;
    return (0.25 + 0.25 * security) * (1 + 0.5 * this.alarm);
  }

  /**
   * Chance in % that the gate on a link stops you and asks who you are: its vigilance, raised by how well
   * agents know your signature, against your hide program. Placeholder numbers.
   */
  gateBlockChance(): number {
    return versus(this.gateVigilance * (1 + this.signature), this.hideRating + 1);
  }

  /** Chance in % that a deceive program fools the gate (placeholder: rating against vigilance x 2). */
  gateDeceiveChance(rating: number): number {
    return versus(rating, this.gateVigilance * 2);
  }

  /** Chance in % that a warrior program breaks the gate (placeholder: rating against 1 + security). */
  gateBreakChance(rating: number): number {
    return versus(rating, 1 + (this.network.def.security ?? 1));
  }

  /** Answers the gate's query: show a privilege, deceive it, break it, or back off. */
  answerGate(choice: 'present' | 'deceive' | 'attack' | 'back'): boolean {
    const q = this.gateQuery;
    const move = this.move;
    if (!q || !move) {
      this.log('no gate is asking you anything', 'system');
      return false;
    }
    const key = gateKey(this.currentNode, q.to);
    const pass = (text: string) => {
      this.gateQuery = null;
      move.gate = 'passed';
      this.outcome({ kind: 'player' }, true, text);
      this.actionStarted();
    };
    if (choice === 'present') {
      if (!this.privileges.size) {
        this.log('you hold no privilege to show', 'alarm1');
        return false;
      }
      this.log(`you show your ${[...this.privileges].join(' / ')} privilege. the gate lets you through`, 'info');
      pass('ACCEPTED');
      return true;
    }
    if (choice === 'back') {
      this.gateQuery = null;
      move.gate = 'back';
      this.route = [];
      this.log(`you back off from the gate to ${this.nameOf(q.to)}`, 'system');
      this.raiseAlarm(1);
      this.actionStarted();
      return true;
    }
    if (choice === 'deceive') {
      const program = this.findProgram('deceive');
      if (!program) {
        this.log('no deceive program in your gear', 'alarm1');
        return false;
      }
      if (this.d100() <= this.gateDeceiveChance(program.rating)) {
        this.feats.push('deceive');
        this.log(`${program.name}: the gate is deceived and lets you through`, 'info');
        pass('DECEIVED');
        return true;
      }
      q.strikes++;
      this.gateStrikes.set(key, q.strikes);
      this.outcome({ kind: 'player' }, false, 'NOT FOOLED');
      if (q.strikes === 1) {
        this.log(`${program.name}: the gate saw through it. it asks again`, 'alarm1');
        this.raiseAlarm(1);
      } else {
        this.log(`${program.name}: the gate saw through it again and sounds the alarm`, 'alarm3');
        this.raiseAlarm(3);
      }
      return true;
    }
    // Attacking the gate: the whole system knows at once.
    const program = this.findProgram('warrior');
    if (!program) {
      this.log('no warrior program in your gear', 'alarm1');
      return false;
    }
    this.log(`${program.name} goes for the gate`, 'alarm2');
    this.raiseAlarm(3);
    if (this.d100() <= this.gateBreakChance(program.rating)) {
      this.network.breakGate(this.currentNode, q.to);
      this.log(`${program.name}: the gate to ${this.nameOf(q.to)} is destroyed`, 'info');
      pass('GATE DOWN');
    } else {
      this.outcome({ kind: 'player' }, false, 'GATE HOLDS');
      this.log(`${program.name}: the gate holds`, 'alarm2');
    }
    return true;
  }

  private startNextHop(): void {
    const to = this.route.shift();
    if (!to) return;
    const gated = this.network.hasGate(this.currentNode, to);
    this.move = { to, elapsed: 0, total: MOVE_TICKS, gate: gated ? 'ahead' : undefined };
    this.events.push({ type: 'hop', nodeId: to });
    this.log(`connecting to ${this.nameOf(to)}...`);
  }

  private updateMove(): void {
    const move = this.move;
    if (!move) return;
    if (move.gate === 'asking') return; // waiting at the gate for your answer
    if (move.gate === 'back') {
      // Backing off from the gate: walk back into the node.
      move.elapsed -= 1;
      if (move.elapsed <= 0) {
        this.move = null;
        this.actionEnded();
      }
      return;
    }
    move.elapsed++;
    // At the gate, halfway along the link: it may stop you.
    if (move.gate === 'ahead' && move.elapsed >= Math.round(move.total * GATE_POINT)) {
      move.gate = 'passed';
      const strikes = this.gateStrikes.get(gateKey(this.currentNode, move.to)) ?? 0;
      // A gate that caught you lying before asks for sure.
      if (strikes > 0 || this.d100() <= this.gateBlockChance()) {
        move.gate = 'asking';
        this.gateQuery = { to: move.to, strikes };
        this.log(`the GATE to ${this.nameOf(move.to)} STOPS YOU${strikes ? ' again' : ''}: who are you?`, 'alarm2');
        this.outcome({ kind: 'player' }, false, 'GATE');
        this.events.push({ type: 'blocked' });
        this.setPaused(true);
        return;
      }
    }
    if (move.elapsed >= move.total) {
      // Leaving a node: agents there forget the encounter, unless they know you are an enemy.
      for (const a of this.agents) {
        if (a.node === this.currentNode && a.mood !== 'hostile') {
          a.mood = 'patrol';
          a.strikes = 0;
        }
      }
      this.currentNode = move.to;
      this.move = null;
      this.events.push({ type: 'moved', nodeId: this.currentNode });
      this.log(`arrived: ${this.nameOf(this.currentNode)}`, 'info');
      this.discoverAround(this.currentNode);
      if (!this.isIdentified(this.currentNode)) {
        this.identified.add(this.currentNode);
        this.log(`node identified: ${this.nameOf(this.currentNode)}`, 'info');
      }
      this.startNextHop();
      if (!this.move) this.actionEnded();
    }
  }


  /** The mapper hop in progress, for drawing the eyes. */
  get mapperState(): { edges: [string, string][]; progress: number } | null {
    return this.mapper ? { edges: this.mapper.edges, progress: this.mapper.elapsed / MAPPER_HOP_TICKS } : null;
  }

  get isMapping(): boolean {
    return this.mapper !== null;
  }

  /** Runs a program from the deck. Returns false if it could not start. */
  /** The player's programs of one type, in deck order. */
  programsOf(type: ProgramType): Program[] {
    return this.programs.filter((p) => p.type === type && !this.released.has(p.id) && !this.lost.has(p.id));
  }

  /** Where a program is now, if not simply loaded: out as an agent, or destroyed this run. */
  programState(id: string): 'out' | 'lost' | null {
    return this.lost.has(id) ? 'lost' : this.released.has(id) ? 'out' : null;
  }

  /**
   * Picks a program of a type: no query = the highest rating; a number = the Nth
   * program of that type in the deck; otherwise its name.
   */
  findProgram(type: ProgramType, query = ''): Program | undefined {
    const list = this.programsOf(type);
    const q = query.trim().toLowerCase();
    if (!q) return [...list].sort((a, b) => b.rating - a.rating)[0];
    if (/^\d+$/.test(q)) return list[Number(q) - 1];
    return list.find((p) => p.name.toLowerCase() === q);
  }

  /** A program by its own name, whatever its type. */
  programByName(name: string): Program | undefined {
    const q = name.trim().toLowerCase();
    return this.programs.find((p) => p.name.toLowerCase() === q);
  }

  /** Mask: a new signature, so agents no longer know you. Only while no agent sees you. */
  maskSignature(program: Program): boolean {
    if (this.agentsIn(this.currentNode).length) {
      this.log(`${program.name}: an agent is watching you. get out of sight first`, 'alarm1');
      return false;
    }
    if (!this.signature) {
      this.log(`${program.name}: your signature is not known. nothing to change`, 'system');
      return false;
    }
    this.setSignature(0, `${program.name} gave you a new one`);
    this.outcome({ kind: 'player' }, true, 'NEW SIGNATURE');
    return true;
  }

  /** Runs a program of a type (see findProgram). Returns false if it could not start. */
  runProgram(type: ProgramType, query = ''): boolean {
    const program = this.findProgram(type, query);
    if (!program) {
      this.log(query ? `no ${type} program "${query}" in your gear` : `no ${type} program in your gear`, 'alarm1');
      return false;
    }
    if (this.move) {
      this.log('cannot run programs while connecting', 'alarm1');
      return false;
    }
    if (program.type === 'scan') return this.startScan(program, 0, true);
    if ((FILE_PROGRAMS as readonly string[]).includes(program.type)) {
      this.log(`${program.name}: pick a file, e.g. ${program.type} f3`, 'system');
      return false;
    }
    if (program.type === 'analyze') return this.analyzeCommand('');
    if (program.type === 'hide') {
      this.log(`${program.name} (${program.type} ${program.rating}): ${PROGRAM_STUBS[program.type]}`, 'info');
      return true;
    }
    if (program.type === 'skimmer') return this.plantSkimmer(program);
    if (program.type === 'mask') return this.maskSignature(program);
    if (program.type === 'warrior') return this.releaseWarrior(program, null);
    if (program.type === 'scout') return this.scoutCommand(program.name);
    if (program.type === 'shield') {
      this.log(`${program.name} (shield ${program.rating}): waits inside you and jumps out when you are attacked`, 'info');
      return true;
    }
    if (program.type === 'silence' || program.type === 'deceive') {
      return this.agentCommand(program.type, '', program);
    }
    if (this.isBusy) {
      this.log(`${this.busyName} is already running`, 'alarm1');
      return false;
    }
    const wait = this.mapperReadyAt - this.tick;
    if (wait > 0) {
      this.log(`${program.name}: mapper is recharging, ready in ${Math.ceil(wait / TICKS_PER_SECOND)} s`, 'alarm1');
      return false;
    }
    this.mapperReadyAt = this.tick + MAPPER_COOLDOWN;
    const here = this.currentNode;
    const { identify, extend } = mapperChances(program.rating, this.network.def.encryption ?? 1);
    this.events.push({ type: 'program', programType: program.type });
    this.noise.set(here, (this.noise.get(here) ?? 0) + MAPPER_NOISE);
    this.log(`${program.name} (mapper ${program.rating}) launched. it is loud: noise in ${this.nameOf(here)} +${MAPPER_NOISE}`, 'system');
    const neighbours = this.network.neighbours(here).map((n) => n.id);
    this.mapper = {
      depth: 1,
      edges: neighbours.map((n) => [here, n]),
      reached: new Set([here, ...neighbours]),
      elapsed: 0,
      identify,
      extend,
      progressId: this.nextProgressId++,
    };
    this.mapperProgress(false);
    this.actionStarted();
    return true;
  }

  /** Tick when the mapper can run again. */
  private mapperReadyAt = 0;

  /** Seconds until the mapper can run again (0 = ready). */
  get mapperCooldown(): number {
    return Math.max(0, Math.ceil((this.mapperReadyAt - this.tick) / TICKS_PER_SECOND));
  }

  /** A program is running (the player can't travel meanwhile). */
  get isBusy(): boolean {
    return this.mapper !== null || this.scan !== null || this.fileJob !== null;
  }

  /** What keeps the player busy, for messages. */
  private get busyName(): string {
    return this.mapper ? 'mapper' : this.scan ? 'scan' : this.fileJob?.action ?? 'nothing';
  }

  private fileJob: FileJob | null = null;

  /** Data files in a node, as the player sees them (empty for other kinds). */
  filesIn(nodeId: string): readonly DataFile[] {
    return this.files.get(nodeId) ?? [];
  }

  /** The file being scanned right now, if any. */
  get scanningFile(): { nodeId: string; fileId: string; progress: number } | null {
    const j = this.fileJob;
    if (j) return { nodeId: j.nodeId, fileId: j.fileId, progress: j.elapsed / j.ticks };
    const s = this.scan;
    if (!s) return null;
    return { nodeId: s.nodeId, fileId: this.files.get(s.nodeId)![s.queue[0]].id, progress: s.elapsed / s.ticksPerFile };
  }

  /** Changes whenever a file's look changes (for redrawing). */
  get filesKey(): string {
    const scanned = this.filesIn(this.currentNode).filter((f) => f.scanned).length;
    return `${scanned}:${this.filesChanged}:${this.scanningFile?.fileId ?? ''}`;
  }

  /**
   * The scan command. "" or "all": every encrypted file here; "fN": that one file;
   * "all fN": every encrypted file, starting at fN; anything else picks the scan program.
   */
  scanCommand(arg: string): boolean {
    const words = arg.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const files = this.filesIn(this.currentNode);
    const fileIndex = (id: string) => files.findIndex((f) => f.id === id);
    let all = true;
    let from = 0;
    let programQuery = '';
    if (words[0] === 'all') {
      if (words[1]) from = fileIndex(words[1]);
    } else if (words.length === 1 && /^f\d+$/.test(words[0])) {
      all = false;
      from = fileIndex(words[0]);
    } else {
      programQuery = arg;
    }
    const program = this.findProgram('scan', programQuery);
    if (!program) {
      this.log(programQuery ? `no scan program "${programQuery}" in your gear` : 'no scan program in your gear', 'alarm1');
      return false;
    }
    if (from < 0) {
      this.log(`no file "${words[words.length - 1]}" here`, 'alarm1');
      return false;
    }
    if (this.move) {
      this.log('cannot run programs while connecting', 'alarm1');
      return false;
    }
    return this.startScan(program, from, all);
  }

  private startScan(program: Program, from: number, all: boolean): boolean {
    const here = this.currentNode;
    const files = this.filesIn(here);
    if (!files.length) {
      this.log(`${program.name}: nothing to scan here (files live in databases)`, 'alarm1');
      return false;
    }
    if (this.isBusy) {
      this.log(`${this.busyName} is already running`, 'alarm1');
      return false;
    }
    if (this.network.node(here).kind === 'honeypot') {
      this.outcome({ kind: 'player' }, false, 'HONEYPOT!');
      this.log('HONEYPOT: this node was a trap. alarm raised (alarms come later)', 'alarm3');
      return true;
    }
    // Start at the chosen file and wrap around, skipping files already scanned.
    const order = all ? files.map((_, i) => (from + i) % files.length) : [from];
    const queue = order.filter((i) => {
      const f = files[i];
      if (f.scanned || f.deleted) return false;
      // Seals and locks stop scan before it starts; a kill switch only bites when it finishes.
      if (f.protection === 'seal' || (f.protection === 'lock' && !this.privileges.has(f.lockPrivilege!))) {
        this.log(`${f.id}: ${f.protection === 'seal' ? 'sealed, needs decrypt' : `locked, needs ${f.lockPrivilege} privilege or forge`}`, 'alarm1');
        return false;
      }
      return true;
    });
    if (!queue.length) {
      this.log(all ? 'every file here is already scanned' : `${files[from].id} is already scanned`, 'system');
      return false;
    }
    this.events.push({ type: 'program', programType: 'scan' });
    this.log(`${program.name} (scan ${program.rating}): scanning ${queue.length === 1 ? files[queue[0]].id : `${queue.length} files`}`, 'system');
    this.scan = { nodeId: here, queue, elapsed: 0, ticksPerFile: Math.max(2, Math.round(scanTicks(program.rating) / (this.keysFound ? 2 : 1))), name: program.name, rating: program.rating, progressId: this.nextProgressId++ };
    this.scanProgress(false);
    this.actionStarted();
    return true;
  }

  private scanProgress(done: boolean): void {
    const s = this.scan!;
    const file = this.files.get(s.nodeId)![s.queue[0]];
    this.events.push({ type: 'progress', line: { id: s.progressId, label: `scan ${file.id}`, progress: s.elapsed / s.ticksPerFile, done } });
  }

  private updateScan(): void {
    const s = this.scan;
    if (!s) return;
    s.elapsed++;
    this.scanProgress(s.elapsed >= s.ticksPerFile);
    if (s.elapsed < s.ticksPerFile) return;
    const file = this.files.get(s.nodeId)![s.queue.shift()!];
    if (file.protection === 'killswitch') {
      file.deleted = true;
      this.filesChanged++;
      this.outcome({ kind: 'file', id: file.id }, false, 'KILL SWITCH!');
      this.log(`${file.id}: KILL SWITCH. the archive destroyed itself`, 'alarm2');
    } else {
      file.scanned = true;
      const seen = apparentContent(file);
      this.outcome({ kind: 'file', id: file.id }, true, 'SCANNED');
      this.log(`${file.id}: ${CONTENT_LABEL[seen]}`, seen === 'worthless' ? 'system' : 'info');
    }
    if (s.queue.length) {
      s.elapsed = 0;
      s.progressId = this.nextProgressId++;
      this.scanProgress(false);
      return;
    }
    this.scan = null;
    this.log('scan finished', 'info');
    this.actionEnded();
  }

  /**
   * An action on a scanned file here: evaluate (needs an evaluate program), identify
   * (needs an identify program), download, alter or delete. It takes a moment (a loading bar);
   * the effect lands when it is done.
   */
  fileAction(action: FileAction, fileId: string): boolean {
    const id = fileId.trim().toLowerCase();
    const file = this.filesIn(this.currentNode).find((f) => f.id === id);
    if (!id || !file || file.deleted) {
      this.log(id ? `no file "${id}" here` : `usage: ${action} <file>, e.g. ${action} f3`, 'alarm1');
      return false;
    }
    const guard = file.protection ? PROTECTION_PROGRAM[file.protection] : null;
    if (!file.scanned && action !== guard) {
      this.log(`${file.id} is not scanned yet`, 'alarm1');
      return false;
    }
    if (!fileActions(file).includes(action)) {
      this.log(`${file.id} (${CONTENT_LABEL[apparentContent(file)]}): cannot ${action}`, 'alarm1');
      return false;
    }
    if (this.move || this.isBusy) {
      this.log('busy: wait for the current action to finish', 'alarm1');
      return false;
    }
    if (this.network.node(this.currentNode).kind === 'honeypot') {
      this.outcome({ kind: 'player' }, false, 'HONEYPOT!');
      this.log('HONEYPOT: this node was a trap. alarm raised (alarms come later)', 'alarm3');
      return true;
    }
    let program: Program | null = null;
    if (action === guard || action === 'evaluate' || action === 'identify') {
      program = this.findProgram(action) ?? null;
      if (!program) {
        this.log(`${action} needs ${action === guard ? 'a' : 'an'} ${action} program in your gear`, 'alarm1');
        return false;
      }
    }
    if (action === 'download' && file.downloaded) {
      this.log(`${file.id} is already downloaded`, 'system');
      return false;
    }
    if (program) this.events.push({ type: 'program', programType: program.type });
    this.fileJob = { nodeId: this.currentNode, fileId: file.id, action, program, elapsed: 0, ticks: fileActionTicks(action, program?.rating), progressId: this.nextProgressId++ };
    this.log(`${program ? `${program.name}: ` : ''}${action} ${file.id}`, 'system');
    this.fileJobProgress(false);
    this.filesChanged++;
    this.actionStarted();
    return true;
  }

  private fileJobProgress(done: boolean): void {
    const j = this.fileJob!;
    this.events.push({ type: 'progress', line: { id: j.progressId, label: `${j.action} ${j.fileId}`, progress: j.elapsed / j.ticks, done } });
  }

  private updateFileJob(): void {
    const j = this.fileJob;
    if (!j) return;
    j.elapsed++;
    const done = j.elapsed >= j.ticks;
    this.fileJobProgress(done);
    if (!done) return;
    this.fileJob = null;
    const file = this.filesIn(j.nodeId).find((f) => f.id === j.fileId);
    if (file && !file.deleted) this.finishFileAction(j.action, file, j.program);
    this.filesChanged++;
    this.actionEnded();
  }

  /** Stops a running file action; nothing happens to the file. */
  cancelFileJob(): boolean {
    if (!this.fileJob) return false;
    const j = this.fileJob;
    this.fileJobProgress(true);
    this.fileJob = null;
    this.filesChanged++;
    this.log(`${j.action} ${j.fileId} stopped`, 'system');
    return true;
  }

  /** What a file action does once its bar is full. */
  private finishFileAction(action: FileAction, file: DataFile, program: Program | null): void {
    const guard = file.protection ? PROTECTION_PROGRAM[file.protection] : null;
    if (action === guard && program) {
      const was = file.protection!;
      file.protection = undefined;
      const done = { killswitch: 'kill switch defused', seal: 'seal cracked', tracker: 'tracker scrubbed', lock: 'lock forged open' }[was];
      this.feats.push('protection');
      this.outcome({ kind: 'file', id: file.id }, true, { killswitch: 'DEFUSED', seal: 'DECRYPTED', tracker: 'SCRUBBED', lock: 'FORGED' }[was]);
      this.log(`${program.name}: ${file.id} ${done}`, 'info');
      return;
    }
    if ((action === 'evaluate' || action === 'identify') && program) {
      if (action === 'evaluate' && file.content === 'honeytoken' && this.d100() <= this.trapChance(program.rating)) {
        file.detected = true;
        this.feats.push('honeytoken');
        this.outcome({ kind: 'file', id: file.id }, true, 'TRAP FOUND');
        this.log(`${program.name}: ${file.id} is a ${CONTENT_LABEL.honeytoken}. good catch: leave it alone`, 'alarm2');
      } else if (action === 'evaluate') {
        file.evaluated = true;
        if (file.price) {
          this.outcome({ kind: 'file', id: file.id }, true, sats(file.price));
          this.log(`${program.name}: ${file.id} is worth ${sats(file.price)}`, 'info');
        } else {
          this.outcome({ kind: 'file', id: file.id }, false, 'WORTH 0');
          this.log(`${program.name}: ${file.id} is worth nothing. no need to download it`, 'system');
        }
      } else {
        file.identified = true;
        this.outcome({ kind: 'file', id: file.id }, true, 'IDENTIFIED');
        const sw = file.software!;
        this.log(`${program.name}: ${file.id} is ${sw.name} (${sw.type} ${sw.rating})`, 'info');
      }
      return;
    }
    if (action === 'download') {
      file.downloaded = true;
      const trapped = file.content === 'honeytoken';
      this.outcome({ kind: 'file', id: file.id }, !trapped && file.protection !== 'tracker', trapped ? 'TRAP!' : file.protection === 'tracker' ? 'TRACKED!' : 'DOWNLOADED');
      if (file.protection === 'tracker') {
        this.log(`TRACKER: ${file.id} tagged you on the way out`, 'alarm2');
        this.raiseAlarm(1);
      }
      if (file.content === 'honeytoken') {
        this.log(`HONEYTOKEN: ${file.id} was a trap. it phoned home with your trace`, 'alarm3');
        this.raiseAlarm(2);
        file.detected = true;
      } else if (file.content === 'software') {
        const sw = file.software!;
        this.loot.push({ name: `${this.nameOf(this.currentNode)} ${file.id}`, label: sw.name, price: 0, evaluated: true, software: { id: `p${this.nextProgramId++}`, ...sw } });
        this.log(`${file.id} downloaded: ${file.identified ? sw.name : 'a program'}. it is in your data: load it into memory to use it now (click it), or keep it for later`, 'info');
      } else {
        this.loot.push({ name: `${this.nameOf(this.currentNode)} ${file.id}`, label: CONTENT_LABEL.valuable, price: file.price ?? 0, evaluated: !!file.evaluated });
        this.log(`${file.id} downloaded to your gear. it pays out when you leave the net`, 'info');
      }
      this.deckVersion++;
      return;
    }
    if (action === 'extract') {
      file.extracted = true;
      this.outcome({ kind: 'file', id: file.id }, true, 'EXTRACTED');
      const grant = file.grant!;
      if (grant === 'keys') {
        this.keysFound = true;
        this.log(`${file.id}: encryption keys extracted. scanning in this system is now twice as fast`, 'info');
      } else {
        this.privileges.add(grant);
        this.log(`${file.id}: ${grant} privilege extracted`, 'info');
      }
      this.deckVersion++;
      return;
    }
    if (action === 'alter') {
      file.altered = true;
      this.outcome({ kind: 'file', id: file.id }, true, 'ALTERED');
      this.log(`${file.id} altered`, 'info');
    } else {
      file.deleted = true;
      this.outcome({ kind: 'file', id: file.id }, true, 'DELETED');
      this.log(`${file.id} deleted`, 'info');
    }
    if (file.content === 'contract') this.log(this.contractDone ? 'contract task done. leave the net to get paid' : 'that is not what the contract asked for', this.contractDone ? 'info' : 'alarm1');
  }

  /** The system's encryption keys were extracted: scanning here is twice as fast. */
  keysFound = false;

  /**
   * d100 chance that evaluate sees through a honeytoken: high, so a careful player is
   * safe; the trap is meant for whoever downloads blind. Evaluate 1 vs encryption 2: 80%.
   */
  private trapChance(rating: number): number {
    const e = Math.max(1, this.network.def.encryption ?? 1);
    return (100 * rating) / (rating + e / 8);
  }

  /** Bumped when a file changes in a way the view shows. */
  private filesChanged = 0;

  /** Stops a running scan; files already scanned stay scanned. */
  cancelScan(): boolean {
    if (!this.scan) return false;
    this.scanProgress(true);
    this.scan = null;
    this.log('scan stopped', 'system');
    return true;
  }

  /** Stops a running mapper; what it already found stays found. */
  cancelMapper(): boolean {
    if (!this.mapper) return false;
    this.mapperProgress(true);
    this.mapper = null;
    this.log('mapper stopped', 'system');
    return true;
  }

  private mapperProgress(done: boolean): void {
    const s = this.mapper!;
    this.events.push({
      type: 'progress',
      line: { id: s.progressId, label: `mapper hop ${s.depth}`, progress: s.elapsed / MAPPER_HOP_TICKS, done },
    });
  }

  private updateMapper(): void {
    const s = this.mapper;
    if (!s) return;
    s.elapsed++;
    this.mapperProgress(s.elapsed >= MAPPER_HOP_TICKS);
    if (s.elapsed < MAPPER_HOP_TICKS) return;

    // The eyes arrived: what they reached becomes known; hidden nodes may be identified.
    for (const [, to] of s.edges) {
      const isNew = !this.known.has(to);
      this.learn(to);
      if (isNew) this.log(`mapper: found ${this.nameOf(to)}`, 'info');
      if (this.identified.has(to)) continue;
      const name = this.nameOf(to);
      if (this.d100() <= s.identify) {
        this.identified.add(to);
        this.log(`mapper: ${name} identified: ${this.nameOf(to)} (${this.kindOf(to)})`, 'info');
      } else {
        this.log(`mapper: ${name} stays hidden`, 'system');
      }
    }

    // A good roll sends the eyes one link further.
    const frontier = [...new Set(s.edges.map(([, to]) => to))];
    const next: [string, string][] = [];
    for (const from of frontier) {
      for (const n of this.network.neighbours(from)) {
        if (s.reached.has(n.id)) continue;
        s.reached.add(n.id);
        next.push([from, n.id]);
      }
    }
    if (next.length && this.d100() <= s.extend) {
      this.log(`mapper: strong signal, looking ${s.depth + 1} links away`, 'info');
      s.depth++;
      s.edges = next;
      s.elapsed = 0;
      s.progressId = this.nextProgressId++;
      this.mapperProgress(false);
      return;
    }
    this.mapper = null;
    this.outcome({ kind: 'player' }, true, 'MAPPED');
    this.log('mapper finished', 'info');
    this.actionEnded();
  }

  log(text: string, color: LogColor = 'normal'): void {
    this.events.push({ type: 'log', line: { text, color } });
  }
}

/** Memory of the starting hardware, in GB. */
export const DEFAULT_MEMORY = 500;

/** The deck a new player starts with. */
export const STARTING_PROGRAMS: Program[] = [
  { id: 'p1', type: 'mapper', name: 'Hawkeye V2', rating: 3 },
  { id: 'p2', type: 'mapper', name: 'Owl 1.0', rating: 1 },
  { id: 'p3', type: 'warrior', name: 'Shooter V3', rating: 1 },
  { id: 'p4', type: 'hide', name: 'Ghost 1.2', rating: 1 },
  { id: 'p6', type: 'scan', name: 'Probe 1.0', rating: 1 },
  { id: 'p7', type: 'evaluate', name: 'Appraiser 1.0', rating: 1 },
  { id: 'p8', type: 'identify', name: 'Inspector 1.0', rating: 1 },
  { id: 'p9', type: 'defuse', name: 'Sapper 1.0', rating: 1 },
  { id: 'p10', type: 'decrypt', name: 'Lockpick 1.0', rating: 1 },
  { id: 'p11', type: 'scrub', name: 'Bleach 1.1', rating: 1 },
  { id: 'p12', type: 'forge', name: 'Mimic 1.0', rating: 1 },
  { id: 'p13', type: 'silence', name: 'Hush 1.0', rating: 1 },
  { id: 'p14', type: 'deceive', name: 'Mirage 1.0', rating: 1 },
  { id: 'p15', type: 'analyze', name: 'Profiler 1.0', rating: 1 },
  { id: 'p16', type: 'skimmer', name: 'Skimmer 1.0', rating: 1, efficiency: 1, detection: 2 },
  { id: 'p17', type: 'shield', name: 'Aegis 1.0', rating: 1 },
  { id: 'p18', type: 'scout', name: 'Sparrow 1.0', rating: 1 },
  { id: 'p19', type: 'mask', name: 'Chameleon 1.0', rating: 1 },
];
