import type { AgentRole, WarriorType } from './agents';

/** An agent type you met in a node. */
export interface AgentSighting {
  type: WarriorType;
  /** Its type's name in that system (e.g. knight). */
  typeName: string;
  role: AgentRole;
  /** Your Analyze read its stats. */
  analyzed: boolean;
}

/** What you know about a system from earlier runs. Saved with the account, one record per network. */
export interface NetIntel {
  /** Nodes you know exist. */
  known: string[];
  /** Nodes whose type and name you know. */
  identified: string[];
  /** Agent types met in each node. */
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
      if (had) had.analyzed ||= s.analyzed;
      else list.push({ ...s });
    }
    agents[node] = list;
  }
  return { known: uniq(base.known, run.known), identified: uniq(base.identified, run.identified), agents, backdoors: uniq(base.backdoors, run.backdoors) };
}
