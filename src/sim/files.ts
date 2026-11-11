/** What a data file turns out to hold once scanned. */
export type FileContent = 'worthless' | 'valuable' | 'program';

export interface DataFile {
  /** f1, f2, ... within its node. */
  id: string;
  content: FileContent;
  scanned: boolean;
}

/** Placeholder: ticks to scan one file with a rating-1 scan program. */
export const SCAN_TICKS = 12;

/** Ticks to scan one file with a program of this rating. */
export function scanTicks(rating: number): number {
  return Math.max(3, Math.round(SCAN_TICKS / Math.max(1, rating)));
}

/** A small seeded generator, so a node holds the same files every run. */
function seeded(text: string): () => number {
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Placeholder content: 6-12 files, mostly worthless, some valuable, a few programs. */
export function generateFiles(nodeId: string): DataFile[] {
  const rand = seeded(nodeId);
  const count = 6 + Math.floor(rand() * 7);
  return Array.from({ length: count }, (_, i) => {
    const r = rand();
    const content: FileContent = r < 0.6 ? 'worthless' : r < 0.9 ? 'valuable' : 'program';
    return { id: `f${i + 1}`, content, scanned: false };
  });
}

export const CONTENT_LABEL: Record<FileContent, string> = {
  worthless: 'worthless',
  valuable: 'valuable data',
  program: 'a program',
};
