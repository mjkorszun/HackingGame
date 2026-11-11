import { actionsFor, type NodeAction, type Privilege } from './actions';
import { Network } from './network';
import { SCOUT_HOP_TICKS, SCOUT_NOISE, scoutChances, type Program, type ProgramType } from './programs';
import type { LogColor, NodeDef, NodeKind, SimEvent, SystemDef } from './types';

/** Unidentified nodes are called ?1, ?2, ... */
export const UNKNOWN_PREFIX = '?';

export const TICKS_PER_SECOND = 10;

/** Placeholder: how long one hop between nodes takes. To be tuned later. */
export const MOVE_TICKS = 10;

/** A d100 roll: 1..100. Success when roll <= chance. */
export type Rng = () => number;

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
  paused = false;
  /** Half-turn mode: time stops by itself whenever a lasting action ends. */
  autoPause = false;
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
  /** Programs in the player's deck. */
  readonly programs: Program[] = [
    { id: 'p1', type: 'scout', name: 'Hawkeye V2', rating: 3 },
    { id: 'p2', type: 'scout', name: 'Owl 1.0', rating: 1 },
  ];
  /** Noise the player made in each node. Nothing reacts to it yet. */
  readonly noise = new Map<string, number>();

  private scout: ScoutTask | null = null;
  private nextProgressId = 1;
  private readonly d100: () => number;

  constructor(system: SystemDef, rng: Rng = Math.random) {
    this.d100 = () => Math.floor(rng() * 100) + 1;
    this.network = new Network(system);
    this.currentNode = system.entry;
    for (const n of system.nodes) if (!n.hidden || n.id === system.entry) this.identified.add(n.id);
    this.discoverAround(this.currentNode);
    this.log(`link up: ${system.name} (${system.location})`, 'system');
    this.log(`you are at ${this.nameOf(this.currentNode)}`);
  }

  /** Advances the simulation by one tick, unless paused. */
  step(): void {
    if (this.paused) return;
    this.tick++;
    this.updateMove();
    this.updateScout();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.events.push({ type: 'paused', paused });
    this.log(paused ? 'paused' : 'resumed', 'system');
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setAutoPause(on: boolean): void {
    this.autoPause = on;
    this.log(on ? 'auto-pause on: time stops after every action' : 'auto-pause off', 'system');
  }

  /** A lasting action (travel, a program) has ended. */
  private actionEnded(): void {
    if (this.autoPause) this.setPaused(true);
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
    if (this.scout) {
      this.log('scout is running: wait for it or stop it first', 'alarm1');
      return false;
    }
    const start = this.move ? this.move.to : this.currentNode;
    if (target === this.currentNode && !this.move) return false;
    // Routes only go through nodes the player knows.
    const path = this.network.path(start, target, (id) => this.isKnown(id));
    if (target !== start && path.length === 0) return false;
    this.route = path;
    if (!this.move) this.startNextHop();
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
      this.log(query ? `no ${type} program "${query}" in your deck` : `no ${type} program in your deck`, 'alarm1');
      return false;
    }
    if (this.move) {
      this.log('cannot run programs while connecting', 'alarm1');
      return false;
    }
    if (this.scout) {
      this.log('scout is already running', 'alarm1');
      return false;
    }
    const here = this.currentNode;
    const { identify, extend } = scoutChances(program.rating, this.network.def.encryption ?? 1);
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
