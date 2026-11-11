/**
 * Kinds of nodes. 'hidden' is never a node's real kind: it is how a node looks
 * until it is identified (it was hidden on purpose). A 'honeypot' always shows as its disguise.
 */
export type NodeKind =
  | 'gateway'
  | 'relay'
  | 'identity'
  | 'uplink'
  | 'database'
  | 'vault'
  | 'overseer'
  | 'orchestrator'
  | 'monitoring'
  | 'compute'
  | 'camera'
  | 'ads'
  | 'physical'
  | 'vehicle'
  | 'security'
  | 'honeypot'
  | 'hidden';

export interface NodeDef {
  id: string;
  name: string;
  kind: NodeKind;
  /** For a honeypot: the node kind it pretends to be. */
  disguise?: NodeKind;
  /** Starts unidentified: shown as "?" until the player enters it. */
  hidden?: boolean;
  /** Position on the system map, used by the minimap and for direction. */
  x: number;
  y: number;
}

export interface SystemDef {
  id: string;
  name: string;
  location: string;
  entry: string;
  nodes: NodeDef[];
  /** Undirected links between node ids. */
  links: [string, string][];
  /** Links that have a gate in the middle (gates are not nodes: they sit on the connection). */
  gates?: [string, string][];
  /** How well the system hides itself; programs like Scout roll against it. */
  encryption?: number;
  /** Security level: how valuable the data kept here is (and, later, how hard it fights back). */
  security?: number;
  /** The job the player was hired for in this system. */
  contract?: ContractDef;
}

/** A contract: one task in one system, paid on success. */
export interface ContractDef {
  title: string;
  /** What must be done with the target file. */
  need: 'alter' | 'delete';
  /** Database that holds the target file. */
  node: string;
  /** Pay in sats on success. */
  pay: number;
}

import type { ProgramType } from './programs';

export type LogColor = 'normal' | 'info' | 'system' | 'command' | 'alarm1' | 'alarm2' | 'alarm3';

export interface LogLine {
  text: string;
  color: LogColor;
}

/** A log line that is rewritten in place while a task runs (e.g. a progress bar). */
export interface ProgressLine {
  id: number;
  label: string;
  progress: number; // 0..1
  done: boolean;
}

export type SimEvent =
  | { type: 'log'; line: LogLine }
  | { type: 'progress'; line: ProgressLine }
  | { type: 'hop'; nodeId: string }
  | { type: 'moved'; nodeId: string }
  /** auto: caused by auto-pause, not by the player (played without a sound). */
  | { type: 'paused'; paused: boolean; auto?: boolean }
  | { type: 'program'; programType: ProgramType };
