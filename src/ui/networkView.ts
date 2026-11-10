import type { Game } from '../sim/game';
import { TICKS_PER_SECOND } from '../sim/game';
import type { NodeDef, NodeKind } from '../sim/types';
import type { ContextMenu } from './contextMenu';
import type { Sound } from './sound';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 520;
const CX = W / 2;
const CY = 205;
const CURRENT_R = 64;
const NEIGHBOUR_R = 34;
const RING = 145;

const KIND_TAG: Record<NodeKind, string> = {
  entry: 'GW',
  router: 'RT',
  auth: 'ID',
  data: 'DB',
  camera: 'CAM',
  core: 'AI',
};

const KIND_LABEL: Record<NodeKind, string> = {
  entry: 'gateway',
  router: 'router',
  auth: 'identity service',
  data: 'database table',
  camera: 'camera hub',
  core: 'system AI',
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
  private neighbourOrder: string[] = [];
  private lastKey = '';
  private positions = new Map<string, { x: number; y: number }>();
  private avatar: SVGGElement | null = null;

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
    root.append(this.header, this.stage);
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
    const key = `${this.game.currentNode}|${this.game.moveTarget}|${this.game.paused}`;
    if (key !== this.lastKey) this.render();
    this.updateAvatar();
  }

  private render(): void {
    const g = this.game;
    this.lastKey = `${g.currentNode}|${g.moveTarget}|${g.paused}`;
    this.stage.innerHTML = '';
    const current = g.network.node(g.currentNode);
    const neighbours = g.network.neighbours(current.id);
    const positions = this.layoutNeighbours(current, neighbours);
    this.neighbourOrder = positions.map((p) => p.node.id);
    const target = g.moveTarget;

    const links = svg('g', { class: 'links' }, this.stage);
    for (const p of positions) {
      const active = target !== null && (p.node.id === target || g.network.path(current.id, target)[0] === p.node.id);
      svg('line', { x1: CX, y1: CY, x2: p.x, y2: p.y, class: active ? 'link link-active' : 'link' }, links);
    }

    positions.forEach((p, i) => {
      const isTarget = target !== null && g.network.path(current.id, target)[0] === p.node.id;
      this.drawNode(p.node, p.x, p.y, NEIGHBOUR_R, {
        current: false,
        targeted: isTarget,
        number: i + 1,
      });
    });
    this.drawNode(current, CX, CY, CURRENT_R, { current: true, targeted: false });
    this.positions = new Map(positions.map((p) => [p.node.id, { x: p.x, y: p.y }]));
    this.avatar = this.drawAvatar();
    this.updateAvatar(true);
    this.drawMinimap();
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
    const start = { x: CX, y: CY + CURRENT_R * 0.7 };
    let pos = start;
    let facing = 1;
    const hop = this.game.nextHop;
    const end = hop ? this.positions.get(hop) : undefined;
    if (end) {
      const t = this.game.hopProgress;
      const to = { x: end.x, y: end.y + NEIGHBOUR_R * 0.6 };
      pos = { x: start.x + (to.x - start.x) * t, y: start.y + (to.y - start.y) * t };
      facing = to.x < start.x ? -1 : 1;
    }
    av.classList.toggle('is-walking', !!end && !this.game.paused);
    av.classList.toggle('no-transition', instant);
    av.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    (av.firstElementChild as SVGGElement).style.transform = `scaleX(${facing})`;
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
      x: CX + Math.cos(angle) * RING * 1.35,
      y: CY + Math.sin(angle) * RING,
    }));
  }

  private drawNode(
    node: NodeDef,
    x: number,
    y: number,
    r: number,
    opts: { current: boolean; targeted: boolean; number?: number },
  ): void {
    const cls = ['node', `kind-${node.kind}`];
    if (opts.current) cls.push('node-current');
    else cls.push('node-neighbour');
    if (opts.targeted) cls.push('node-targeted');
    const grp = svg('g', { class: cls.join(' '), 'data-node': node.id, tabindex: 0 }, this.stage);
    const body = svg('circle', { cx: x, cy: y, r, class: 'node-body' }, grp);
    // Hover sound only on the node shape itself, not on its labels.
    if (!opts.current) body.addEventListener('mouseenter', () => this.actions.hover());
    const tag = svg('text', { x, y: y + (opts.current ? -14 : 5), class: 'node-tag', 'font-size': opts.current ? 26 : 15 }, grp);
    tag.textContent = KIND_TAG[node.kind];
    const name = svg('text', { x, y: y + r + 18, class: 'node-name' }, grp);
    name.textContent = node.name;
    if (opts.current) {
      const kind = svg('text', { x, y: y + r + 36, class: 'node-kind' }, grp);
      kind.textContent = KIND_LABEL[node.kind];
    }
    const title = svg('title', {}, grp);
    title.textContent = opts.current ? `${node.name} (you are here)` : `${node.name}: click to connect`;

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
    this.menu.show(x, y, node.name, items);
  }

  private drawMinimap(): void {
    const g = this.game;
    const nodes = g.network.def.nodes;
    const mw = 200;
    const mh = 100;
    const ox = W - mw - 10;
    const oy = H - mh - 10;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y));
    const pad = 14;
    const sx = (x: number) => ox + pad + ((x - minX) / Math.max(1, maxX - minX)) * (mw - 2 * pad);
    const sy = (y: number) => oy + pad + ((y - minY) / Math.max(1, maxY - minY)) * (mh - 2 * pad);

    const mini = svg('g', { class: 'minimap' }, this.stage);
    svg('rect', { x: ox, y: oy, width: mw, height: mh, class: 'minimap-frame' }, mini);
    const label = svg('text', { x: ox + 6, y: oy - 5, class: 'minimap-label' }, mini);
    label.textContent = 'MAP';
    for (const [a, b] of g.network.def.links) {
      const na = g.network.node(a);
      const nb = g.network.node(b);
      svg('line', { x1: sx(na.x), y1: sy(na.y), x2: sx(nb.x), y2: sy(nb.y), class: 'mini-link' }, mini);
    }
    const target = g.moveTarget;
    for (const n of nodes) {
      const cls = ['mini-node'];
      if (n.id === g.currentNode) cls.push('mini-current');
      if (n.id === target) cls.push('mini-target');
      const dot = svg('circle', { cx: sx(n.x), cy: sy(n.y), r: n.id === g.currentNode ? 6 : 4.5, class: cls.join(' '), 'data-mini': n.id }, mini);
      const t = svg('title', {}, dot);
      t.textContent = n.name;
      dot.addEventListener('mouseenter', () => this.actions.hover());
      dot.addEventListener('click', () => this.actions.travel(n.id));
      dot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.menu.show(e.clientX, e.clientY, n.name, [
          { label: 'Travel here', hint: 'click', disabled: n.id === g.currentNode, action: () => this.actions.travel(n.id) },
          { label: 'Look', action: () => this.actions.look(n.id) },
        ]);
      });
    }
  }
}

export { KIND_LABEL };
