/**
 * Hardware is wired into your head: you jack into the net through your spinal cord, and every
 * piece of hardware is a chip in a socket somewhere in the brain. A socket takes any chip of a kind
 * that fits there. Chips come from a fixed catalogue of models by different makers: two memory
 * chips of the same size can still differ in speed, noise, strain and reliability. Putting a chip
 * in (surgery) takes days to recover. Nothing has effects in the net yet, except memory size.
 *
 * All numbers here are placeholders.
 */
import { RARITIES, type Rarity } from './development';

export type SocketId =
  | 'spine1'
  | 'spine2'
  | 'brainstem'
  | 'thalamus'
  | 'hippocampus'
  | 'frontal'
  | 'motor'
  | 'parietal'
  | 'visual1'
  | 'visual2'
  | 'cerebellum';

export type ChipKind =
  | 'jack'
  | 'surge'
  | 'damper'
  | 'bio'
  | 'memory'
  | 'processor'
  | 'attack'
  | 'stealth'
  | 'analysis'
  | 'trace'
  | 'defense';

export interface KindInfo {
  name: string;
  about: string;
  /** The main number of this kind of chip, and its unit. */
  stat: string;
  unit: string;
  /** Main number by rarity tier (common → legendary). */
  tiers: number[];
  /** Days of recovery after the surgery, before the maker's own speed. */
  surgery: number;
  /** Price in sats of a common chip, before the maker's prices. */
  price: number;
  /** Icon (game-icons name) for this kind of chip. */
  icon: string;
}

export const KINDS: Record<ChipKind, KindInfo> = {
  jack: { name: 'Neural Jack', about: 'the plug you jack into the net with. bandwidth: faster downloads, decrypts and program loading', stat: 'bandwidth', unit: '×', tiers: [1, 1.5, 2, 3, 4], surgery: 3, price: 40, icon: 'usb-key' },
  surge: { name: 'Surge Suppressor', about: 'blocks surges coming down the cable, so attacks damage your implants less', stat: 'surge block', unit: '%', tiers: [10, 20, 30, 45, 60], surgery: 1, price: 25, icon: 'lightning-shield' },
  damper: { name: 'Neural Damper', about: 'filters pain and neural shocks before they reach the cortex: less damage to your brain', stat: 'shock filter', unit: '%', tiers: [10, 20, 30, 45, 60], surgery: 2, price: 35, icon: 'brain-freeze' },
  bio: { name: 'Bio Monitor', about: 'watches your body and brain, and pulls you out of the net before your integrity hits zero', stat: 'dump at integrity', unit: '%', tiers: [5, 10, 15, 20, 25], surgery: 1, price: 20, icon: 'heart-beats' },
  memory: { name: 'Memory', about: 'holds the programs you take into the net', stat: 'capacity', unit: 'GB', tiers: [500, 750, 1000, 1500, 2000], surgery: 2, price: 30, icon: 'save' },
  processor: { name: 'Neural Processor', about: 'thinking power: how many program instances (agents) you run at once without slowing down', stat: 'agents', unit: '', tiers: [2, 3, 4, 6, 8], surgery: 3, price: 50, icon: 'cpu' },
  attack: { name: 'Attack Module', about: 'boosts all attack programs', stat: 'attack', unit: '+', tiers: [1, 2, 3, 4, 5], surgery: 2, price: 35, icon: 'fist' },
  stealth: { name: 'Stealth Module', about: 'boosts all stealth programs', stat: 'stealth', unit: '+', tiers: [1, 2, 3, 4, 5], surgery: 2, price: 35, icon: 'invisible' },
  analysis: { name: 'Analysis Module', about: 'boosts all analysis programs', stat: 'analysis', unit: '+', tiers: [1, 2, 3, 4, 5], surgery: 2, price: 35, icon: 'magnifying-glass' },
  trace: { name: 'Trace Monitor', about: 'an overlay in your sight: shows how well agents know you, and slows your detection', stat: 'detection slowdown', unit: '%', tiers: [10, 15, 25, 35, 50], surgery: 1, price: 25, icon: 'radar-sweep' },
  defense: { name: 'Defense Module', about: 'boosts all defensive programs', stat: 'defense', unit: '+', tiers: [1, 2, 3, 4, 5], surgery: 2, price: 35, icon: 'checked-shield' },
};

export interface Socket {
  id: SocketId;
  /** The socket's name: the part of the brain or spine it is in. */
  name: string;
  /** Kinds of chips that fit this socket. */
  fits: ChipKind[];
}

export const SOCKETS: readonly Socket[] = [
  { id: 'spine1', name: 'Spinal cord I', fits: ['jack', 'surge'] },
  { id: 'spine2', name: 'Spinal cord II', fits: ['jack', 'surge'] },
  { id: 'brainstem', name: 'Brainstem', fits: ['bio'] },
  { id: 'thalamus', name: 'Thalamus', fits: ['damper'] },
  { id: 'hippocampus', name: 'Hippocampus', fits: ['memory'] },
  { id: 'frontal', name: 'Frontal cortex', fits: ['processor'] },
  { id: 'motor', name: 'Motor cortex', fits: ['attack'] },
  { id: 'parietal', name: 'Parietal cortex', fits: ['stealth'] },
  { id: 'visual1', name: 'Visual cortex I', fits: ['analysis', 'trace'] },
  { id: 'visual2', name: 'Visual cortex II', fits: ['analysis', 'trace'] },
  { id: 'cerebellum', name: 'Cerebellum', fits: ['defense'] },
];

/**
 * Side numbers every chip has, besides its main one, so two chips of the same kind and size differ:
 * speed (+% how fast it works), noise (+% to how fast agents detect you), strain (max integrity
 * it costs your brain) and reliability (% it works when it counts).
 */
export interface ChipSides {
  speed: number;
  noise: number;
  strain: number;
  reliability: number;
}

export interface Maker {
  name: string;
  /** One line on what the maker is known for. */
  blurb: string;
  price: number;
  surgery: number;
  sides: ChipSides;
  /** Best rarity the maker sells (tier 0-4). */
  top: number;
  /** Their model series names. */
  series: string[];
  /** The maker's colour, on its name and its chips. */
  color: string;
}

export const MAKERS: readonly Maker[] = [
  { name: 'Orbis Medical', blurb: 'clinical grade: gentle on the brain, quick recovery, pricey', price: 1.4, surgery: 0.7, sides: { speed: 0, noise: 0, strain: -1, reliability: 6 }, top: 4, series: ['Clarity', 'Meridian', 'Vita'], color: '#dff0ff' },
  { name: 'Volkov Cybernetics', blurb: 'cheap and tough, but loud and hard on the body', price: 0.75, surgery: 1.4, sides: { speed: 5, noise: 8, strain: 2, reliability: 0 }, top: 3, series: ['VX', 'Bulat', 'Taiga'], color: '#ff5a4a' },
  { name: 'Haruna Bioworks', blurb: 'quiet bio-organic implants that take a while to grow in', price: 1.1, surgery: 1.5, sides: { speed: -5, noise: -8, strain: 0, reliability: 3 }, top: 4, series: ['Shizuka', 'Koi', 'Mori'], color: '#7fd36a' },
  { name: 'Arclight Labs', blurb: 'overclocked and fast, runs hot and fails now and then', price: 1.2, surgery: 1, sides: { speed: 15, noise: 4, strain: 2, reliability: -8 }, top: 4, series: ['Flare', 'Spark', 'Arc'], color: '#ffd84a' },
  { name: 'Tianwei Neural', blurb: 'mass-market chips: nothing special, nothing bad', price: 0.9, surgery: 1, sides: { speed: 0, noise: 0, strain: 0, reliability: 0 }, top: 2, series: ['TN', 'Jade', 'Lotus'], color: '#4ad8d0' },
  { name: 'Kessler Neurotech', blurb: 'military surplus: strong and reliable, but noisy', price: 1.25, surgery: 1.2, sides: { speed: 5, noise: 6, strain: 1, reliability: 8 }, top: 4, series: ['K-Series', 'Bastion', 'Warden'], color: '#c8a86a' },
  { name: 'Synaptiq', blurb: 'stealth specialists: the quietest chips money can buy', price: 1.5, surgery: 1, sides: { speed: 0, noise: -12, strain: 0, reliability: 2 }, top: 4, series: ['Whisper', 'Hush', 'Veil'], color: '#a98cff' },
  { name: 'Grey Ward', blurb: 'back-alley clinic stock: dirt cheap, long recovery, no guarantees', price: 0.5, surgery: 2, sides: { speed: 0, noise: 3, strain: 3, reliability: -12 }, top: 2, series: ['GW', 'Alley', 'Patch'], color: '#a8b0b4' },
];

export interface ChipModel {
  id: string;
  kind: ChipKind;
  name: string;
  maker: string;
  rarity: Rarity;
  /** The kind's main number (capacity, bandwidth...). */
  value: number;
  sides: ChipSides;
  /** Days of recovery after it is put in. */
  surgery: number;
  /** List price in sats. */
  price: number;
}

/** A small seeded random generator, so the catalogue is the same in every game. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRICE_TIER = [1, 2.5, 6, 15, 40];
const CODE: Record<ChipKind, string> = { jack: 'J', surge: 'S', damper: 'D', bio: 'B', memory: 'M', processor: 'P', attack: 'A', stealth: 'X', analysis: 'N', trace: 'T', defense: 'G' };

/** The chips you start with: the bare minimum to go online. */

/** Every chip model that exists, built once from a fixed seed: each maker makes a few models of most kinds. */
function buildCatalogue(): ChipModel[] {
  const roll = mulberry(2050);
  const out: ChipModel[] = [];
  for (const kind of Object.keys(KINDS) as ChipKind[]) {
    const k = KINDS[kind];
    for (const m of MAKERS) {
      if (roll() < 0.3) continue; // not every maker makes every kind
      const tiers = [0, 1, 2, 3, 4].filter((t) => t <= m.top && roll() < [0.9, 0.7, 0.5, 0.35, 0.25][t]);
      for (const t of tiers) {
        const jitter = () => Math.round((roll() - 0.5) * 6);
        const sides: ChipSides = {
          speed: m.sides.speed + jitter(),
          noise: m.sides.noise + jitter(),
          strain: Math.max(0, m.sides.strain + Math.round((roll() - 0.3) * 3)),
          reliability: Math.min(99, 85 + m.sides.reliability + t * 2 + jitter()),
        };
        const series = m.series[Math.floor(roll() * m.series.length)];
        const value = k.tiers[t];
        const num = kind === 'memory' ? `${value}` : `${CODE[kind]}${t + 1}${Math.floor(roll() * 9)}`;
        out.push({
          id: `${m.name.split(' ')[0].toLowerCase()}-${kind}-${t}-${series.toLowerCase().replace(/\W/g, '')}`,
          kind,
          name: `${series} ${num}`,
          maker: m.name,
          rarity: RARITIES[t],
          value,
          sides,
          surgery: Math.max(1, Math.round(k.surgery * m.surgery + t * 0.5)),
          price: Math.round(k.price * PRICE_TIER[t] * m.price),
        });
      }
    }
  }
  // Two models can roll the same id: keep the first.
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.id) && seen.add(c.id));
}

export const CATALOGUE: readonly ChipModel[] = buildCatalogue();

/** What you start with: the cheapest everyday models, from Tianwei, the mass-market maker. */
export const STARTER_CHIPS: Record<'jack' | 'memory', ChipModel> = {
  jack: CATALOGUE.find((c) => c.id === 'tianwei-jack-0-tn')!,
  memory: CATALOGUE.find((c) => c.id === 'tianwei-memory-0-jade')!,
};

/** Old saves started with chips that no longer exist: these replace them. */
export const RENAMED_CHIPS: Record<string, string> = { 'stock-jack': 'tianwei-jack-0-tn', 'stock-memory': 'tianwei-memory-0-jade' };

/** Colour of a maker (chips you start with are clinic issue: light blue). */
export function makerColor(maker: string): string {
  return MAKERS.find((m) => m.name === maker)?.color ?? '#8fc0ff';
}

export function chipById(id: string): ChipModel | undefined {
  return CATALOGUE.find((c) => c.id === id);
}

/** A chip's main number with its unit, e.g. "500 GB", "×1.5", "+2", "30%". */
export function chipValue(c: ChipModel): string {
  const u = KINDS[c.kind].unit;
  if (u === '×') return `×${c.value}`;
  if (u === '+') return `+${c.value}`;
  if (u === '%') return `${c.value}%`;
  return u ? `${c.value} ${u}` : `${c.value}`;
}

export function socketsFor(kind: ChipKind): Socket[] {
  return SOCKETS.filter((s) => s.fits.includes(kind));
}

export interface MarketOffer {
  chip: ChipModel;
  price: number;
}

const OFFER_WEIGHTS = [50, 28, 14, 6, 2];

/**
 * Today's market: a handful of chips at prices that swing around the list price. Decided by the
 * game code and the day, so it stays the same until the next day.
 */
export function marketOffers(code: string, day: number, count = 9): MarketOffer[] {
  let seed = day * 7919;
  for (const ch of code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const roll = mulberry(seed);
  const pool = CATALOGUE.filter((c) => c.maker !== 'clinic issue');
  const picked: MarketOffer[] = [];
  for (let tries = 0; picked.length < count && tries < 500; tries++) {
    let r = roll() * 100;
    let tier = 0;
    while (tier < 4 && r >= OFFER_WEIGHTS[tier]) r -= OFFER_WEIGHTS[tier++];
    const options = pool.filter((c) => c.rarity === RARITIES[tier] && !picked.some((o) => o.chip.id === c.id));
    if (!options.length) continue;
    const chip = options[Math.floor(roll() * options.length)];
    picked.push({ chip, price: Math.max(1, Math.round(chip.price * (0.8 + roll() * 0.5))) });
  }
  return picked;
}

/** What a dealer pays for a chip you sell (placeholder: 40% of the list price). */
export function sellPrice(c: ChipModel): number {
  return Math.max(1, Math.round(c.price * 0.4));
}

/** Days to take a chip out (placeholder). */
export const REMOVE_DAYS = 1;
