import { sats } from './money';
import { codeName, typeNames, versus, WARRIORS, type Agent } from './agents';
import { actionsFor, type NodeAction, type Privilege } from './actions';
import { apparentContent, CONTENT_LABEL, fileActions, PROTECTION_PROGRAM, generateFiles, scanTicks, type DataFile, type FileAction } from './files';
import { Network } from './network';
import { programSize, usedMemory } from './programs';
import { FILE_PROGRAMS, PROGRAM_STUBS, SCOUT_HOP_TICKS, SCOUT_NOISE, scoutChances, type Program, type ProgramType } from './programs';
import type { LogColor, NodeDef, NodeKind, SimEvent, SystemDef } from './types';

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

interface ScoutTask {
  /** Hop number: 1 = neighbours, 2 = two links away, ... */
  depth: number;
  /** Connections the eyes fly along in this hop. */
  edges: [string, string][];
  /** Every node the scout reached so far. */
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
}

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
  /** System alarm: 0 green, 1 yellow, 2 orange, 3 red. */
  alarm = 0;
  /** Ticks since the last thing that raised the alarm (yellow fades after a quiet minute). */
  private calm = 0;
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

  private scout: ScoutTask | null = null;
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
    if (this.kindOf(this.currentNode) !== 'database') {
      this.log(`${program.name}: plant it in a database (where the money moves)`, 'alarm1');
      return false;
    }
    if (this.planted) {
      this.log('a skimmer is already planted here', 'alarm1');
      return false;
    }
    this.planted = program;
    this.programs.splice(this.programs.indexOf(program), 1);
    this.deckVersion++;
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
        if (together) {
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
      if (together && a.mood === 'patrol' && !this.query) {
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

  /** Raises the system alarm to at least this level. */
  raiseAlarm(level: number): void {
    this.calm = 0;
    if (level <= this.alarm) return;
    this.alarm = level;
    const name = ['GREEN', 'YELLOW', 'ORANGE', 'RED'][level];
    this.events.push({ type: 'alarm', level });
    this.log(`ALARM ${name}`, level >= 3 ? 'alarm3' : level === 2 ? 'alarm2' : 'alarm1');
  }

  /** Passive Analyze: a roll each time an agent deals with you, until it is fully known. */
  private analyze(a: Agent): void {
    if (a.known === 'full') return;
    const program = this.findProgram('analyze');
    if (!program) return;
    const chance = versus(program.rating, a.stats.scanResist);
    const roll = this.d100();
    const got = roll <= chance / 2 ? 'full' : roll <= chance ? 'partial' : 'none';
    if (got === 'none' || (got === 'partial' && a.known === 'partial')) {
      if (a.known === 'none') this.log(`${program.name}: could not read ${a.name}`, 'system');
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
      this.log(`you show your ${[...this.privileges].join(' / ')} privilege. ${a.name} lets you be`, 'info');
      return true;
    }
    if (choice === 'ignore') {
      this.query = null;
      this.log(`you ignore ${a.name}`, 'system');
      this.strike(a);
      return true;
    }
    return this.agentCommand(choice, a.name);
  }

  /** A failed or ignored query: first time yellow and it asks again; second time red and hostile. */
  private strike(a: Agent): void {
    a.strikes++;
    if (a.strikes === 1) {
      this.raiseAlarm(1);
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
  }

  /** attack / silence / deceive an agent in your node (by name, or the one querying you, or the first one here). */
  agentCommand(type: 'attack' | 'silence' | 'deceive', target: string, program = this.findProgram(type)): boolean {
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
        this.log(`${program.name}: ${a.name} is deceived. it leaves you alone while you stay here`, 'info');
      } else {
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
        this.log(`${program.name}: ${a.name} silenced. its messages cannot leave this node`, 'info');
        if (a.mood !== 'hostile') this.makeHostile(a, false);
      } else {
        this.log(`${program.name}: silence failed on ${a.name}`, 'alarm2');
        if (a.mood !== 'hostile') this.makeHostile(a, true);
        else if (!a.silenced) this.raiseAlarm(3);
      }
      return true;
    }
    // attack
    const hit = this.d100() <= versus(program.rating, a.stats.armor);
    const damage = hit ? 10 * program.rating : 0;
    a.hp -= damage;
    if (a.hp <= 0) {
      this.agents.splice(this.agents.indexOf(a), 1);
      this.feats.push('kill');
      this.log(`${program.name}: ${a.name} destroyed${a.mood === 'hostile' ? '' : ' in one blow. no one noticed'}`, 'info');
      return true;
    }
    this.log(hit ? `${program.name}: ${a.name} hit for ${damage} (HP ${a.hp}/${a.stats.hp})` : `${program.name}: missed ${a.name}`, 'alarm2');
    if (a.mood !== 'hostile') this.makeHostile(a, true);
    else if (!a.silenced) this.raiseAlarm(3);
    return true;
  }

  private hitPlayer(a: Agent): void {
    this.integrity = Math.max(0, this.integrity - a.stats.damage);
    this.events.push({ type: 'hit' });
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
    this.scout = null;
    this.scan = null;
    this.fileJob = null;
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
    if (job && success) xpLines.push({ what: `contract done (security ${security})`, xp: 30 * security });
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
    this.updateScout();
    this.updateScan();
    this.updateFileJob();
    this.updateAgents();
    this.updateAlarm();
  }

  setPaused(paused: boolean, auto = false): void {
    if (this.paused === paused) return;
    if (!paused && this.query) {
      this.log(`${this.agentById(this.query.agentId)?.name ?? 'an agent'} is querying you: answer first`, 'alarm1');
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
      this.log(`map downloaded: ${this.identified.size - before} hidden nodes identified`, 'info');
      return true;
    }
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

  private startNextHop(): void {
    const to = this.route.shift();
    if (!to) return;
    this.move = { to, elapsed: 0, total: MOVE_TICKS };
    this.events.push({ type: 'hop', nodeId: to });
    this.log(`connecting to ${this.nameOf(to)}...`);
  }

  private updateMove(): void {
    const move = this.move;
    if (!move) return;
    move.elapsed++;
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


  /** The scout hop in progress, for drawing the eyes. */
  get scoutState(): { edges: [string, string][]; progress: number } | null {
    return this.scout ? { edges: this.scout.edges, progress: this.scout.elapsed / SCOUT_HOP_TICKS } : null;
  }

  get isScouting(): boolean {
    return this.scout !== null;
  }

  /** Runs a program from the deck. Returns false if it could not start. */
  /** The player's programs of one type, in deck order. */
  programsOf(type: ProgramType): Program[] {
    return this.programs.filter((p) => p.type === type);
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
    if (program.type === 'hide' || program.type === 'analyze') {
      this.log(`${program.name} (${program.type} ${program.rating}): ${PROGRAM_STUBS[program.type]}`, 'info');
      return true;
    }
    if (program.type === 'skimmer') return this.plantSkimmer(program);
    if (program.type === 'attack' || program.type === 'silence' || program.type === 'deceive') {
      return this.agentCommand(program.type, '', program);
    }
    if (this.isBusy) {
      this.log(`${this.busyName} is already running`, 'alarm1');
      return false;
    }
    const here = this.currentNode;
    const { identify, extend } = scoutChances(program.rating, this.network.def.encryption ?? 1);
    this.events.push({ type: 'program', programType: program.type });
    this.noise.set(here, (this.noise.get(here) ?? 0) + SCOUT_NOISE);
    this.log(`${program.name} (scout ${program.rating}) launched. it is loud: noise in ${this.nameOf(here)} +${SCOUT_NOISE}`, 'system');
    const neighbours = this.network.neighbours(here).map((n) => n.id);
    this.scout = {
      depth: 1,
      edges: neighbours.map((n) => [here, n]),
      reached: new Set([here, ...neighbours]),
      elapsed: 0,
      identify,
      extend,
      progressId: this.nextProgressId++,
    };
    this.scoutProgress(false);
    this.actionStarted();
    return true;
  }

  /** A program is running (the player can't travel meanwhile). */
  get isBusy(): boolean {
    return this.scout !== null || this.scan !== null || this.fileJob !== null;
  }

  /** What keeps the player busy, for messages. */
  private get busyName(): string {
    return this.scout ? 'scout' : this.scan ? 'scan' : this.fileJob?.action ?? 'nothing';
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
      this.log(`${file.id}: KILL SWITCH. the archive destroyed itself`, 'alarm2');
    } else {
      file.scanned = true;
      const seen = apparentContent(file);
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
      this.log(`${program.name}: ${file.id} ${done}`, 'info');
      return;
    }
    if ((action === 'evaluate' || action === 'identify') && program) {
      if (action === 'evaluate' && file.content === 'honeytoken' && this.d100() <= this.trapChance(program.rating)) {
        file.detected = true;
        this.feats.push('honeytoken');
        this.log(`${program.name}: ${file.id} is a ${CONTENT_LABEL.honeytoken}. good catch: leave it alone`, 'alarm2');
      } else if (action === 'evaluate') {
        file.evaluated = true;
        this.log(`${program.name}: ${file.id} is worth ${sats(file.price!)}`, 'info');
      } else {
        file.identified = true;
        const sw = file.software!;
        this.log(`${program.name}: ${file.id} is ${sw.name} (${sw.type} ${sw.rating})`, 'info');
      }
      return;
    }
    if (action === 'download') {
      file.downloaded = true;
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
      this.log(`${file.id} altered`, 'info');
    } else {
      file.deleted = true;
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

  /** Stops a running scout; what it already found stays found. */
  cancelScout(): boolean {
    if (!this.scout) return false;
    this.scoutProgress(true);
    this.scout = null;
    this.log('scout stopped', 'system');
    return true;
  }

  private scoutProgress(done: boolean): void {
    const s = this.scout!;
    this.events.push({
      type: 'progress',
      line: { id: s.progressId, label: `scout hop ${s.depth}`, progress: s.elapsed / SCOUT_HOP_TICKS, done },
    });
  }

  private updateScout(): void {
    const s = this.scout;
    if (!s) return;
    s.elapsed++;
    this.scoutProgress(s.elapsed >= SCOUT_HOP_TICKS);
    if (s.elapsed < SCOUT_HOP_TICKS) return;

    // The eyes arrived: what they reached becomes known; hidden nodes may be identified.
    for (const [, to] of s.edges) {
      const isNew = !this.known.has(to);
      this.learn(to);
      if (isNew) this.log(`scout: found ${this.nameOf(to)}`, 'info');
      if (this.identified.has(to)) continue;
      const name = this.nameOf(to);
      if (this.d100() <= s.identify) {
        this.identified.add(to);
        this.log(`scout: ${name} identified: ${this.nameOf(to)} (${this.kindOf(to)})`, 'info');
      } else {
        this.log(`scout: ${name} stays hidden`, 'system');
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
      this.log(`scout: strong signal, looking ${s.depth + 1} links away`, 'info');
      s.depth++;
      s.edges = next;
      s.elapsed = 0;
      s.progressId = this.nextProgressId++;
      this.scoutProgress(false);
      return;
    }
    this.scout = null;
    this.log('scout finished', 'info');
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
  { id: 'p1', type: 'scout', name: 'Hawkeye V2', rating: 3 },
  { id: 'p2', type: 'scout', name: 'Owl 1.0', rating: 1 },
  { id: 'p3', type: 'attack', name: 'Shooter V3', rating: 1 },
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
];
