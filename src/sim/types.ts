/** Kinds of nodes available in the skeleton. More will come later. */
export type NodeKind = 'entry' | 'router' | 'auth' | 'data' | 'camera' | 'core';

export interface NodeDef {
  id: string;
  name: string;
  kind: NodeKind;
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
}

export type LogColor = 'normal' | 'info' | 'system' | 'alarm1' | 'alarm2' | 'alarm3';

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
  | { type: 'moved'; nodeId: string }
  | { type: 'paused'; paused: boolean };
