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
  return { gateway: 1.15, identity: 0.85, database: 0.68, camera: 0.85, overseer: 1.02, router: 1, unknown: 1 }[kind];
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
  switch (kind) {
    case 'gateway': // diamond
      return el('polygon', { points: polygon([[x, y - r * 1.15], [x + r * 1.15, y], [x, y + r * 1.15], [x - r * 1.15, y]]), class: cls }, parent);
    case 'identity': // square
      return el('rect', { x: x - r * 0.85, y: y - r * 0.85, width: r * 1.7, height: r * 1.7, class: cls }, parent);
    case 'database': // wide rectangle
      return el('rect', { x: x - r * 1.2, y: y - r * 0.68, width: r * 2.4, height: r * 1.36, class: cls }, parent);
    case 'camera': { // simplified eye outline
      const w = r * 1.3;
      const h = r * 1.7; // control point offset: the outline peaks at half of it
      return el('path', { d: `M ${x - w} ${y} Q ${x} ${y - h} ${x + w} ${y} Q ${x} ${y + h} ${x - w} ${y} Z`, class: cls }, parent);
    }
    case 'overseer': // octagon
      return el('polygon', { points: polygon(regular(x, y, r * 1.1, 8, Math.PI / 8)), class: cls }, parent);
    case 'router':
    case 'unknown':
    default: // circle
      return el('circle', { cx: x, cy: y, r, class: cls }, parent);
  }
}
