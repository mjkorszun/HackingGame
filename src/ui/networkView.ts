import { sats } from '../sim/money';
import { agentInfo, oddsWord, versus, WARRIORS, type Agent, type WarriorType } from '../sim/agents';
import { apparentContent, clickAction, isEmpty, CONTENT_LABEL, fileActions, PROTECTION_LABEL, type Protection, type DataFile, type FileAction } from '../sim/files';
import { Tooltip, type TipLine } from './tooltip';
import { FILE_PROGRAMS, type FileProgram, type Program } from '../sim/programs';
import type { Game } from '../sim/game';
import { SIGNATURE_NAMES, TICKS_PER_SECOND } from '../sim/game';
import type { FxTarget, NodeDef, NodeKind, SimEvent } from '../sim/types';
import type { ContextMenu } from './contextMenu';
import type { Sound } from './sound';
import { drawNodeShape, halfHeight, hasTag } from './shapes';
import { agentIcon, iconBody, iconName } from './icons';

const WARRIOR_TYPES = Object.keys(WARRIORS) as WarriorType[];
import { ALLY_HOP_TICKS, type Ally, type AllyOrder } from '../sim/game';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 560;
const CX = W / 2;
const CY = 272;
/** Size of the current node's room: its type's shape drawn at this radius. */
const ROOM_R = 125;
/** Size of the room's grid cells. */
const CELL = 29;
/** Flat or narrow shapes get a bigger room so there is still space inside. */
const ROOM_SCALE: Partial<Record<NodeKind, number>> = { monitoring: 1.3, vehicle: 1.15, compute: 1.1, camera: 1.1, uplink: 1.1, ads: 1.1 };
const NEIGHBOUR_R = 30;
/** Size of the player figure (1 = original). */
const AVATAR_SCALE = 0.8;
/** Neighbours sit on an ellipse around the room. */
const RING_X = 305;
const RING_Y = 232;

const KIND_TAG: Record<NodeKind, string> = {
  gateway: 'GW',
  relay: 'RL',
  identity: 'ID',
  uplink: 'UP',
  database: 'DB',
  payment: 'PG',
  vault: 'KEY',
  overseer: 'AI',
  orchestrator: 'ORC',
  monitoring: 'LOG',
  compute: 'CPU',
  camera: 'CAM',
  ads: 'ADS',
  physical: 'PHY',
  vehicle: 'VEH',
  security: 'SEC',
  honeypot: 'DB',
  hidden: '?',
};

const KIND_LABEL: Record<NodeKind, string> = {
  gateway: 'gateway',
  relay: 'relay',
  identity: 'identity service',
  uplink: 'uplink',
  database: 'database',
  payment: 'payment gateway',
  vault: 'key vault',
  overseer: 'overseer core (system AI)',
  orchestrator: 'orchestrator',
  monitoring: 'monitoring log',
  compute: 'compute cluster',
  camera: 'camera hub',
  ads: 'ADS control (autonomous defence)',
  physical: 'physical system control',
  vehicle: 'external vehicle control',
  security: 'security systems',
  honeypot: 'database',
  hidden: 'hidden node',
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

/** The mapper's eye: an almond with a pupil, centred on (x, y). */
function drawEye(x: number, y: number, scale: number, opacity: number, parent: Element): void {
  const g = svg('g', { class: 'mapper-eye', transform: `translate(${x} ${y}) scale(${scale})`, opacity: Math.max(0, opacity) }, parent);
  svg('path', { d: 'M -9 0 Q 0 -8 9 0 Q 0 8 -9 0 Z', class: 'mapper-eye-white' }, g);
  svg('circle', { cx: 0, cy: 0, r: 3, class: 'mapper-eye-pupil' }, g);
}

const icon = (body: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${body}</svg>`;
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
const ICON_SPEAKER_ON = icon(`${SPEAKER}<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
const ICON_SPEAKER_OFF = icon(`${SPEAKER}<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
/** Stopwatch with pause bars: time that stops by itself. */
const ICON_POWER = icon(
  '<path d="M7.5 6.5a8 8 0 1 0 9 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 3v8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
);

const ICON_AUTO_PAUSE = icon(
  '<circle cx="12" cy="13.5" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 2.5h4M12 2.5v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="9" y="10" width="2.2" height="7" fill="currentColor"/><rect x="12.8" y="10" width="2.2" height="7" fill="currentColor"/>',
);

/** The symbol drawn on an archive in place of its two lines, one per kind of protection. */
function drawProtection(p: Protection, cx: number, cy: number, parent: Element): void {
  const g = svg('g', { class: 'file-guard' }, parent);
  switch (p) {
    case 'killswitch': // exclamation mark
      svg('line', { x1: cx, y1: cy - 6, x2: cx, y2: cy + 1.5 }, g);
      svg('circle', { cx, cy: cy + 5, r: 1.3, class: 'guard-fill' }, g);
      break;
    case 'seal': // two rings
      svg('circle', { cx, cy, r: 5.5 }, g);
      svg('circle', { cx, cy, r: 2.2 }, g);
      break;
    case 'tracker': // crosshair
      svg('circle', { cx, cy, r: 4 }, g);
      svg('line', { x1: cx - 7, y1: cy, x2: cx + 7, y2: cy }, g);
      svg('line', { x1: cx, y1: cy - 7, x2: cx, y2: cy + 7 }, g);
      break;
    case 'lock': // keyhole
      svg('circle', { cx, cy: cy - 2, r: 2.6, class: 'guard-fill' }, g);
      svg('path', { d: `M ${cx - 1.6} ${cy} L ${cx - 2.6} ${cy + 5.5} L ${cx + 2.6} ${cy + 5.5} L ${cx + 1.6} ${cy} Z`, class: 'guard-fill' }, g);
      break;
  }
}

/** A price squeezed into a file cell: 900, 1.2k, 4k. */
function shortPrice(cr: number): string {
  if (cr < 1000) return String(cr);
  const k = cr / 1000;
  return `${k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
}

/** Generic program icon on a software file (each program type gets its own later): a code bracket pair. */
function drawProgramIcon(cx: number, cy: number, parent: Element): void {
  const g = svg('g', { class: 'file-guard' }, parent);
  svg('path', { d: `M ${cx - 3} ${cy - 4.5} L ${cx - 7} ${cy} L ${cx - 3} ${cy + 4.5}` }, g);
  svg('path', { d: `M ${cx + 3} ${cy - 4.5} L ${cx + 7} ${cy} L ${cx + 3} ${cy + 4.5}` }, g);
  svg('line', { x1: cx + 1.5, y1: cy - 5.5, x2: cx - 1.5, y2: cy + 5.5 }, g);
}

/** What the game tooltip says about a data file. */
function fileTip(f: DataFile): TipLine[] {
  const lines: TipLine[] = [{ text: f.id, cls: 'tip-title' }];
  if (f.protection) lines.push({ text: PROTECTION_LABEL[f.protection] + (f.protection === 'lock' ? `: ${f.lockPrivilege}` : ''), cls: 'tip-protection' });
  if (!f.scanned) {
    const hint = f.protection === 'seal' ? 'click to decrypt the seal first' : f.protection === 'lock' ? 'needs the privilege, or forge' : f.protection === 'killswitch' ? 'defuse it first, or it is lost' : 'click to scan';
    return [...lines, { text: 'encrypted', cls: 'c-system' }, { text: hint, cls: 'c-system' }];
  }
  const seen = apparentContent(f);
  lines.push({ text: CONTENT_LABEL[seen], cls: `tip-${seen}` });
  if (seen === 'keyring') lines.push({ text: f.extracted ? `extracted: ${f.grant === 'keys' ? 'encryption keys' : `${f.grant} privilege`}` : 'extract to see what it opens' });
  if (seen === 'valuable') lines.push(f.evaluated ? (f.price ? { text: `worth ${sats(f.price)}` } : { text: 'worth nothing', cls: 'tip-empty' }) : { text: 'value unknown (evaluate)' });
  if (f.content === 'software') {
    const sw = f.software!;
    lines.push({ text: f.identified ? `${sw.name}  ${sw.type} ${sw.rating}` : 'unknown program (identify)' });
  }
  if (f.content === 'contract') lines.push({ text: f.altered ? 'altered' : `the contract wants it ${f.need === 'alter' ? 'altered' : 'deleted'}` });
  if (f.downloaded) lines.push({ text: 'downloaded', cls: 'c-info' });
  const act = clickAction(f);
  if (act) lines.push({ text: `click to ${act}`, cls: 'c-system' });
  return lines;
}

function formatTime(tick: number): string {
  const total = Math.floor(tick / TICKS_PER_SECOND);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenths = tick % TICKS_PER_SECOND;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export interface ViewActions {
  /** How the player looks: an icon and its colour. */
  avatar?: { icon: string; color: string };
  travel(nodeId: string): void;
  look(nodeId: string): void;
  act(actionId: string): void;
  run(program: Program): void;
  /** Scan one file, or all encrypted files starting at it. */
  scanFile(fileId: string, all: boolean): void;
  scanAll(): void;
  fileAction(action: FileAction, fileId: string): void;
  togglePause(): void;
  mute(): void;
  autoPause(): void;
  hover(): void;
  /** Leave the net: ends the run. */
  exit(): void;
  /** Runs a console command (answers to a query, attack W1, ...). */
  command(cmd: string): void;
  sound: Sound;
}


/** Integrity colour: green when (almost) full, then yellow-green, yellow, orange and red. */
export function integrityColor(frac: number): string {
  if (frac >= 0.8) return 'var(--green)';
  if (frac >= 0.6) return '#b8f040';
  if (frac >= 0.4) return 'var(--yellow)';
  if (frac >= 0.2) return 'var(--orange)';
  return 'var(--red)';
}

/**
 * The graphical half of the screen: the current node large in the centre,
 * its neighbours around it, and a minimap. Everything is clickable.
 */
export class NetworkView {
  private readonly header: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly stage: SVGSVGElement;
  /** The minimap is its own small SVG pinned to the bottom-right corner of the view. */
  private readonly miniSvg: SVGSVGElement;
  private neighbourOrder: string[] = [];
  private lastKey = '';
  private positions = new Map<string, { x: number; y: number }>();
  private avatar: SVGGElement | null = null;
  /** Outline of the current room, used to find where links leave it. */
  private roomShape: SVGGeometryElement | null = null;
  private roomR = ROOM_R;
  private readonly tip = new Tooltip();
  /** Layers redrawn every frame with the mapper's eyes. */
  private mapperLayer: SVGGElement | null = null;
  private agentLayer: SVGGElement | null = null;
  private miniAgentLayer: SVGGElement | null = null;
  private readonly agentEls = new Map<string, { main: SVGGElement; mini: SVGGElement }>();
  private readonly allyEls = new Map<string, { main: SVGGElement; mini: SVGGElement; hp: SVGRectElement }>();
  private allyPos = new Map<string, { x: number; y: number }>();
  private alarmEl!: HTMLDivElement;
  /** The detection bar under the node's name: rebuilt with the room, filled every frame. */
  private sigBar: { root: SVGGElement; segs: SVGRectElement[]; label: SVGTextElement; tip: SVGTitleElement } | null = null;
  private sigShown = -1;
  private integrityEl!: HTMLDivElement;
  private queryBox!: HTMLDivElement;
  private queryKey = '';
  private miniMapperLayer: SVGGElement | null = null;
  /** How far the time is into the next tick: moving things are drawn that much further along. */
  private alpha = 0;
  private miniXY: (id: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });

  constructor(
    private readonly root: HTMLElement,
    private readonly game: Game,
    private readonly menu: ContextMenu,
    private readonly actions: ViewActions,
  ) {
    root.innerHTML = '';
    this.header = document.createElement('header');
    this.header.className = 'view-header';
    const sys = game.network.def;
    const title = document.createElement('div');
    title.className = 'sys-title';
    title.innerHTML = `<span class="sys-name"></span><span class="sys-loc"></span>`;
    title.querySelector('.sys-name')!.textContent = sys.name;
    title.querySelector('.sys-loc')!.textContent = sys.location;
    const alarm = document.createElement('div');
    alarm.className = 'alarm alarm-0';
    alarm.textContent = 'ALARM: GREEN';
    this.alarmEl = alarm;
    this.integrityEl = document.createElement('div');
    this.integrityEl.className = 'integrity';
    this.integrityEl.innerHTML = '<span class="integrity-label">INTEGRITY</span><span class="integrity-bar"><span class="integrity-fill"></span></span>';
    this.clock = document.createElement('div');
    this.clock.className = 'clock';
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'pause-btn';
    this.pauseBtn.title = 'Pause / resume (Space)';
    this.pauseBtn.addEventListener('click', () => actions.togglePause());
    // A spinning arc shows that time runs; it stops (yellow) while paused.
    this.pauseBtn.innerHTML = '<svg class="time-spinner" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.6"/></svg>';
    const soundBox = document.createElement('div');
    soundBox.className = 'sound-box';
    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.className = 'mute-btn';
    this.muteBtn.title = 'Sound on / off (M)';
    this.muteBtn.addEventListener('click', () => actions.mute());
    this.autoBtn = document.createElement('button');
    this.autoBtn.type = 'button';
    this.autoBtn.className = 'icon-btn auto-btn';
    this.autoBtn.title = 'Auto-pause: time stops after every action (A)';
    this.autoBtn.innerHTML = ICON_AUTO_PAUSE;
    this.autoBtn.addEventListener('click', () => actions.autoPause());
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(actions.sound.volume * 100));
    vol.className = 'volume';
    vol.title = 'Volume';
    vol.setAttribute('aria-label', 'Volume');
    vol.addEventListener('input', () => actions.sound.setVolume(Number(vol.value) / 100));
    vol.addEventListener('change', () => actions.sound.play('hop'));
    soundBox.append(this.muteBtn, vol);
    this.header.append(title, alarm, this.integrityEl, soundBox, this.clock, this.autoBtn, this.pauseBtn);

    this.stage = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'stage', role: 'img' });
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    this.miniSvg = svg('svg', { viewBox: '0 0 220 120', class: 'minimap-svg' });
    this.miniSvg.addEventListener('contextmenu', (e) => e.preventDefault());
    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'icon-btn exit-btn';
    exitBtn.title = 'Leave the net: end the run and get paid';
    exitBtn.setAttribute('aria-label', 'Leave the net');
    exitBtn.innerHTML = ICON_POWER;
    exitBtn.addEventListener('click', () => actions.exit());
    this.queryBox = document.createElement('div');
    this.queryBox.className = 'query-box';
    this.queryBox.hidden = true;
    root.append(this.header, this.stage, this.miniSvg, exitBtn, this.queryBox);
    this.render();
  }

  /** Detection: a crossed-out eye icon over a vertical bar of three segments, under the node's name. */
  private drawSignatureBar(parent: SVGGElement): void {
    const root = svg('g', { class: 'sig-bar' }, parent);
    const tip = svg('title', {}, root);
    const icon = svg('svg', { x: 12, y: 54, width: 20, height: 20, viewBox: '0 0 512 512', class: 'sig-icon' }, root);
    icon.innerHTML = iconBody('sight-disabled') ?? '';
    const label = svg('text', { x: 40, y: 69, class: 'sig-label' }, root);
    const segs: SVGRectElement[] = [];
    const SEG_H = 22;
    const GAP = 3;
    // One segment per level above anonymous, so burned fills the whole bar. Segment 0 is the bottom one.
    for (let i = 0; i < 3; i++) {
      const y = 80 + (2 - i) * (SEG_H + GAP);
      segs.push(svg('rect', { x: 15, y, width: 14, height: SEG_H, class: `sig-seg sig-seg-${i + 1}` }, root));
    }
    this.sigBar = { root, segs, label, tip };
    this.sigShown = -1;
  }

  /** The loading bar over the file being worked on, updated every frame. */
  private fileBar: { fill: SVGElement; width: number } | null = null;

  /** Where things are drawn, for effects: file centres, agents' last spots, the avatar's middle. */
  private filePos = new Map<string, { x: number; y: number }>();
  private agentPos = new Map<string, { x: number; y: number }>();
  private avatarPos = { x: CX, y: CY };
  /** Top layer for shots and outcome texts. */
  private fxLayer: SVGGElement | null = null;
  /** When a shot towards each target lands, so its outcome text waits for it. */
  private shotLands = new Map<string, number>();
  /** Outcome texts still rising over each target, so new ones stack above. */
  private fxStack = new Map<string, number>();

  private fxKey(t: FxTarget): string {
    return t.kind === 'player' ? 'player' : `${t.kind}:${t.id}`;
  }

  private fxPoint(t: FxTarget): { x: number; y: number } | null {
    if (t.kind === 'player') return this.avatarPos;
    if (t.kind === 'agent') return this.agentPos.get(t.id) ?? null;
    if (t.kind === 'ally') return this.allyPos.get(t.id) ?? null;
    if (t.kind === 'file') return this.filePos.get(t.id) ?? null;
    return t.id === this.game.currentNode ? { x: CX, y: CY } : this.positions.get(t.id) ?? null;
  }

  /** Draws a shot or an outcome text in the map view. */
  fx(ev: Extract<SimEvent, { type: 'shot' | 'outcome' }>): void {
    const layer = this.fxLayer;
    if (!layer) return;
    if (ev.type === 'shot') {
      const from = this.fxPoint(ev.from);
      const to0 = this.fxPoint(ev.to);
      if (!from || !to0) return;
      // A miss flies past the target.
      const ang = Math.atan2(to0.y - from.y, to0.x - from.x);
      const to = ev.hit || ev.recall ? to0 : { x: to0.x + Math.cos(ang) * 40 - Math.sin(ang) * 22, y: to0.y + Math.sin(ang) * 40 + Math.cos(ang) * 22 };
      const cls = ev.hostile ? 'is-hostile' : 'is-mine';
      const trail = svg('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: `fx-trail ${cls}` }, layer);
      const bolt = svg('circle', { r: 4.5, class: `fx-bolt ${cls}` }, layer);
      bolt.style.transform = `translate(${from.x}px, ${from.y}px)`;
      bolt.getBoundingClientRect();
      bolt.style.transform = `translate(${to.x}px, ${to.y}px)`;
      const flight = 220;
      this.shotLands.set(this.fxKey(ev.to), performance.now() + flight);
      setTimeout(() => {
        bolt.remove();
        trail.remove();
        if (!ev.hit || !this.fxLayer) return;
        const burst = svg('circle', { cx: to.x, cy: to.y, r: 14, class: `fx-burst ${cls}` }, this.fxLayer);
        setTimeout(() => burst.remove(), 400);
      }, flight);
      return;
    }
    const key = this.fxKey(ev.at);
    const wait = Math.max(0, (this.shotLands.get(key) ?? 0) - performance.now());
    setTimeout(() => {
      const p = this.fxPoint(ev.at);
      if (!p || !this.fxLayer) return;
      const n = this.fxStack.get(key) ?? 0;
      this.fxStack.set(key, n + 1);
      const lift = ev.at.kind === 'player' ? 34 : ev.at.kind === 'agent' || ev.at.kind === 'ally' ? 22 : 16;
      const t = svg('text', { x: p.x, y: p.y - lift - n * 16, class: `fx-text ${ev.ok ? 'is-ok' : 'is-fail'}` }, this.fxLayer);
      t.textContent = ev.text;
      setTimeout(() => {
        t.remove();
        this.fxStack.set(key, Math.max(0, (this.fxStack.get(key) ?? 1) - 1));
      }, 1500);
    }, wait);
  }

  /** Neighbour reached with number key n (1-based), in the order shown on screen. */
  neighbourByNumber(n: number): string | undefined {
    return this.neighbourOrder[n - 1];
  }

  /** Called every frame. Redraws the stage only when something visible changed. */
  update(alpha = 0): void {
    this.alpha = alpha;
    this.clock.textContent = formatTime(this.game.tick);
    this.pauseBtn.setAttribute('aria-label', this.game.paused ? 'Resume' : 'Pause');
    const muted = this.actions.sound.muted;
    if (this.muteBtn.dataset.muted !== String(muted)) {
      this.muteBtn.dataset.muted = String(muted);
      this.muteBtn.innerHTML = muted ? ICON_SPEAKER_OFF : ICON_SPEAKER_ON;
    }
    this.autoBtn.classList.toggle('is-on', this.game.autoPause);
    this.muteBtn.classList.toggle('is-muted', this.actions.sound.muted);
    this.header.classList.toggle('is-paused', this.game.paused);
    const key = `${this.game.currentNode}|${this.game.moveTarget}|${this.game.paused}|${this.game.identifiedCount}|${this.game.knownCount}|${this.game.filesKey}`;
    if (key !== this.lastKey) this.render();
    this.updateAvatar();
    this.updateMapper();
    this.updateAgents();
    this.updateQuery();
    const lvl = this.game.alarm;
    if (this.alarmEl.dataset.level !== String(lvl)) {
      this.alarmEl.dataset.level = String(lvl);
      this.alarmEl.className = `alarm alarm-${lvl}`;
      // Other parts of the view (network name, exit button, frames) take the alarm colour too.
      this.root.dataset.alarm = String(lvl);
      this.alarmEl.textContent = `ALARM: ${['GREEN', 'YELLOW', 'ORANGE', 'RED'][lvl]}`;
    }
    const sig = this.game.signature;
    if (this.sigBar && this.sigShown !== sig) {
      this.sigShown = sig;
      const b = this.sigBar;
      b.root.dataset.level = String(sig);
      // Filled from the bottom: anonymous = empty, burned = full.
      b.segs.forEach((r, i) => r.classList.toggle('is-on', i < sig));
      b.label.textContent = SIGNATURE_NAMES[sig].toUpperCase();
      b.tip.textContent = `Detection: ${SIGNATURE_NAMES[sig]}. ` + [
        'nobody knows your signature',
        'agents are a bit wary of you',
        'agents are on guard',
        'every agent that sees you attacks at once',
      ][sig] + '. it drops while no agent sees you; Mask resets it';
    }
    const integ = `Integrity ${this.game.integrity}/${this.game.maxIntegrity}: at 0 you are thrown out of the net`;
    if (this.integrityEl.title !== integ) {
      this.integrityEl.title = integ;
      const frac = Math.max(0, this.game.integrity / this.game.maxIntegrity);
      const fill = this.integrityEl.querySelector<HTMLElement>('.integrity-fill')!;
      fill.style.width = `${frac * 100}%`;
      this.integrityEl.style.setProperty('--integ', integrityColor(frac));
    }
    const busy = this.game.scanningFile;
    if (this.fileBar && busy) this.fileBar.fill.setAttribute('width', String(this.fileBar.width * Math.min(1, busy.progress)));
  }

  private render(): void {
    const g = this.game;
    this.fileBar = null;
    this.filePos.clear();
    this.agentPos.clear();
    this.fxStack.clear();
    this.lastKey = `${g.currentNode}|${g.moveTarget}|${g.paused}|${g.identifiedCount}|${g.knownCount}|${g.filesKey}`;
    this.stage.innerHTML = '';
    const current = g.network.node(g.currentNode);
    const neighbours = g.network.neighbours(current.id);
    const positions = this.layoutNeighbours(current, neighbours);
    this.neighbourOrder = positions.map((p) => p.node.id);
    const target = g.moveTarget;

    const links = svg('g', { class: 'links' }, this.stage);
    this.drawStubs(current, positions, links);
    // The room comes first so the doors can be found on its outline; the links group stays behind it.
    this.drawRoom(current, positions);
    for (const p of positions) {
      const active = target !== null && (p.node.id === target || g.network.path(current.id, target)[0] === p.node.id);
      const door = this.doorTowards(p.x, p.y);
      svg('line', { x1: door.x, y1: door.y, x2: p.x, y2: p.y, class: active ? 'link link-active' : 'link' }, links);
      if (g.network.hasGate(current.id, p.node.id)) this.drawGate((door.x + p.x) / 2, (door.y + p.y) / 2, Math.atan2(p.y - door.y, p.x - door.x), links);
    }

    positions.forEach((p, i) => {
      const isTarget = target !== null && g.network.path(current.id, target)[0] === p.node.id;
      this.drawNode(p.node, p.x, p.y, NEIGHBOUR_R, {
        current: false,
        targeted: isTarget,
        number: i + 1,
      });
    });
    this.positions = new Map(positions.map((p) => [p.node.id, { x: p.x, y: p.y }]));
    this.avatar = this.drawAvatar();
    this.updateAvatar(true);
    this.agentLayer = svg('g', { class: 'agent-layer' }, this.stage);
    this.mapperLayer = svg('g', { class: 'mapper-layer' }, this.stage);
    this.drawMinimap();
    this.agentEls.clear();
    this.allyEls.clear();
    // Effects outlive a redraw (a finished download redraws the files), so the layer is kept and put back on top.
    if (this.fxLayer) this.stage.appendChild(this.fxLayer);
    else this.fxLayer = svg('g', { class: 'fx-layer' }, this.stage);
    this.updateMapper();
    this.updateAgents();
  }

  /** Where an agent in a node is drawn: in the room around you, or beside a neighbour. */
  private agentSpot(nodeId: string, index: number): { x: number; y: number } | null {
    // Several agents in one node stand in a column (then a second one), so their code names don't overlap.
    if (nodeId === this.game.currentNode) return { x: CX + 55 + Math.floor(index / 4) * 70, y: CY - 60 + (index % 4) * 60 };
    const p = this.positions.get(nodeId);
    return p ? { x: p.x + NEIGHBOUR_R * 0.75 + Math.floor(index / 3) * 62, y: p.y - NEIGHBOUR_R * 0.75 + (index % 3) * 56 } : null;
  }

  /** Agents move every tick: their dots are kept and only moved, so hover and menus keep working. */
  private updateAgents(): void {
    const layer = this.agentLayer;
    const mini = this.miniAgentLayer;
    if (!layer || !mini) return;
    const g = this.game;
    const seen = new Set<string>();
    const count = new Map<string, number>();
    for (const a of g.agents) {
      seen.add(a.id);
      let els = this.agentEls.get(a.id);
      if (!els) {
        els = { main: this.drawAgent(a, layer), mini: svg('circle', { r: 3.2, class: `mini-agent is-${a.stats.type}` }, mini) as unknown as SVGGElement };
        this.agentEls.set(a.id, els);
      }
      let pos: { x: number; y: number } | null;
      let miniPos: { x: number; y: number } | null;
      if (a.hop) {
        const from = a.node === g.currentNode ? { x: CX, y: CY } : this.positions.get(a.node);
        const to = a.hop.to === g.currentNode ? { x: CX, y: CY } : this.positions.get(a.hop.to);
        const k = Math.min(1, (a.hop.elapsed + this.alpha) / a.stats.hopTicks);
        pos = from && to ? { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k } : null;
        const m1 = this.miniXY(a.node);
        const m2 = this.miniXY(a.hop.to);
        miniPos = pos ? { x: m1.x + (m2.x - m1.x) * k, y: m1.y + (m2.y - m1.y) * k } : null;
      } else {
        const i = count.get(a.node) ?? 0;
        count.set(a.node, i + 1);
        pos = this.agentSpot(a.node, i);
        miniPos = pos ? this.miniXY(a.node) : null;
      }
      els.main.style.display = pos ? '' : 'none';
      if (pos) {
        // Drawn every frame along its link; a short transition only smooths jumps between spots in a node.
        els.main.classList.toggle('is-hopping', !!a.hop);
        els.main.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
        this.agentPos.set(a.id, pos);
      }
      els.main.classList.toggle('is-querying', g.query?.agentId === a.id);
      els.main.classList.toggle('is-hostile', a.mood === 'hostile');
      // Calm (patrol), unsure (asking you, or you failed it once), alert (system alarm orange or red), hostile.
      // The ring shows the warier of: what the agent itself is doing, and how known your signature is.
      const own = a.mood === 'hostile' ? 3 : g.query?.agentId === a.id || a.strikes > 0 ? 1 : 0;
      const sigLevel = a.mood === 'trusting' ? 0 : g.signature;
      const attitude = (['calm', 'unsure', 'alert', 'hostile'] as const)[Math.max(own, sigLevel)];
      if (els.main.dataset.attitude !== attitude) els.main.dataset.attitude = attitude;
      els.main.classList.toggle('is-trusting', a.mood === 'trusting');
      els.main.classList.toggle('is-silenced', a.silenced);
      const frac = Math.max(0, a.hp / a.stats.hp);
      els.main.classList.toggle('is-hurt', frac < 1);
      if (frac < 1) {
        const bar = els.main.querySelector<SVGRectElement>('.agent-hp')!;
        bar.setAttribute('width', (24 * frac).toFixed(1));
        bar.style.fill = integrityColor(frac);
      }
      els.mini.style.display = miniPos ? '' : 'none';
      if (miniPos) {
        els.mini.setAttribute('cx', miniPos.x.toFixed(1));
        els.mini.setAttribute('cy', miniPos.y.toFixed(1));
      }
    }
    for (const [id, els] of this.agentEls) {
      if (seen.has(id)) continue;
      els.main.remove();
      els.mini.remove();
      this.agentEls.delete(id);
    }
    this.updateAllies(layer, mini);
  }

  /** Your warriors in this node. */
  private warriorsHere(): number {
    return this.game.allies.filter((x) => x.node === this.game.currentNode && !x.hop && x.program.type === 'warrior').length;
  }

  /** Where one of your agents stands: to your left in your node, or beside a neighbour. */
  private allySpot(nodeId: string, index: number): { x: number; y: number } | null {
    if (nodeId === this.game.currentNode) return { x: CX - 60 - Math.floor(index / 4) * 64, y: CY - 30 + (index % 4) * 38 };
    const p = this.positions.get(nodeId);
    return p ? { x: p.x - NEIGHBOUR_R * 0.75 - Math.floor(index / 3) * 60, y: p.y - NEIGHBOUR_R * 0.75 + (index % 3) * 34 } : null;
  }

  private updateAllies(layer: SVGGElement, mini: SVGGElement): void {
    const g = this.game;
    const seen = new Set<string>();
    const count = new Map<string, number>();
    for (const a of g.allies) {
      seen.add(a.id);
      let els = this.allyEls.get(a.id);
      if (!els) {
        els = this.drawAlly(a, layer, mini);
        this.allyEls.set(a.id, els);
      }
      let pos: { x: number; y: number } | null;
      let miniPos: { x: number; y: number } | null;
      if (a.hop) {
        const from = a.node === g.currentNode ? { x: CX, y: CY } : this.positions.get(a.node);
        const to = a.hop.to === g.currentNode ? { x: CX, y: CY } : this.positions.get(a.hop.to);
        const k = Math.min(1, (a.hop.elapsed + this.alpha) / ALLY_HOP_TICKS);
        pos = from && to ? { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k } : null;
        const m1 = this.miniXY(a.node);
        const m2 = this.miniXY(a.hop.to);
        miniPos = { x: m1.x + (m2.x - m1.x) * k, y: m1.y + (m2.y - m1.y) * k };
      } else if (a.program.type === 'shield' && a.node === g.currentNode && !g.isMoving) {
        // A shield circles you.
        const t = performance.now() / 700;
        pos = { x: this.avatarPos.x + Math.cos(t) * 56, y: this.avatarPos.y + Math.sin(t) * 38 };
        miniPos = this.miniXY(a.node);
      } else {
        const i = count.get(a.node) ?? 0;
        count.set(a.node, i + 1);
        pos = this.allySpot(a.node, i);
        miniPos = this.miniXY(a.node);
      }
      els.main.classList.toggle('is-shield', a.program.type === 'shield');
      els.main.classList.toggle('is-resident', !!a.resident);
      els.main.style.display = pos ? '' : 'none';
      if (pos) {
        els.main.classList.toggle('is-hopping', !!a.hop || (a.program.type === 'shield' && !a.hop));
        els.main.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
        this.allyPos.set(a.id, pos);
      }
      els.hp.setAttribute('width', String(Math.max(0, 24 * (a.hp / a.maxHp))));
      els.main.dataset.order = a.order;
      els.mini.setAttribute('cx', miniPos.x.toFixed(1));
      els.mini.setAttribute('cy', miniPos.y.toFixed(1));
    }
    for (const [id, els] of this.allyEls) {
      if (seen.has(id)) continue;
      els.main.remove();
      els.mini.remove();
      this.allyEls.delete(id);
    }
  }

  /** One of your agents: a green ring with its program's icon, its name and an HP bar. */
  private drawAlly(a: Ally, parent: Element, mini: Element): { main: SVGGElement; mini: SVGGElement; hp: SVGRectElement } {
    const grp = svg('g', { class: 'ally', 'data-ally': a.id }, parent) as SVGGElement;
    svg('circle', { r: 13, class: 'ally-body' }, grp);
    const icon = svg('svg', { x: -9, y: -9, width: 18, height: 18, viewBox: '0 0 512 512', class: 'ally-icon' }, grp);
    if (a.program.color) icon.style.color = a.program.color;
    icon.innerHTML = iconBody(iconName(a.program)) ?? '';
    svg('rect', { x: -12, y: -21, width: 24, height: 3, class: 'ally-hp-bg' }, grp);
    const hp = svg('rect', { x: -12, y: -21, width: 24, height: 3, class: 'ally-hp' }, grp);
    const label = svg('text', { x: 0, y: 25, class: 'ally-name' }, grp);
    label.textContent = a.program.name;
    const dot = svg('circle', { r: 3.2, class: 'mini-ally' }, mini) as unknown as SVGGElement;
    this.tip.attach(grp, () => {
      const live = this.game.allies.find((x) => x.id === a.id);
      if (!live) return [{ text: a.program.name, cls: 'tip-title' }];
      if (live.resident) return [{ text: `${live.program.name}: your ${live.program.type}`, cls: 'tip-title' }, { text: `planted here: takes a cut every day (x${live.program.efficiency ?? 1}, ${live.program.detection ?? 5}% a day to be found)`, cls: 'c-info' }];
      const order = { stay: 'holds its node', follow: 'follows you', unload: 'coming back to you', explore: 'exploring on its own' }[live.order];
      return [{ text: `${live.program.name}: your ${live.program.type} ${live.program.rating}`, cls: 'tip-title' }, { text: `HP ${live.hp}/${live.maxHp}` }, { text: order, cls: 'c-info' }, { text: 'right-click: stay / follow / unload', cls: 'c-system' }];
    });
    grp.addEventListener('mouseenter', () => this.actions.hover());
    grp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const live = this.game.allies.find((x) => x.id === a.id);
      if (!live || live.resident) return;
      const item = (order: AllyOrder, label: string, hint: string) => ({ label, hint: live.order === order ? 'now' : hint, disabled: live.order === order, action: () => this.actions.command(`${order} ${live.program.name}`) });
      this.menu.show(e.clientX, e.clientY, `${live.program.name} (yours)`, [
        item('stay', 'Stay', 'hold this node'),
        item('follow', 'Follow', 'go where you go'),
        item('unload', 'Unload', 'back into your memory'),
        ...(live.program.type === 'scout' ? [item('explore', 'Explore', 'fly on to unknown nodes')] : []),
      ]);
    });
    return { main: grp, mini: dot, hp };
  }

  /** A warrior: a dot with a small sword inside, coloured by its type. */
  private drawAgent(a: Agent, parent: Element): SVGGElement {
    const grp = svg('g', { class: `agent is-${a.stats.type}`, 'data-agent': a.id }, parent) as SVGGElement;
    // Its attitude: a ring of four segments that spins, faster the warier it is.
    svg('circle', { r: 15, class: 'agent-ring' }, grp);
    svg('circle', { r: 11, class: 'agent-body' }, grp);
    const icon = svg('svg', { x: -7, y: -7, width: 14, height: 14, viewBox: '0 0 512 512', class: 'agent-icon' }, grp);
    icon.innerHTML = iconBody(agentIcon(this.game.network.def.id, WARRIOR_TYPES.indexOf(a.stats.type))) ?? '';
    // Integrity bar over its head, shown once it has taken damage.
    svg('rect', { x: -12, y: -24, width: 24, height: 3, class: 'agent-hp-bg' }, grp);
    svg('rect', { x: -12, y: -24, width: 24, height: 3, class: 'agent-hp' }, grp);
    const label = svg('text', { x: 0, y: 31, class: 'agent-name' }, grp);
    label.textContent = a.name;
    const alert = svg('text', { x: 0, y: -26, class: 'agent-alert' }, grp);
    alert.textContent = '!';
    this.tip.attach(grp, () => {
      const live = this.game.agentById(a.id);
      if (!live) return [{ text: a.name, cls: 'tip-title' }];
      const [head, ...rest] = agentInfo(live);
      const mood = live.mood === 'hostile' ? 'HOSTILE' : live.mood === 'trusting' ? 'fooled: leaves you alone here' : 'on patrol';
      return [{ text: head, cls: 'tip-title' }, { text: mood + (live.silenced ? ', silenced' : ''), cls: live.mood === 'hostile' ? 'tip-honeytoken' : 'c-system' }, ...rest.map((t) => ({ text: t }))];
    });
    grp.addEventListener('mouseenter', () => this.actions.hover());
    grp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const live = this.game.agentById(a.id);
      if (!live) return;
      const here = live.node === this.game.currentNode && !live.hop && !this.game.isMoving;
      const odds = (type: 'warrior' | 'silence', resist: number) => {
        const p = this.game.findProgram(type);
        if (!p) return `needs ${type}`;
        return live.known === 'none' ? 'odds unknown' : oddsWord(versus(p.rating, resist));
      };
      this.menu.show(e.clientX, e.clientY, `${live.name}: ${live.stats.kind}`, [
        { label: 'Attack', hint: here ? (this.warriorsHere() ? 'your warriors here' : this.game.findProgram('warrior') ? `release ${this.game.findProgram('warrior')!.name}` : 'needs a warrior') : 'not in your node', disabled: !here || (!this.warriorsHere() && !this.game.findProgram('warrior')), action: () => this.actions.command(`attack ${live.name}`) },
        { label: 'Silence', hint: here ? odds('silence', live.stats.silenceResist) : 'not in your node', disabled: !here || live.silenced || !this.game.findProgram('silence'), action: () => this.actions.command(`silence ${live.name}`) },
      ]);
    });
    return grp;
  }

  /** The query window: who asks, what you know about it, and how you can answer. */
  private updateQuery(): void {
    const g = this.game;
    const a = g.query ? g.agentById(g.query.agentId) : undefined;
    const key = a ? `${a.id}|${a.known}|${a.strikes}|${g.privileges.size}|${g.programs.length}|${g.deckVersion}` : '';
    if (key === this.queryKey) return;
    this.queryKey = key;
    this.queryBox.hidden = !a;
    if (!a) return;
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    const odds = (type: 'deceive' | 'silence' | 'warrior', resist: number): string => {
      const p = g.findProgram(type);
      if (!p) return `needs a ${type} program`;
      return a.known === 'none' ? `${p.name}: odds unknown` : `${p.name}: odds ${oddsWord(versus(p.rating, resist))}`;
    };
    const warrior = g.findProgram('warrior');
    const mine = this.warriorsHere();
    const options: { cmd: string; label: string; hint: string; disabled?: boolean }[] = [
      { cmd: 'present', label: 'Show privilege', hint: g.privileges.size ? `you hold: ${[...g.privileges].join(', ')}` : 'you hold no privilege', disabled: !g.privileges.size },
      { cmd: 'deceive', label: 'Deceive', hint: `${odds('deceive', a.stats.deceiveResist)}. if it fails: ${a.strikes ? 'RED alarm, hostile' : 'yellow alarm, it asks again'}`, disabled: !g.findProgram('deceive') },
      { cmd: 'silence', label: 'Silence', hint: `${odds('silence', a.stats.silenceResist)}. hostile, but no alarm leaves the node`, disabled: !g.findProgram('silence') },
      { cmd: 'attack', label: 'Warrior', hint: mine ? 'your warriors here attack it. a kill in one blow is quiet' : warrior ? `release ${odds('warrior', a.stats.armor)}. it fights for you; a kill in one blow is quiet` : 'no warrior free', disabled: !mine && !warrior },
      { cmd: 'ignore', label: 'Ignore', hint: a.strikes ? 'RED alarm, it turns hostile' : 'yellow alarm, it asks again' },
    ];
    this.queryBox.innerHTML = `
      <div class="qb-title">${esc(a.name)} (${esc(a.typeName)}) QUERIES YOU${a.strikes ? ' AGAIN' : ''}</div>
      <div class="qb-info">${agentInfo(a).slice(1).map(esc).join('<br>')}</div>
      <div class="qb-options"></div>`;
    const box = this.queryBox.querySelector('.qb-options')!;
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-btn';
      b.disabled = !!o.disabled;
      b.innerHTML = `<span class="qb-label">${o.label}</span><span class="qb-hint">${esc(o.hint)}</span>`;
      b.addEventListener('click', () => this.actions.command(o.cmd));
      box.appendChild(b);
    }
  }

  /** Draws the mapper's eyes flying along the links of the hop in progress. */
  private updateMapper(): void {
    const layer = this.mapperLayer;
    const miniLayer = this.miniMapperLayer;
    if (!layer || !miniLayer) return;
    layer.replaceChildren();
    miniLayer.replaceChildren();
    const mapper = this.game.mapperState;
    if (!mapper) return;
    const t = Math.min(1, mapper.progress);
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const current = this.game.currentNode;
    for (const [from, to] of mapper.edges) {
      // Main view: from the room out to each neighbour, or from a neighbour out along its stub.
      const end = this.positions.get(to);
      if (from === current && end) {
        const centre = { x: CX, y: CY };
        const door = this.doorTowards(end.x, end.y);
        const split = 0.3;
        const p = t < split ? lerp(centre, door, t / split) : lerp(door, end, (t - split) / (1 - split));
        drawEye(p.x, p.y, 1, 1, layer);
      } else {
        const start = this.positions.get(from);
        if (start) {
          const a = this.game.network.node(from);
          const b = this.game.network.node(to);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const d = NEIGHBOUR_R + t * 70;
          drawEye(start.x + Math.cos(ang) * d, start.y + Math.sin(ang) * d, 1, 1 - t, layer);
        }
      }
      // Minimap: every eye, wherever it goes.
      const p = lerp(this.miniXY(from), this.miniXY(to), t);
      drawEye(p.x, p.y, 0.45, 1, miniLayer);
    }
  }

  /**
   * Short fading lines from each neighbour towards the nodes beyond it, so it is
   * clear the network goes on. Two visible neighbours linked together get a full line.
   */
  private drawStubs(current: NodeDef, positions: { node: NodeDef; x: number; y: number }[], parent: Element): void {
    const g = this.game;
    const shown = new Map(positions.map((p) => [p.node.id, p]));
    const defs = svg('defs', {}, parent);
    let n = 0;
    for (const p of positions) {
      for (const far of g.network.neighbours(p.node.id)) {
        // Only links to nodes the player knows about: no hints of what is still unseen.
        if (far.id === current.id || !g.isKnown(far.id)) continue;
        const other = shown.get(far.id);
        if (other) {
          if (p.node.id < far.id) svg('line', { x1: p.x, y1: p.y, x2: other.x, y2: other.y, class: 'link' }, parent);
          continue;
        }
        const a = Math.atan2(far.y - p.node.y, far.x - p.node.x);
        const [dx, dy] = [Math.cos(a), Math.sin(a)];
        const [x1, y1] = [p.x + dx * NEIGHBOUR_R * 0.8, p.y + dy * NEIGHBOUR_R * 0.8];
        const [x2, y2] = [p.x + dx * (NEIGHBOUR_R + 60), p.y + dy * (NEIGHBOUR_R + 60)];
        const id = `stub-${n++}`;
        const grad = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 }, defs);
        svg('stop', { offset: '0', 'stop-color': '#1a7a33', 'stop-opacity': 1 }, grad);
        svg('stop', { offset: '1', 'stop-color': '#1a7a33', 'stop-opacity': 0 }, grad);
        svg('line', { x1, y1, x2, y2, class: 'link-stub', stroke: `url(#${id})` }, parent);
      }
    }
  }

  /** A gate: a small barrier across the middle of a link. */
  private drawGate(x: number, y: number, angle: number, parent: Element): void {
    const grp = svg('g', { class: 'gate', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})` }, parent);
    svg('rect', { x: -5, y: -13, width: 10, height: 26, rx: 2 }, grp);
    svg('line', { x1: -5, y1: -4, x2: 5, y2: -4 }, grp);
    svg('line', { x1: -5, y1: 4, x2: 5, y2: 4 }, grp);
    svg('title', {}, grp).textContent = 'gate';
  }

  /** Where the link towards (x, y) leaves the room: found on the room's real outline. */
  private doorTowards(x: number, y: number): { x: number; y: number } {
    const shape = this.roomShape;
    const len = Math.hypot(x - CX, y - CY) || 1;
    const [dx, dy] = [(x - CX) / len, (y - CY) / len];
    if (!shape) return { x: CX + dx * this.roomR, y: CY + dy * this.roomR };
    let lo = 0;
    let hi = this.roomR * 1.6;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (this.inRoom(CX + dx * mid, CY + dy * mid)) lo = mid;
      else hi = mid;
    }
    return { x: CX + dx * lo, y: CY + dy * lo };
  }

  private inRoom(x: number, y: number): boolean {
    const shape = this.roomShape;
    if (!shape) return false;
    try {
      return shape.isPointInFill(new DOMPoint(x, y));
    } catch {
      return Math.hypot(x - CX, y - CY) < this.roomR;
    }
  }

  /**
   * The current node drawn large, in its own type's shape, with a grid and room inside
   * for what it holds: agents, data blocks and other objects. For now only databases show contents.
   */
  private drawRoom(node: NodeDef, positions: { x: number; y: number }[]): void {
    const kind = this.game.kindOf(node.id);
    const name = this.game.nameOf(node.id);
    const grp = svg('g', { class: `node node-current room kind-${kind}`, 'data-node': node.id, tabindex: 0 }, this.stage);
    this.roomR = ROOM_R * (ROOM_SCALE[kind] ?? 1);
    this.roomShape = drawNodeShape(kind, CX, CY, this.roomR, 'room-body', grp) as SVGGeometryElement;
    const clipId = 'room-clip';
    drawNodeShape(kind, CX, CY, this.roomR, '', svg('clipPath', { id: clipId }, grp));
    const grid = svg('g', { class: 'room-grid', 'clip-path': `url(#${clipId})` }, grp);
    const span = this.roomR * 1.6;
    for (let x = CX - span + CELL; x < CX + span; x += CELL) svg('line', { x1: x, y1: CY - span, x2: x, y2: CY + span }, grid);
    for (let y = CY - span + CELL; y < CY + span; y += CELL) svg('line', { x1: CX - span, y1: y, x2: CX + span, y2: y }, grid);

    // Doors where the links leave.
    for (const p of positions) {
      const d = this.doorTowards(p.x, p.y);
      svg('circle', { cx: d.x, cy: d.y, r: 5, class: 'room-door' }, grp);
    }

    if (this.game.filesIn(node.id).length) this.drawDataFiles(node.id, grp);

    // Name and type in the top-left corner of the view, with the type's small shape as an icon.
    const hud = svg('g', { class: `room-hud kind-${kind}` }, this.stage);
    drawNodeShape(kind, 22, 26, 11, 'node-body room-icon', hud);
    const title = svg('text', { x: 44, y: 24, class: 'room-title' }, hud);
    title.textContent = name;
    const sub = svg('text', { x: 44, y: 40, class: 'room-kind' }, hud);
    sub.textContent = KIND_LABEL[kind];
    this.drawSignatureBar(hud);

    const tip = svg('title', {}, grp);
    tip.textContent = `${name} (you are here). Right-click for actions.`;
    grp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openNodeMenu(node, e.clientX, e.clientY, true);
    });
  }

  /**
   * The node's data files, each in its own grid cell (a fixed, id-based scatter so a
   * database looks the same every visit). Hover and click them; right-click for a menu.
   */
  private drawDataFiles(nodeId: string, parent: Element): void {
    let seed = 0;
    for (const ch of nodeId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    // Cells line up with the room grid, whose lines sit at x0 + k * CELL.
    const span = this.roomR * 1.6;
    const x0 = CX - span;
    const y0 = CY - span;
    const cols = Math.floor((2 * span) / CELL);
    const files = this.game.filesIn(nodeId);
    const scanning = this.game.scanningFile;
    const taken = new Set<string>();
    for (let i = 0, tries = 0; i < files.length && tries < 2000; tries++) {
      const c = Math.floor(rand() * cols);
      const row = Math.floor(rand() * cols);
      const key = `${c},${row}`;
      const x = x0 + c * CELL;
      const y = y0 + row * CELL;
      const inside = [[x + 3, y + 3], [x + CELL - 3, y + 3], [x + 3, y + CELL - 3], [x + CELL - 3, y + CELL - 3]].every(([px, py]) => this.inRoom(px, py));
      // Keep clear of the avatar's spot in the middle and of cells already used.
      const nearAvatar = Math.abs(x + CELL / 2 - CX) < CELL * 1.5 && Math.abs(y + CELL / 2 - (CY + 30)) < CELL * 1.5;
      if (!inside || nearAvatar || taken.has(key)) continue;
      taken.add(key);
      const file = files[i++];
      if (file.deleted) continue;
      this.filePos.set(file.id, { x: x + CELL / 2, y: y + CELL / 2 });
      const cls = ['data-block', file.scanned ? `is-${apparentContent(file)}` : 'is-encrypted'];
      if (file.scanned && isEmpty(file)) cls.push('is-empty');
      if (scanning?.fileId === file.id) cls.push('is-scanning');
      if (file.downloaded || file.altered || file.extracted) cls.push('is-done');
      const blk = svg('g', { class: cls.join(' '), 'data-file': file.id }, parent);
      const pad = 5;
      svg('rect', { x: x + pad, y: y + pad, width: CELL - 2 * pad, height: CELL - 2 * pad }, blk);
      const mid = y + CELL / 2;
      if (scanning?.fileId === file.id) {
        // A small loading bar over the file while a lasting action works on it.
        const w = CELL - 2 * pad;
        svg('rect', { x: x + pad, y: y, width: w, height: 4, class: 'file-bar-bg' }, parent);
        const fill = svg('rect', { x: x + pad, y: y, width: w * scanning.progress, height: 4, class: 'file-bar' }, parent);
        this.fileBar = { fill, width: w };
      }
      const seen = file.scanned ? apparentContent(file) : undefined;
      if (file.protection) {
        drawProtection(file.protection, x + CELL / 2, mid, blk);
      } else if (seen === 'valuable' && file.evaluated) {
        const t = svg('text', { x: x + CELL / 2, y: mid, class: 'file-price' }, blk);
        t.textContent = shortPrice(file.price!);
      } else if (seen === 'software') {
        drawProgramIcon(x + CELL / 2, mid, blk);
      } else {
        svg('line', { x1: x + pad + 4, y1: mid - 2.5, x2: x + CELL - pad - 4, y2: mid - 2.5 }, blk);
        svg('line', { x1: x + pad + 4, y1: mid + 2.5, x2: x + CELL - pad - 7, y2: mid + 2.5 }, blk);
      }
      if (seen === 'software' && file.identified) {
        // An identified program shows its name over the archive.
        const t = svg('text', { x: x + CELL / 2, y: y + 3, class: 'file-swname' }, parent);
        t.textContent = file.software!.name;
      }
      this.tip.attach(blk, () => fileTip(file));
      blk.addEventListener('mouseenter', () => this.actions.hover());
      blk.addEventListener('click', () => {
        const act = clickAction(file);
        if (act) this.actions.fileAction(act, file.id);
        else if (!file.scanned) this.actions.scanFile(file.id, false);
      });
      blk.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const busy = this.game.isBusy;
        const items = [];
        if (!file.scanned) items.push({ label: 'Scan', hint: clickAction(file) ? undefined : 'click', disabled: busy, action: () => this.actions.scanFile(file.id, false) });
        for (const act of fileActions(file)) {
          const needs = (FILE_PROGRAMS as readonly string[]).includes(act) && !this.game.findProgram(act as FileProgram);
          const done = act === 'download' && file.downloaded;
          items.push({ label: act, hint: needs ? `needs ${act}` : done ? 'done' : act === clickAction(file) ? 'click' : undefined, disabled: busy || needs || done, action: () => this.actions.fileAction(act, file.id) });
        }
        if (this.game.filesIn(nodeId).some((f) => !f.scanned)) {
          items.push({ label: 'Scan all', hint: 'starting from this file', disabled: busy, action: () => this.actions.scanFile(file.id, true) });
        }
        this.menu.show(e.clientX, e.clientY, `${file.id}${file.scanned ? `: ${CONTENT_LABEL[apparentContent(file)]}` : ''}`, items);
      });
    }
  }

  /** The player: their chosen icon standing in the current node, its bottom at (0, 0). */
  private drawAvatar(): SVGGElement {
    const root = svg('g', { class: 'avatar' }, this.stage);
    const fig = svg('g', { class: 'avatar-figure' }, root);
    const a = this.actions.avatar ?? { icon: 'hood', color: '#3dff7a' };
    const bob = svg('g', { class: 'avatar-bob' }, fig);
    const icon = svg('svg', { x: -25, y: -50, width: 50, height: 50, viewBox: '0 0 512 512', class: 'avatar-icon' }, bob);
    icon.style.color = a.color;
    icon.innerHTML = iconBody(a.icon) ?? '';
    return root;
  }

  /** Moves the avatar along the link of the hop in progress. */
  private updateAvatar(instant = false): void {
    const av = this.avatar;
    if (!av) return;
    const start = { x: CX, y: CY + 40 };
    let pos = start;
    let facing = 1;
    const hop = this.game.nextHop;
    const end = hop ? this.positions.get(hop) : undefined;
    if (end) {
      // Walk across the room to its door, then along the link.
      const t = this.game.hopProgressAt(this.alpha);
      const door = this.doorTowards(end.x, end.y);
      const to = { x: end.x, y: end.y + NEIGHBOUR_R * 0.6 };
      const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      const split = 0.35;
      pos = t < split ? lerp(start, door, t / split) : lerp(door, to, (t - split) / (1 - split));
      facing = to.x < start.x ? -1 : 1;
    }
    av.classList.toggle('is-walking', !!end && !this.game.paused);
    av.classList.toggle('no-transition', instant);
    av.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    this.avatarPos = { x: pos.x, y: pos.y - 25 * AVATAR_SCALE };
    (av.firstElementChild as SVGGElement).style.transform = `scale(${facing * AVATAR_SCALE}, ${AVATAR_SCALE})`;
  }

  /** Places neighbours on a ring, in the direction they lie on the system map. */
  private layoutNeighbours(current: NodeDef, neighbours: NodeDef[]) {
    const items = neighbours
      .map((node) => ({ node, angle: Math.atan2(node.y - current.y, node.x - current.x) }))
      .sort((a, b) => a.angle - b.angle);
    // Push apart neighbours that would overlap.
    const minGap = 0.75;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < items.length; i++) {
        const gap = items[i].angle - items[i - 1].angle;
        if (gap < minGap) {
          const shift = (minGap - gap) / 2;
          items[i - 1].angle -= shift;
          items[i].angle += shift;
        }
      }
    }
    return items.map(({ node, angle }) => ({
      node,
      x: CX + Math.cos(angle) * RING_X,
      y: CY + Math.sin(angle) * RING_Y,
    }));
  }

  private drawNode(
    node: NodeDef,
    x: number,
    y: number,
    r: number,
    opts: { current: boolean; targeted: boolean; number?: number },
  ): void {
    const kind = this.game.kindOf(node.id);
    const nodeName = this.game.nameOf(node.id);
    const cls = ['node', `kind-${kind}`];
    if (opts.current) cls.push('node-current');
    else cls.push('node-neighbour');
    if (opts.targeted) cls.push('node-targeted');
    const grp = svg('g', { class: cls.join(' '), 'data-node': node.id, tabindex: 0 }, this.stage);
    const body = drawNodeShape(kind, x, y, r, 'node-body', grp);
    // Hover sound only on the node shape itself, not on its labels.
    if (!opts.current) body.addEventListener('mouseenter', () => this.actions.hover());
    if (kind === 'hidden') {
      // An unrecognised node shows nothing but its ?N name.
      const size = opts.current ? 34 : 26;
      const tag = svg('text', { x, y: opts.current ? y - 12 : y + size * 0.35, class: 'node-tag', 'font-size': size }, grp);
      tag.textContent = nodeName;
    } else if (hasTag(kind)) {
      const tag = svg('text', { x, y: y + (opts.current ? -14 : 5), class: 'node-tag', 'font-size': opts.current ? 22 : 13 }, grp);
      tag.textContent = KIND_TAG[kind];
    }
    const bottom = y + r * Math.max(halfHeight(kind), opts.current ? 1 : 0);
    if (kind !== 'hidden') {
      const name = svg('text', { x, y: bottom + 18, class: 'node-name' }, grp);
      name.textContent = nodeName;
    }
    if (opts.current && kind !== 'hidden') {
      const label = svg('text', { x, y: bottom + 36, class: 'node-kind' }, grp);
      label.textContent = KIND_LABEL[kind];
    }
    const title = svg('title', {}, grp);
    title.textContent = opts.current ? `${nodeName} (you are here)` : `${nodeName}: click to connect`;

    grp.addEventListener('click', () => {
      if (!opts.current) this.actions.travel(node.id);
    });
    grp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !opts.current) this.actions.travel(node.id);
    });
    grp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openNodeMenu(node, e.clientX, e.clientY, opts.current, opts.number);
    });
  }

  private openNodeMenu(node: NodeDef, x: number, y: number, isCurrent: boolean, number?: number): void {
    const items = [];
    if (!isCurrent) {
      items.push({
        label: 'Connect',
        hint: number !== undefined && number <= 9 ? `click / ${number}` : 'click',
        action: () => this.actions.travel(node.id),
      });
    }
    items.push({ label: 'Look', action: () => this.actions.look(node.id) });
    const scout = this.game.findProgram('scout');
    if (!isCurrent && scout) items.push({ label: 'Send scout', hint: scout.name, action: () => this.actions.command(`scout ${this.game.nameOf(node.id)}`) });
    if (isCurrent) {
      for (const act of this.game.currentActions) {
        items.push({ label: act.id, hint: act.requires ? `${act.requires} priv.` : undefined, action: () => this.actions.act(act.id) });
      }
      // After the node's own actions: only programs that make sense here.
      const busy = this.game.isBusy;
      const scan = this.game.findProgram('scan');
      if (scan && this.game.filesIn(node.id).some((f) => !f.scanned)) {
        items.push({ label: 'Scan all', hint: scan.name, disabled: busy, action: () => this.actions.scanAll() });
      }
    }
    this.menu.show(x, y, this.game.nameOf(node.id), items);
  }

  private drawMinimap(): void {
    const g = this.game;
    const nodes = g.network.def.nodes;
    const mw = 200;
    const mh = 100;
    const ox = 10;
    const oy = 14;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y));
    const pad = 14;
    const sx = (x: number) => ox + pad + ((x - minX) / Math.max(1, maxX - minX)) * (mw - 2 * pad);
    const sy = (y: number) => oy + pad + ((y - minY) / Math.max(1, maxY - minY)) * (mh - 2 * pad);

    this.miniXY = (id) => {
      const n = g.network.node(id);
      return { x: sx(n.x), y: sy(n.y) };
    };
    this.miniSvg.innerHTML = '';
    const mini = svg('g', { class: 'minimap' }, this.miniSvg);
    svg('rect', { x: ox, y: oy, width: mw, height: mh, class: 'minimap-frame' }, mini);
    const label = svg('text', { x: ox + 6, y: oy - 5, class: 'minimap-label' }, mini);
    label.textContent = 'MAP';
    for (const [a, b] of g.network.def.links) {
      if (!g.isKnown(a) || !g.isKnown(b)) continue;
      const na = g.network.node(a);
      const nb = g.network.node(b);
      svg('line', { x1: sx(na.x), y1: sy(na.y), x2: sx(nb.x), y2: sy(nb.y), class: 'mini-link' }, mini);
      if (g.network.hasGate(a, b)) svg('rect', { x: (sx(na.x) + sx(nb.x)) / 2 - 2, y: (sy(na.y) + sy(nb.y)) / 2 - 2, width: 4, height: 4, class: 'mini-gate' }, mini);
    }
    const target = g.moveTarget;
    for (const n of nodes) {
      if (!g.isKnown(n.id)) continue;
      const cls = ['mini-node', `kind-${g.kindOf(n.id)}`];
      if (n.id === g.currentNode) cls.push('mini-current');
      if (n.id === target) cls.push('mini-target');
      const dot = drawNodeShape(g.kindOf(n.id), sx(n.x), sy(n.y), n.id === g.currentNode ? 6 : 4.5, cls.join(' '), mini);
      dot.setAttribute('data-mini', n.id);
      const t = svg('title', {}, dot);
      t.textContent = g.nameOf(n.id);
      dot.addEventListener('mouseenter', () => this.actions.hover());
      dot.addEventListener('click', () => this.actions.travel(n.id));
      dot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.menu.show(e.clientX, e.clientY, g.nameOf(n.id), [
          { label: 'Travel here', hint: 'click', disabled: n.id === g.currentNode, action: () => this.actions.travel(n.id) },
          { label: 'Look', action: () => this.actions.look(n.id) },
        ]);
      });
    }
    this.miniAgentLayer = svg('g', { class: 'agent-layer' }, mini);
    this.miniMapperLayer = svg('g', { class: 'mapper-layer' }, mini);
  }
}

export { KIND_LABEL };
