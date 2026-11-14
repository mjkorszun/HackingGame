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
  /** Its family: a program gets at most one trait of each. */
  family?: string;
}

/**
 * A kind of trait. Most scale: every trait point spent on it adds `perPoint` to its value (shown in
 * whole numbers, up to `max`), so two variants can get +12% speed and -22% noise, or +15% and -17%.
 * Some are fixed: they cost `min` points and do one thing.
 */
export interface TraitFamily {
  family: string;
  /** Fewest points it takes (for a fixed one, what it costs). */
  min: number;
  perPoint?: number;
  max?: number;
  /** Scaling: the text for a value, and the pattern that reads the value back. */
  fmt?: (v: number) => string;
  match?: RegExp;
  /** Fixed: its text. */
  text?: string;
  effect: (v: number) => Partial<StatTrait>;
}

/** Traits of each trainable type (placeholder numbers, more to come). */
export const TYPE_TRAITS: Partial<Record<ProgramType, TraitFamily[]>> = {
  scout: [
    { family: 'speed', min: 5, perPoint: 1, max: 60, fmt: (v) => `+${v}% speed`, match: /^\+(\d+)% speed$/, effect: (v) => ({ mul: { speed: 1 + v / 100 } }) },
    { family: 'accuracy', min: 6, perPoint: 0.5, max: 30, fmt: (v) => `+${v} accuracy`, match: /^\+(\d+) accuracy$/, effect: (v) => ({ add: { accuracy: v } }) },
    { family: 'cooldown', min: 5, perPoint: 1, max: 50, fmt: (v) => `-${v}% cooldown`, match: /^-(\d+)% cooldown$/, effect: (v) => ({ mul: { cooldown: 1 - v / 100 } }) },
    { family: 'noise', min: 4, perPoint: 1.5, max: 75, fmt: (v) => `-${v}% noise`, match: /^-(\d+)% noise$/, effect: (v) => ({ mul: { noise: 1 - v / 100 } }) },
    { family: 'instances', min: 5, perPoint: 2, max: 90, fmt: (v) => `-${v}% additional instance cost`, match: /^-(\d+)% additional instance cost$/, effect: (v) => ({ extraMul: 1 - v / 100 }) },
    { family: 'databases', min: 20, text: 'always identifies databases', effect: () => ({ sure: ['database'] }) },
    { family: 'gateways', min: 30, text: 'always identifies gateways and relays', effect: () => ({ sure: ['gateway', 'relay'] }) },
  ],
};

/** The trait a program's trait line stands for, if its type has it. */
export function traitOf(type: ProgramType, line: string): StatTrait | undefined {
  for (const f of TYPE_TRAITS[type] ?? []) {
    if (f.text === line) return { text: line, family: f.family, ...f.effect(0) };
    const m = f.match?.exec(line);
    if (m) return { text: line, family: f.family, ...f.effect(Number(m[1])) };
  }
  return undefined;
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

/** Trait points each rarity gets (placeholder). */
export const TRAIT_POINTS: Record<Rarity, number> = { common: 0, uncommon: 30, rare: 50, epic: 70, legendary: 100 };

/** How far the pool can land either way from the rarity's points (20%). */
export const TRAIT_POINT_SPREAD = 0.2;

/** Most traits a program of each rarity gets (placeholder). */
export const MAX_TRAITS: Record<Rarity, number> = { common: 0, uncommon: 2, rare: 3, epic: 4, legendary: 6 };

/**
 * Traits for a program of this rarity. A type with its own traits spends the rarity's points: a random
 * number of different traits, up to the rarity's most (each needs its fewest points), then the points left are shared out at
 * random among the ones that scale. Other types still draw a number of traits from the general pool.
 */
export function rollTypeTraits(type: ProgramType, rarity: Rarity, fallback: readonly string[], roll: () => number = Math.random): string[] {
  const own = TYPE_TRAITS[type];
  if (!own) {
    const pool = [...fallback];
    const out: string[] = [];
    for (let i = 0; i < RARITY_TRAITS[rarity] && pool.length; i++) out.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
    return out;
  }
  if (!TRAIT_POINTS[rarity]) return [];
  // The pool itself is partly random: 80% to 120% of the rarity's points (uncommon 24 to 36).
  const points = Math.round(TRAIT_POINTS[rarity] * (1 - TRAIT_POINT_SPREAD + 2 * TRAIT_POINT_SPREAD * roll()));
  const most = MAX_TRAITS[rarity];
  const want = 1 + Math.floor(roll() * most);
  const left = [...own];
  const chosen: TraitFamily[] = [];
  let spent = 0;
  while (chosen.length < want && left.length) {
    const fits = left.filter((f) => spent + f.min <= points);
    if (!fits.length) break;
    const f = fits[Math.floor(roll() * fits.length)];
    left.splice(left.indexOf(f), 1);
    chosen.push(f);
    spent += f.min;
  }
  // Points left over need a trait that scales to go into.
  if (!chosen.some((f) => f.perPoint) && chosen.length < most) {
    const f = left.find((x) => x.perPoint && spent + x.min <= points);
    if (f) {
      chosen.push(f);
      spent += f.min;
    }
  }
  const scaling = chosen.filter((f) => f.perPoint);
  const extra = new Map<TraitFamily, number>(scaling.map((f) => [f, 0]));
  for (let i = 0; i < points - spent && scaling.length; i++) {
    const f = scaling[Math.floor(roll() * scaling.length)];
    extra.set(f, extra.get(f)! + 1);
  }
  return chosen.map((f) => (f.text ?? f.fmt!(Math.min(f.max ?? Infinity, Math.round((f.min + extra.get(f)!) * f.perPoint!)))));
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
  const v: Program = { ...base, id: `v${number}`, name: `${base.name.split('#')[0]}#${String(number).padStart(3, '0')}`, rarity, traits: rollTypeTraits(base.type, rarity, fallback, roll) };
  if (rarity !== 'legendary') delete v.author;
  else v.author = base.author ?? 'you';
  if (base.stats) v.stats = { ...base.stats };
  if (base.compute) v.compute = { ...base.compute };
  if (base.bugs) v.bugs = [...base.bugs];
  return v;
}
