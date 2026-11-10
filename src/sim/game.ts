import { actionsFor, type NodeAction, type Privilege } from './actions';
import { Network } from './network';
import type { LogColor, NodeDef, NodeKind, SimEvent, SystemDef } from './types';

/** Unidentified nodes are called ?1, ?2, ... */
export const UNKNOWN_PREFIX = '?';

export const TICKS_PER_SECOND = 10;

/** Placeholder: how long one hop between nodes takes. To be tuned later. */
export const MOVE_TICKS = 10;

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
  currentNode: string;

  private move: MoveTask | null = null;
  private route: string[] = [];
  private events: SimEvent[] = [];
  private readonly identified = new Set<string>();
  /** Stable number of each hidden node in this system, used for its ?N name. */
  private readonly unknownNumber = new Map<string, number>();
  /** Privileges the player holds in this system. */
  readonly privileges = new Set<Privilege>();

  constructor(system: SystemDef) {
    this.network = new Network(system);
    this.currentNode = system.entry;
    for (const n of system.nodes) {
      if (!n.hidden || n.id === system.entry) this.identified.add(n.id);
      else this.unknownNumber.set(n.id, this.unknownNumber.size + 1);
    }
    this.log(`link up: ${system.name} (${system.location})`, 'system');
    this.log(`you are at ${this.nameOf(this.currentNode)}`);
  }

  /** Advances the simulation by one tick, unless paused. */
  step(): void {
    if (this.paused) return;
    this.tick++;
    this.updateMove();
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
    return this.isIdentified(id) ? this.network.node(id).name : `${UNKNOWN_PREFIX}${this.unknownNumber.get(id)}`;
  }

  /** The node's kind as the player knows it. */
  kindOf(id: string): NodeKind {
    if (!this.isIdentified(id)) return 'unknown';
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
      return this.network.def.nodes.find((n) => unknown(n) && this.nameOf(n.id).toLowerCase() === q);
    }
    const node = this.network.find(q);
    return node && this.isIdentified(node.id) ? node : undefined;
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
      for (const n of this.network.def.nodes) this.identified.add(n.id);
      this.log(`map downloaded: ${this.identified.size - before} unknown nodes identified`, 'info');
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
    if (!this.network.has(target)) return false;
    const start = this.move ? this.move.to : this.currentNode;
    if (target === this.currentNode && !this.move) return false;
    const path = this.network.path(start, target);
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
      if (!this.isIdentified(this.currentNode)) {
        this.identified.add(this.currentNode);
        this.log(`node identified: ${this.nameOf(this.currentNode)}`, 'info');
      }
      this.startNextHop();
    }
  }


  log(text: string, color: LogColor = 'normal'): void {
    this.events.push({ type: 'log', line: { text, color } });
  }
}
