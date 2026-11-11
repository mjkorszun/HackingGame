/**
 * Random networks. A generated network is saved only as its tiny seed record (a few dozen bytes);
 * the generator rebuilds exactly the same network from it every time.
 */
import type { NodeDef, NodeKind, SystemDef } from './types';

/** Everything needed to rebuild a generated network. */
export interface NetworkSeed {
  /** Unique id, also seeds the files inside it. */
  id: string;
  /** What kind of business it is: decides which nodes it has. */
  template: 'pizzeria';
  seed: number;
  name: string;
  location: string;
  security: number;
  /** What a standard skimmer takes from this business each day, in sats. */
  income?: number;
}

/** Small seeded generator (same seed, same sequence). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PIZZERIA_NAMES = ["Giorgio's Pizzeria", 'Mamma Rosa Pizza', 'Slice of Napoli', 'Forno Bello', "Luigi's Late Pizza", 'Pizza Vesuvio'];
const CITIES = ['Warsaw, PL', 'Kraków, PL', 'Berlin, DE', 'Prague, CZ', 'Vienna, AT', 'Lyon, FR'];

/** Picks a name and place for a new local network. Returns the record to save. */
export function newPizzeria(seed: number): NetworkSeed {
  const r = rng(seed);
  const name = PIZZERIA_NAMES[Math.floor(r() * PIZZERIA_NAMES.length)];
  const location = CITIES[Math.floor(r() * CITIES.length)];
  return { id: `pz${seed.toString(36)}`, template: 'pizzeria', seed, name, location, security: 1, income: 0.08 };
}

/**
 * A small pizzeria: orders come in through the order intake (the real way in, no "public gateway"),
 * land in an orders database next to the customer database, and a camera controller watches the shop.
 * Some shops also have a payments table, kitchen control, a delivery robot or a relay in between.
 */
export function generate(seed: NetworkSeed): SystemDef {
  const r = rng(seed.seed * 7919 + 17);
  const nodes: NodeDef[] = [];
  const links: [string, string][] = [];
  const add = (id: string, name: string, kind: NodeKind, x: number, y: number, hidden = false) => nodes.push({ id, name, kind, x, y, hidden });
  add('intake', 'Order Intake', 'gateway', 0, 1);
  let hub = 'intake';
  if (r() < 0.3) {
    add('lan', 'Shop LAN', 'relay', 1, 1);
    links.push(['intake', 'lan']);
    hub = 'lan';
  }
  const x0 = hub === 'lan' ? 2 : 1;
  add('orders', 'Orders DB', 'database', x0, 1);
  links.push([hub, 'orders']);
  add('customers', 'Customer DB', 'database', x0 + 1, 0, r() < 0.5);
  links.push(['orders', 'customers']);
  add('cams', 'Shop Cameras', 'camera', x0 - 1, 2);
  links.push([hub, 'cams']);
  if (r() < 0.5) {
    add('payments', 'Payments', 'database', x0 + 1, 2, true);
    links.push(['orders', 'payments']);
  }
  if (r() < 0.4) {
    add('kitchen', 'Kitchen Control', 'physical', x0 + 1, 1);
    links.push(['orders', 'kitchen']);
  }
  if (r() < 0.5) {
    add('bot', 'Delivery Bot', 'vehicle', x0 + 2, 1);
    links.push([nodes.some((n) => n.id === 'kitchen') ? 'kitchen' : 'orders', 'bot']);
  }
  return {
    id: seed.id,
    name: seed.name,
    location: seed.location,
    entry: 'intake',
    security: seed.security,
    encryption: 1,
    fileSeed: seed.id,
    local: true,
    nodes,
    links,
  };
}
