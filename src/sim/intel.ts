import type { AgentRole, Knowledge, WarriorType } from './agents';

/** A kind of agent you met in a node (agents of one kind are all alike). */
export interface AgentSighting {
  type: WarriorType;
  /** Its type's name in that system (e.g. knight). */
  typeName: string;
  /** Its type's icon in that system. */
  icon?: string;
  role: AgentRole;
  /** How much your Analyze read of this kind: nothing, part, or all. */
  known: Knowledge;
}

export const RANK: Record<Knowledge, number> = { none: 0, partial: 1, full: 2 };

/** What you know about a system from earlier runs. Saved with the account, one record per network. */
export interface NetIntel {
  /** Nodes you know exist. */
  known: string[];
  /** Nodes whose type and name you know. */
  identified: string[];
  /** Kinds of agents met in each node. */
  agents: Record<string, AgentSighting[]>;
  /** Nodes where you left a backdoor: you can enter the system there. */
  backdoors: string[];
}

export function emptyIntel(): NetIntel {
  return { known: [], identified: [], agents: {}, backdoors: [] };
}

/** Adds what a run found to what you knew before. */
export function mergeIntel(old: NetIntel | undefined, run: NetIntel): NetIntel {
  const base = old ?? emptyIntel();
  const uniq = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  const agents: Record<string, AgentSighting[]> = {};
  for (const node of new Set([...Object.keys(base.agents), ...Object.keys(run.agents)])) {
    const list = [...(base.agents[node] ?? [])];
    for (const s of run.agents[node] ?? []) {
      const had = list.find((x) => x.type === s.type);
      if (!had) list.push({ ...s });
      else if (RANK[s.known] > RANK[had.known]) had.known = s.known;
    }
    agents[node] = list;
  }
  return { known: uniq(base.known, run.known), identified: uniq(base.identified, run.identified), agents, backdoors: uniq(base.backdoors, run.backdoors) };
}
