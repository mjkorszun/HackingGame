import type { Program, ProgramType } from './programs';

/** What a data file turns out to hold once scanned. contract: data a contract needs altered or deleted. */
export type FileContent = 'worthless' | 'valuable' | 'software' | 'contract';

export interface DataFile {
  /** f1, f2, ... within its node. */
  id: string;
  content: FileContent;
  scanned: boolean;
  /** valuable: its price in credits, fixed when the file is made; shown once evaluated. */
  price?: number;
  evaluated?: boolean;
  /** software: the program inside; its details show once identified. */
  software?: Omit<Program, 'id'>;
  identified?: boolean;
  /** contract: what the contract wants done with it. */
  need?: 'alter' | 'delete';
  /** Done to this file: downloaded (a copy taken), altered or deleted. */
  downloaded?: boolean;
  altered?: boolean;
  deleted?: boolean;
}

/** Actions a file offers once scanned. */
export type FileAction = 'evaluate' | 'identify' | 'download' | 'alter' | 'delete';

export function fileActions(f: DataFile): FileAction[] {
  if (!f.scanned || f.deleted) return [];
  switch (f.content) {
    case 'valuable':
      return ['evaluate', 'download'];
    case 'software':
      return ['identify', 'download'];
    case 'contract':
      return f.altered ? [] : [f.need!];
    default:
      return [];
  }
}

const SOFTWARE_NAMES: Record<string, string[]> = {
  attack: ['Mace 15', 'Charge 2.1', 'Rocket Launcher V007'],
  hide: ['Shade 3.0', 'Mirage V2'],
  scout: ['Kestrel 1.4', 'Periscope V5'],
  scan: ['Trawler 2.2', 'Sonar 1.1'],
  decrypt: ['Skeleton Key 3', 'Crowbar 1.9'],
};

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

/** Placeholder content: 6-12 files, mostly worthless, some valuable, a few programs, rarely contract data. */
export function generateFiles(nodeId: string): DataFile[] {
  const rand = seeded(nodeId);
  const count = 6 + Math.floor(rand() * 7);
  return Array.from({ length: count }, (_, i) => {
    const r = rand();
    const content: FileContent = r < 0.58 ? 'worthless' : r < 0.86 ? 'valuable' : r < 0.95 ? 'software' : 'contract';
    const file: DataFile = { id: `f${i + 1}`, content, scanned: false };
    if (content === 'valuable') file.price = 100 * (1 + Math.floor(rand() * 40));
    if (content === 'software') {
      const types = Object.keys(SOFTWARE_NAMES) as ProgramType[];
      const type = types[Math.floor(rand() * types.length)];
      const names = SOFTWARE_NAMES[type];
      file.software = { type, name: names[Math.floor(rand() * names.length)], rating: 1 + Math.floor(rand() * 4) };
    }
    if (content === 'contract') file.need = rand() < 0.5 ? 'alter' : 'delete';
    return file;
  });
}

export const CONTENT_LABEL: Record<FileContent, string> = {
  worthless: 'worthless',
  valuable: 'valuable data',
  software: 'software',
  contract: 'contract data',
};
