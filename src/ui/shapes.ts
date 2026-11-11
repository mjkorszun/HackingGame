import type { NodeKind } from '../sim/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

function polygon(points: [number, number][]): string {
  return points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
}

function regular(x: number, y: number, r: number, sides: number, rotation: number): [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const a = rotation + (i * 2 * Math.PI) / sides;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  });
}

/** Half the height of a node's shape, as a multiple of its radius (for placing labels under it). */
export function halfHeight(kind: NodeKind): number {
  const h: Partial<Record<NodeKind, number>> = {
    gateway: 1.15,
    identity: 0.85,
    uplink: 0.8,
    database: 0.95,
    vault: 0.91,
    overseer: 1.02,
    orchestrator: 0.89,
    monitoring: 0.6,
    compute: 1,
    camera: 0.85,
    ads: 1,
    physical: 0.8,
    vehicle: 0.7,
    security: 1.05,
  };
  return h[kind] ?? 1;
}

/** Whether the node kind's shape has room for a text tag inside it. */
export function hasTag(kind: NodeKind): boolean {
  return kind !== 'camera';
}

/**
 * Draws the outline of a node of the given kind, centred at (x, y), roughly r in radius.
 * Returns the outline element (the one that receives hover and clicks).
 */
export function drawNodeShape(kind: NodeKind, x: number, y: number, r: number, cls: string, parent: Element): SVGElement {
  const poly = (pts: [number, number][]) => el('polygon', { points: polygon(pts), class: cls }, parent);
  switch (kind) {
    case 'gateway': // diamond
      return poly([[x, y - r * 1.15], [x + r * 1.15, y], [x, y + r * 1.15], [x - r * 1.15, y]]);
    case 'identity': // square
      return el('rect', { x: x - r * 0.85, y: y - r * 0.85, width: r * 1.7, height: r * 1.7, class: cls }, parent);
    case 'uplink': // triangle pointing up
      return poly(regular(x, y + r * 0.2, r * 1.2, 3, -Math.PI / 2));
    case 'database': { // square with cut corners
      const h = r * 0.95;
      const c = r * 0.32;
      return poly([[x - h + c, y - h], [x + h - c, y - h], [x + h, y - h + c], [x + h, y + h - c], [x + h - c, y + h], [x - h + c, y + h], [x - h, y + h - c], [x - h, y - h + c]]);
    }
    case 'vault': // hexagon
      return poly(regular(x, y, r * 1.05, 6, 0));
    case 'overseer': // octagon
      return poly(regular(x, y, r * 1.1, 8, Math.PI / 8));
    case 'orchestrator': // pentagon
      return poly(regular(x, y + r * 0.05, r * 1.1, 5, -Math.PI / 2));
    case 'monitoring': // pill
      return el('rect', { x: x - r * 1.25, y: y - r * 0.6, width: r * 2.5, height: r * 1.2, rx: r * 0.6, class: cls }, parent);
    case 'compute': // tall rectangle
      return el('rect', { x: x - r * 0.7, y: y - r, width: r * 1.4, height: r * 2, class: cls }, parent);
    case 'camera': { // simplified eye outline
      const w = r * 1.3;
      const h = r * 1.7; // control point offset: the outline peaks at half of it
      return el('path', { d: `M ${x - w} ${y} Q ${x} ${y - h} ${x + w} ${y} Q ${x} ${y + h} ${x - w} ${y} Z`, class: cls }, parent);
    }
    case 'ads': // triangle pointing down
      return poly(regular(x, y - r * 0.2, r * 1.2, 3, Math.PI / 2));
    case 'physical': // house
      return poly([[x - r, y + r * 0.8], [x - r, y - r * 0.2], [x, y - r * 1.05], [x + r, y - r * 0.2], [x + r, y + r * 0.8]]);
    case 'vehicle': // long hexagon
      return poly([[x - r * 1.35, y], [x - r * 0.85, y - r * 0.7], [x + r * 0.85, y - r * 0.7], [x + r * 1.35, y], [x + r * 0.85, y + r * 0.7], [x - r * 0.85, y + r * 0.7]]);
    case 'security': // shield
      return el('path', {
        d: `M ${x - r} ${y - r * 0.85} L ${x + r} ${y - r * 0.85} L ${x + r} ${y - r * 0.1} Q ${x + r} ${y + r * 0.6} ${x} ${y + r * 1.05} Q ${x - r} ${y + r * 0.6} ${x - r} ${y - r * 0.1} Z`,
        class: cls,
      }, parent);
    case 'relay':
    case 'hidden':
    default: // circle
      return el('circle', { cx: x, cy: y, r, class: cls }, parent);
  }
}
