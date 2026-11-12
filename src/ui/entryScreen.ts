import type { NodeKind, SystemDef } from '../sim/types';
import type { NetIntel } from '../sim/intel';
import { kindInfo, ROLE_SHORT, WARRIORS, type WarriorType } from '../sim/agents';
import { Tooltip } from './tooltip';
import { agentIcon, iconBody } from './icons';

const WARRIOR_TYPES = Object.keys(WARRIORS) as WarriorType[];
import { drawNodeShape } from './shapes';
import { KIND_LABEL } from './networkView';

/** Where you can come into a system: its gateway, and every backdoor you left there. */
export function entryPoints(system: SystemDef, intel: NetIntel | undefined): string[] {
  const ids = system.nodes.map((n) => n.id);
  return [system.entry, ...(intel?.backdoors ?? []).filter((id) => id !== system.entry && ids.includes(id))];
}

/** The entry screen is needed when there is a choice of entry, or you already know part of the map. */
export function needsEntryScreen(system: SystemDef, intel: NetIntel | undefined): boolean {
  return entryPoints(system, intel).length > 1 || (intel?.known.length ?? 0) > 0;
}

const NS = 'http://www.w3.org/2000/svg';
function svg(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/**
 * Before a run: the part of the system's map you know, with what you met in each node.
 * Click a blinking node to come in there; Cancel goes back without entering.
 */
export function showEntryScreen(system: SystemDef, intel: NetIntel | undefined, onEnter: (nodeId: string) => void, onCancel: () => void, onHover?: () => void): void {
  const entries = entryPoints(system, intel);
  const known = new Set([...(intel?.known ?? []), ...entries]);
  const identified = new Set([...(intel?.identified ?? []), ...entries]);
  for (const n of system.nodes) if (!n.hidden && known.has(n.id)) identified.add(n.id);
  const kindOf = (id: string): NodeKind => {
    if (!identified.has(id)) return 'hidden';
    const n = system.nodes.find((x) => x.id === id)!;
    return n.kind === 'honeypot' ? (n.disguise ?? 'database') : n.kind;
  };
  const nameOf = (id: string) => (identified.has(id) ? system.nodes.find((x) => x.id === id)!.name : 'unknown node');

  const tip = new Tooltip();
  const box = document.createElement('div');
  box.className = 'run-summary';
  box.innerHTML = `
    <div class="rs-panel entry-panel" role="dialog" aria-label="Choose where to enter">
      <h2>ENTER ${esc(system.name.toUpperCase())}</h2>
      <p class="rs-dim">${entries.length > 1 ? 'click a blinking node to enter the system there' : 'click the blinking node to enter the system'}</p>
      <div class="entry-body">
        <svg class="entry-map" viewBox="0 0 640 340"></svg>
        <div class="entry-info"><p class="rs-dim">point at a node to see what you know about it</p></div>
      </div>
      <button type="button" class="entry-cancel">Cancel</button>
    </div>`;
  const close = () => {
    tip.hide();
    box.remove();
  };
  const map = box.querySelector('svg')!;
  const info = box.querySelector<HTMLElement>('.entry-info')!;
  const shown = system.nodes.filter((n) => known.has(n.id));
  const xs = shown.map((n) => n.x);
  const ys = shown.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 70;
  const sx = (x: number) => (maxX === minX ? 320 : pad + ((x - minX) / (maxX - minX)) * (640 - 2 * pad));
  const sy = (y: number) => (maxY === minY ? 170 : pad + ((y - minY) / (maxY - minY)) * (340 - 2 * pad));
  const g = svg('g', { class: 'minimap' }, map);
  for (const [a, b] of system.links) {
    if (!known.has(a) || !known.has(b)) continue;
    const na = system.nodes.find((n) => n.id === a)!;
    const nb = system.nodes.find((n) => n.id === b)!;
    svg('line', { x1: sx(na.x), y1: sy(na.y), x2: sx(nb.x), y2: sy(nb.y), class: 'mini-link' }, g);
  }
  const describe = (id: string) => {
    const kind = kindOf(id);
    const lines = [`<h3>${esc(nameOf(id))}</h3>`, `<p>${esc(kind === 'hidden' ? 'type not known yet' : KIND_LABEL[kind])}</p>`];
    if (id === system.entry) lines.push('<p class="entry-tag">entry point (gateway)</p>');
    else if (entries.includes(id)) lines.push('<p class="entry-tag">your backdoor</p>');
    const seen = intel?.agents[id] ?? [];
    if (seen.length) {
      lines.push('<p class="rs-dim">kinds of agents met here:</p><ul class="entry-agents">');
      seen.forEach((s, i) => {
        const st = WARRIORS[s.type];
        const icon = iconBody(s.icon ?? agentIcon(system.id, WARRIOR_TYPES.indexOf(s.type), s.role)) ?? '';
        const tag = s.known === 'full' ? ' · analyzed' : s.known === 'partial' ? ' · partly analyzed' : ' · not analyzed';
        lines.push(`<li class="entry-agent is-${s.type}${st.ai === 'stationary' ? ' is-fixed' : ''}" data-kind="${i}"><svg class="entry-agent-icon" viewBox="0 0 512 512">${icon}</svg><span class="entry-agent-line"><b>${esc(s.typeName)}</b> · ${esc(ROLE_SHORT[s.role])}<span class="rs-dim">${tag}</span></span></li>`);
      });
      lines.push('</ul>');
    } else if (identified.has(id) || known.has(id)) lines.push('<p class="rs-dim">no agents met here</p>');
    info.innerHTML = lines.join('');
    info.querySelectorAll<HTMLElement>('.entry-agent').forEach((li) => {
      const s = seen[Number(li.dataset.kind)];
      tip.attach(li, () => [
        { text: s.typeName, cls: 'tip-title' },
        ...kindInfo(s.typeName, WARRIORS[s.type], s.known).slice(1).map((x) => ({ text: `${x.label}: ${x.value}`, cls: x.value === 'unknown' ? 'c-system' : undefined })),
      ]);
    });
  };
  for (const n of shown) {
    const can = entries.includes(n.id);
    const shape = drawNodeShape(kindOf(n.id), sx(n.x), sy(n.y), can ? 11 : 9, `mini-node kind-${kindOf(n.id)}${can ? ' entry-choice' : ''}`, g);
    shape.addEventListener('mouseenter', () => {
      describe(n.id);
      onHover?.();
    });
    if (can) shape.addEventListener('click', () => {
      close();
      onEnter(n.id);
    });
    const label = svg('text', { x: sx(n.x), y: sy(n.y) + 26, class: 'entry-label' }, g);
    label.textContent = identified.has(n.id) ? n.name : '?';
  }
  box.querySelector('.entry-cancel')!.addEventListener('click', () => {
    close();
    onCancel();
  });
  document.body.appendChild(box);
}
