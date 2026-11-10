import type { NodeDef, SystemDef } from './types';

/** Read-only helper around a system definition: lookup and pathfinding. */
export class Network {
  private readonly byId = new Map<string, NodeDef>();
  private readonly adjacency = new Map<string, string[]>();

  constructor(readonly def: SystemDef) {
    for (const node of def.nodes) {
      this.byId.set(node.id, node);
      this.adjacency.set(node.id, []);
    }
    for (const [a, b] of def.links) {
      if (!this.byId.has(a) || !this.byId.has(b)) {
        throw new Error(`Link ${a}-${b} points to an unknown node`);
      }
      this.adjacency.get(a)!.push(b);
      this.adjacency.get(b)!.push(a);
    }
    if (!this.byId.has(def.entry)) throw new Error(`Unknown entry node ${def.entry}`);
  }

  node(id: string): NodeDef {
    const node = this.byId.get(id);
    if (!node) throw new Error(`Unknown node ${id}`);
    return node;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  neighbours(id: string): NodeDef[] {
    return (this.adjacency.get(id) ?? []).map((n) => this.node(n));
  }

  isLinked(a: string, b: string): boolean {
    return (this.adjacency.get(a) ?? []).includes(b);
  }

  /** Finds a node by id or by name (case-insensitive). */
  find(query: string): NodeDef | undefined {
    const q = query.trim().toLowerCase();
    return this.def.nodes.find((n) => n.id.toLowerCase() === q || n.name.toLowerCase() === q);
  }

  /** Shortest path (breadth-first), excluding the start node. Empty if unreachable or same node. */
  path(from: string, to: string): string[] {
    if (from === to) return [];
    const prev = new Map<string, string>([[from, from]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of this.adjacency.get(cur) ?? []) {
        if (prev.has(next)) continue;
        prev.set(next, cur);
        if (next === to) {
          const out = [to];
          let step = cur;
          while (step !== from) {
            out.unshift(step);
            step = prev.get(step)!;
          }
          return out;
        }
        queue.push(next);
      }
    }
    return [];
  }
}
