/**
 * Training programs (models). Train Model: you spread 20 points of Compute (5% each) over a program's
 * categories, and the base stats it comes out with lean that way, partly at random. Refine: on a base
 * you already have, the rarity and traits are rolled again into variants; you save the ones you want.
 * All numbers here are placeholders.
 */
import type { NodeKind } from './types';
import type { Program, ProgramType } from './programs';
import { RARITY_TRAITS, rollRarity, type Rarity } from './development';

/** Points of Compute to spread when you train a model; each is 5%. */
export const COMPUTE_POINTS = 20;

/** One primary stat: what you train it towards, and the range it is rolled in. */
export interface StatDef {
  key: string;
  label: string;
  /** Value with no Compute at all (weak, but it still works). */
  worst: number;
  /** Value with the most Compute. */
  best: number;
  unit: '%' | 's' | 'x' | '';
}

/** The categories of each program type that can be trained (only the scout for now). */
export const CATEGORIES: Partial<Record<ProgramType, StatDef[]>> = {
  scout: [
    { key: 'speed', label: 'speed', worst: 0.6, best: 1.8, unit: 'x' },
    { key: 'accuracy', label: 'accuracy', worst: 20, best: 90, unit: '%' },
    { key: 'cooldown', label: 'cooldown', worst: 50, best: 15, unit: 's' },
    { key: 'noise', label: 'noise', worst: 50, best: 10, unit: '' },
  ],
};

export type Stats = Record<string, number>;

/** How far the roll can land from where the Compute points it (share of the range, either way). */
export const STAT_SPREAD = 0.12;
/** Each rating above 1 nudges every stat this share of its range towards the best. */
export const RATING_NUDGE = 0.04;

/** Compute split evenly over the categories (the default on the form). */
export function evenCompute(type: ProgramType): Stats {
  const defs = CATEGORIES[type] ?? [];
  const out: Stats = {};
  defs.forEach((d, i) => { out[d.key] = Math.floor(COMPUTE_POINTS / defs.length) + (i < COMPUTE_POINTS % defs.length ? 1 : 0); });
  return out;
}

/** Where in its range a stat lands for this Compute: an even split is the middle, twice that is the best. */
function quality(points: number, count: number, rating: number): number {
  return Math.min(1, ((points / COMPUTE_POINTS) * count) / 2) + RATING_NUDGE * (rating - 1);
}

const round = (v: number, unit: StatDef['unit']) => (unit === 'x' ? Math.round(v * 100) / 100 : Math.round(v));

/** Rolls the base stats of a newly trained model. */
export function rollStats(type: ProgramType, compute: Stats, rating: number, roll: () => number = Math.random): Stats {
  const defs = CATEGORIES[type] ?? [];
  const out: Stats = {};
  for (const d of defs) {
    const q = Math.max(0, Math.min(1, quality(compute[d.key] ?? 0, defs.length, rating) + (roll() * 2 - 1) * STAT_SPREAD));
    out[d.key] = round(d.worst + (d.best - d.worst) * q, d.unit);
  }
  return out;
}

/** A trait that changes a stat (times `mul`, or plus `add`), or does something of its own. */
export interface StatTrait {
  /** What it does: also how it is shown, and how a program's trait list names it. */
  text: string;
  mul?: Stats;
  add?: Stats;
  /** Scout: times the cooldown each extra instance adds. */
  extraMul?: number;
  /** Scout: always tells these node types apart. */
  sure?: NodeKind[];
}

/** Traits of each trainable type (placeholder list, more to come). */
export const TYPE_TRAITS: Partial<Record<ProgramType, StatTrait[]>> = {
  scout: [
    { text: '+25% speed', mul: { speed: 1.25 } },
    { text: '+15 accuracy', add: { accuracy: 15 } },
    { text: '-20% cooldown', mul: { cooldown: 0.8 } },
    { text: '-40% noise', mul: { noise: 0.6 } },
    { text: '-40% additional instance cost', extraMul: 0.6 },
    { text: 'always identifies databases', sure: ['database'] },
    { text: 'always identifies gateways and relays', sure: ['gateway', 'relay'] },
  ],
};

/** The trait a program's trait line stands for, if its type has it. */
export function traitOf(type: ProgramType, line: string): StatTrait | undefined {
  return TYPE_TRAITS[type]?.find((t) => t.text === line);
}

export function traitsOf(p: Pick<Program, 'type' | 'traits'>): StatTrait[] {
  return (p.traits ?? []).map((t) => traitOf(p.type, t)).filter((t): t is StatTrait => !!t);
}

/** Base stats of a program: rolled when trained, or an even split for programs from before training. */
export function baseStats(p: Pick<Program, 'type' | 'rating' | 'stats'>): Stats {
  if (p.stats) return p.stats;
  const defs = CATEGORIES[p.type] ?? [];
  const out: Stats = {};
  for (const d of defs) out[d.key] = round(d.worst + (d.best - d.worst) * Math.min(1, 0.5 + RATING_NUDGE * (p.rating - 1)), d.unit);
  return out;
}

/** One stat as shown: its base value, and the value its traits make of it. */
export interface ShownStat {
  def: StatDef;
  base: number;
  value: number;
}

export function programStats(p: Pick<Program, 'type' | 'rating' | 'stats' | 'traits'>): ShownStat[] {
  const base = baseStats(p);
  const traits = traitsOf(p);
  return (CATEGORIES[p.type] ?? []).map((def) => {
    let v = base[def.key];
    for (const t of traits) {
      if (t.mul?.[def.key] !== undefined) v *= t.mul[def.key];
      if (t.add?.[def.key] !== undefined) v += t.add[def.key];
    }
    if (def.unit === '%') v = Math.min(100, v);
    return { def, base: base[def.key], value: round(v, def.unit) };
  });
}

/** A stat's value after traits. */
export function statOf(p: Pick<Program, 'type' | 'rating' | 'stats' | 'traits'>, key: string): number {
  return programStats(p).find((s) => s.def.key === key)?.value ?? 0;
}

export function formatStat(def: StatDef, v: number): string {
  return def.unit === 'x' ? `${v.toFixed(2)}x` : def.unit === 's' ? `${v} s` : def.unit === '%' ? `${v}%` : `${v}`;
}

/** Different traits for a program of this type: its own pool if it has one. */
export function rollTypeTraits(type: ProgramType, count: number, fallback: readonly string[], roll: () => number = Math.random): string[] {
  const own = TYPE_TRAITS[type];
  const pool: string[] = own ? own.map((t) => t.text) : [...fallback];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
  return out;
}

/** Variants Refine makes each day (placeholder; later your skills raise it). */
export const VARIANTS_PER_DAY = 2;

/** What saving a variant costs (placeholder: 5 + 10 a rating point). */
export function variantCost(p: Pick<Program, 'rating'>): number {
  return 5 + 10 * p.rating;
}

/** Refining in progress: the base, the variants waiting to be saved, and the day they were made. */
export interface Refining {
  baseId: string;
  variants: Program[];
  /** Variants not saved are lost once another day passes. */
  day: number;
  /** How many variants of this base have been made (for their #001 numbers). */
  made: number;
}

/** One new variant of a base: same base stats and bugs, the rarity and traits rolled again. */
export function makeVariant(base: Program, number: number, fallback: readonly string[], roll: () => number = Math.random): Program {
  const rarity: Rarity = rollRarity(roll);
  const v: Program = { ...base, id: `v${number}`, name: `${base.name.split('#')[0]}#${String(number).padStart(3, '0')}`, rarity, traits: rollTypeTraits(base.type, RARITY_TRAITS[rarity], fallback, roll) };
  if (rarity !== 'legendary') delete v.author;
  else v.author = base.author ?? 'you';
  if (base.stats) v.stats = { ...base.stats };
  if (base.compute) v.compute = { ...base.compute };
  if (base.bugs) v.bugs = [...base.bugs];
  return v;
}
