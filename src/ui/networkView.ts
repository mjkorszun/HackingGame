import type { Game } from '../sim/game';
import { TICKS_PER_SECOND } from '../sim/game';
import type { NodeDef, NodeKind } from '../sim/types';
import type { ContextMenu } from './contextMenu';
import type { Sound } from './sound';
import { drawNodeShape, halfHeight, hasTag } from './shapes';

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
  unknown: '?',
};

const KIND_LABEL: Record<NodeKind, string> = {
  gateway: 'gateway',
  relay: 'relay',
  identity: 'identity service',
  uplink: 'uplink',
  database: 'database',
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
  unknown: 'unknown',
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

function formatTime(tick: number): string {
  const total = Math.floor(tick / TICKS_PER_SECOND);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenths = tick % TICKS_PER_SECOND;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export interface ViewActions {
  travel(nodeId: string): void;
  look(nodeId: string): void;
  act(actionId: string): void;
  togglePause(): void;
  mute(): void;
  hover(): void;
  sound: Sound;
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

  constructor(
    root: HTMLElement,
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
    alarm.className = 'alarm alarm-green';
    alarm.textContent = 'ALARM: GREEN';
    this.clock = document.createElement('div');
    this.clock.className = 'clock';
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'pause-btn';
    this.pauseBtn.title = 'Pause / resume (Space)';
    this.pauseBtn.addEventListener('click', () => actions.togglePause());
    const soundBox = document.createElement('div');
    soundBox.className = 'sound-box';
    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.className = 'mute-btn';
    this.muteBtn.title = 'Sound on / off (M)';
    this.muteBtn.addEventListener('click', () => actions.mute());
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
    this.header.append(title, alarm, soundBox, this.clock, this.pauseBtn);

    this.stage = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'stage', role: 'img' });
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    this.miniSvg = svg('svg', { viewBox: '0 0 220 120', class: 'minimap-svg' });
    this.miniSvg.addEventListener('contextmenu', (e) => e.preventDefault());
    root.append(this.header, this.stage, this.miniSvg);
    this.render();
  }

  /** Neighbour reached with number key n (1-based), in the order shown on screen. */
  neighbourByNumber(n: number): string | undefined {
    return this.neighbourOrder[n - 1];
  }

  /** Called every frame. Redraws the stage only when something visible changed. */
  update(): void {
    this.clock.textContent = formatTime(this.game.tick);
    this.pauseBtn.textContent = this.game.paused ? '▶ RESUME' : '❚❚ PAUSE';
    this.muteBtn.textContent = this.actions.sound.muted ? 'SND OFF' : 'SND ON';
    this.muteBtn.classList.toggle('is-muted', this.actions.sound.muted);
    this.header.classList.toggle('is-paused', this.game.paused);
    const key = `${this.game.currentNode}|${this.game.moveTarget}|${this.game.paused}|${this.game.identifiedCount}|${this.game.knownCount}`;
    if (key !== this.lastKey) this.render();
    this.updateAvatar();
  }

  private render(): void {
    const g = this.game;
    this.lastKey = `${g.currentNode}|${g.moveTarget}|${g.paused}|${g.identifiedCount}|${g.knownCount}`;
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
    this.drawMinimap();
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
        if (far.id === current.id) continue;
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

    if (kind === 'database') this.drawDataBlocks(node.id, grp);

    // Name and type in the top-left corner of the view, with the type's small shape as an icon.
    const hud = svg('g', { class: `room-hud kind-${kind}` }, this.stage);
    drawNodeShape(kind, 22, 26, 11, 'node-body room-icon', hud);
    const title = svg('text', { x: 44, y: 24, class: 'room-title' }, hud);
    title.textContent = name;
    const sub = svg('text', { x: 44, y: 40, class: 'room-kind' }, hud);
    sub.textContent = KIND_LABEL[kind];

    const tip = svg('title', {}, grp);
    tip.textContent = `${name} (you are here). Right-click for actions.`;
    grp.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openNodeMenu(node, e.clientX, e.clientY, true);
    });
  }

  /** Placeholder data blocks: a fixed, id-based scatter so each database looks the same every visit. */
  private drawDataBlocks(seedText: string, parent: Element): void {
    let seed = 0;
    for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const cols = Math.floor((2 * ROOM_R) / CELL);
    const left = CX - (cols * CELL) / 2;
    const top = CY - (cols * CELL) / 2;
    const taken = new Set<string>();
    const count = 6 + Math.floor(rand() * 7);
    for (let i = 0, tries = 0; i < count && tries < 300; tries++) {
      const c = Math.floor(rand() * cols);
      const row = Math.floor(rand() * cols);
      const key = `${c},${row}`;
      const x = left + c * CELL;
      const y = top + row * CELL;
      const inside = [[x + 3, y + 3], [x + CELL - 3, y + 3], [x + 3, y + CELL - 3], [x + CELL - 3, y + CELL - 3]].every(([px, py]) => this.inRoom(px, py));
      // Keep clear of the avatar's spot in the middle and of cells already used.
      const nearAvatar = Math.abs(x + CELL / 2 - CX) < CELL * 1.5 && Math.abs(y + CELL / 2 - (CY + 30)) < CELL * 1.5;
      if (!inside || nearAvatar || taken.has(key)) continue;
      taken.add(key);
      i++;
      const blk = svg('g', { class: 'data-block' }, parent);
      svg('rect', { x: x + 5, y: y + 5, width: CELL - 10, height: CELL - 10 }, blk);
      svg('line', { x1: x + 9, y1: y + 12, x2: x + CELL - 9, y2: y + 12 }, blk);
      svg('line', { x1: x + 9, y1: y + 17, x2: x + CELL - 12, y2: y + 17 }, blk);
    }
  }

  /** The player: a simple stick figure standing in the current node, feet at (0, 0). */
  private drawAvatar(): SVGGElement {
    const root = svg('g', { class: 'avatar' }, this.stage);
    const fig = svg('g', { class: 'avatar-figure' }, root);
    svg('circle', { cx: 0, cy: -38, r: 6.5, class: 'avatar-head' }, fig);
    svg('line', { x1: 0, y1: -31, x2: 0, y2: -14, class: 'avatar-limb' }, fig);
    svg('line', { x1: 0, y1: -27, x2: -9, y2: -18, class: 'avatar-limb avatar-arm-l' }, fig);
    svg('line', { x1: 0, y1: -27, x2: 9, y2: -18, class: 'avatar-limb avatar-arm-r' }, fig);
    svg('line', { x1: 0, y1: -14, x2: -7, y2: 0, class: 'avatar-limb avatar-leg-l' }, fig);
    svg('line', { x1: 0, y1: -14, x2: 7, y2: 0, class: 'avatar-limb avatar-leg-r' }, fig);
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
      const t = this.game.hopProgress;
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
    if (kind === 'unknown') {
      // An unrecognised node shows nothing but its ?N name.
      const size = opts.current ? 34 : 26;
      const tag = svg('text', { x, y: opts.current ? y - 12 : y + size * 0.35, class: 'node-tag', 'font-size': size }, grp);
      tag.textContent = nodeName;
    } else if (hasTag(kind)) {
      const tag = svg('text', { x, y: y + (opts.current ? -14 : 5), class: 'node-tag', 'font-size': opts.current ? 22 : 13 }, grp);
      tag.textContent = KIND_TAG[kind];
    }
    const bottom = y + r * Math.max(halfHeight(kind), opts.current ? 1 : 0);
    if (kind !== 'unknown') {
      const name = svg('text', { x, y: bottom + 18, class: 'node-name' }, grp);
      name.textContent = nodeName;
    }
    if (opts.current && kind !== 'unknown') {
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
    if (isCurrent) {
      for (const act of this.game.currentActions) {
        items.push({ label: act.id, hint: act.requires ? `${act.requires} priv.` : undefined, action: () => this.actions.act(act.id) });
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
  }
}

export { KIND_LABEL };
