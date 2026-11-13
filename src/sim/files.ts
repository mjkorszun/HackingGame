import type { Program, ProgramType } from './programs';

/** What a data file turns out to hold once scanned. contract: data a contract needs altered or deleted. */
export type FileContent = 'worthless' | 'valuable' | 'software' | 'contract' | 'honeytoken' | 'keyring';

/**
 * Extra protection on an archive, beyond its encryption. Each needs its own program:
 * killswitch (destroys itself if scanned before Defuse), seal (scan cannot read it
 * until Decrypt cracks it), tracker (downloading tags you until Scrub removes it),
 * lock (opens only with a privilege, or after Forge fakes one).
 */
export type Protection = 'killswitch' | 'seal' | 'tracker' | 'lock';

/** The program that removes each protection. */
export const PROTECTION_PROGRAM = { killswitch: 'defuse', seal: 'decrypt', tracker: 'scrub', lock: 'forge' } as const;

export const PROTECTION_LABEL: Record<Protection, string> = {
  killswitch: 'kill switch: destroys itself if scanned (defuse)',
  seal: 'sealed: scan cannot read it until decrypt cracks it',
  tracker: 'tracker: tags whoever downloads it (scrub)',
  lock: 'privilege lock (needs the privilege, or forge)',
};

/** What a keyring holds: a privilege, or the system's encryption keys. */
export type KeyringGrant = 'worker' | 'security' | 'admin' | 'keys';

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
  /** honeytoken: a trap posing as valuable data; shown for what it is only once detected. */
  detected?: boolean;
  /** keyring: what it holds, and whether it was already extracted. */
  grant?: KeyringGrant;
  extracted?: boolean;
  /** Extra protection, if any (removed by its program). */
  protection?: Protection;
  /** lock: the privilege that opens it. */
  lockPrivilege?: 'worker' | 'security' | 'admin';
  /** contract: what the contract wants done with it. */
  need?: 'alter' | 'delete';
  /** Done to this file: downloaded (a copy taken), altered or deleted. */
  downloaded?: boolean;
  altered?: boolean;
  deleted?: boolean;
}

/** Actions a file offers once scanned. */
export type FileAction = 'evaluate' | 'identify' | 'download' | 'alter' | 'delete' | 'extract' | 'defuse' | 'decrypt' | 'scrub' | 'forge';

/** What the player believes the file is: an undetected honeytoken looks valuable. */
export function apparentContent(f: DataFile): FileContent {
  return f.content === 'honeytoken' && !f.detected ? 'valuable' : f.content;
}

/** An evaluated archive that turned out to be worth nothing. */
export function isEmpty(f: DataFile): boolean {
  return apparentContent(f) === 'valuable' && !!f.evaluated && !f.price;
}

export function fileActions(f: DataFile): FileAction[] {
  if (f.deleted) return [];
  // Removing a protection works on an encrypted file too.
  const guard: FileAction[] = f.protection ? [PROTECTION_PROGRAM[f.protection]] : [];
  if (!f.scanned) return guard;
  return [...guard, ...contentActions(f)];
}

/** What a left click does on a scanned file, if anything. */
export function clickAction(f: DataFile): FileAction | undefined {
  if (f.deleted) return undefined;
  // A sealed archive must be cracked before it can be scanned.
  if (!f.scanned) return f.protection === 'seal' ? PROTECTION_PROGRAM.seal : undefined;
  switch (apparentContent(f)) {
    case 'valuable':
      if (!f.evaluated) return 'evaluate';
      return f.downloaded || isEmpty(f) ? undefined : 'download';
    case 'software':
      return f.downloaded ? undefined : 'download';
    case 'contract':
      return f.altered ? undefined : f.need;
    default:
      return undefined;
  }
}

function contentActions(f: DataFile): FileAction[] {
  switch (apparentContent(f)) {
    case 'keyring':
      return f.extracted ? [] : ['extract'];
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
  scout: ['Swift 2', 'Nighthawk 1.5'],
  shield: ['Aegis 2', 'Bulwark 1.3'],
  warrior: ['Mace 15', 'Charge 2.1', 'Rocket Launcher V007'],
  hide: ['Shade 3.0', 'Mirage V2'],
  scan: ['Glimpse 2', 'X-Ray 1.9'],
  decrypt: ['Skeleton Key 3', 'Crowbar 1.9'],
};

/** Placeholder: ticks to scan one file with a rating-1 scan program (2.4 s). */
export const SCAN_TICKS = 24;

/** Ticks to scan one file with a program of this rating. */
export function scanTicks(rating: number): number {
  return Math.max(6, Math.round(SCAN_TICKS / Math.max(1, rating)));
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

/** Price of a valuable file in a system of this security level: d30+20 sats at level 1, scaled up with the level. */
export function filePrice(security: number, rand: () => number): number {
  const level = Math.max(1, security);
  return level * (20 + 1 + Math.floor(rand() * 30));
}

/** Placeholder content: 6-12 files, mostly worthless, some valuable, a few programs and keyrings. Contract data comes from the contract. */
/** Share of archives that look valuable but turn out to be worth nothing once evaluated (placeholder). */
export const EMPTY_SHARE = 0.35;

export function generateFiles(nodeId: string, security = 1): DataFile[] {
  const rand = seeded(nodeId);
  // A separate stream, so the other rolls stay as they were.
  const emptyRoll = seeded(`${nodeId}:empty`);
  const count = 6 + Math.floor(rand() * 7);
  return Array.from({ length: count }, (_, i) => {
    const r = rand();
    const content: FileContent =
      r < 0.5 ? 'worthless' : r < 0.75 ? 'valuable' : r < 0.84 ? 'software' : r < 0.93 ? 'keyring' : 'honeytoken';
    const file: DataFile = { id: `f${i + 1}`, content, scanned: false };
    // A honeytoken carries a believable price too: that is the bait.
    if (content === 'valuable' || content === 'honeytoken') file.price = filePrice(security, rand);
    // Many archives that look valuable are worth nothing: that is what evaluate is for.
    if (content === 'valuable' && emptyRoll() < EMPTY_SHARE) file.price = 0;
    if (content === 'keyring') {
      const g = rand();
      file.grant = g < 0.5 ? 'worker' : g < 0.8 ? 'keys' : g < 0.95 ? 'security' : 'admin';
    }
    if (content === 'software') {
      const types = Object.keys(SOFTWARE_NAMES) as ProgramType[];
      const type = types[Math.floor(rand() * types.length)];
      const names = SOFTWARE_NAMES[type];
      file.software = { type, name: names[Math.floor(rand() * names.length)], rating: 1 + Math.floor(rand() * 4) };
    }
    // About one archive in four that is worth anything carries an extra protection.
    if (content !== 'worthless' && rand() < 0.25) {
      const kinds: Protection[] = ['killswitch', 'seal', 'tracker', 'lock'];
      file.protection = kinds[Math.floor(rand() * kinds.length)];
      if (file.protection === 'lock') file.lockPrivilege = rand() < 0.6 ? 'worker' : rand() < 0.8 ? 'security' : 'admin';
    }
    return file;
  });
}

export const CONTENT_LABEL: Record<FileContent, string> = {
  worthless: 'worthless',
  valuable: 'valuable data',
  software: 'software',
  contract: 'contract data',
  honeytoken: 'HONEYTOKEN (a trap)',
  keyring: 'keyring (credentials / keys)',
};
