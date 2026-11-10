import { Network } from './network';
import type { LogColor, SimEvent, SystemDef } from './types';

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

  constructor(system: SystemDef) {
    this.network = new Network(system);
    this.currentNode = system.entry;
    this.log(`link up: ${system.name} (${system.location})`, 'system');
    this.log(`you are at ${this.network.node(this.currentNode).name}`);
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
    this.log(`connecting to ${this.network.node(to).name}...`);
  }

  private updateMove(): void {
    const move = this.move;
    if (!move) return;
    move.elapsed++;
    if (move.elapsed >= move.total) {
      this.currentNode = move.to;
      this.move = null;
      this.events.push({ type: 'moved', nodeId: this.currentNode });
      this.log(`arrived: ${this.network.node(this.currentNode).name}`, 'info');
      this.startNextHop();
    }
  }


  log(text: string, color: LogColor = 'normal'): void {
    this.events.push({ type: 'log', line: { text, color } });
  }
}
