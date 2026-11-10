import type { SystemDef } from '../sim/types';

/**
 * A small hand-made system for the skeleton. Placeholder content only:
 * real systems will be generated later.
 */
export const testSystem: SystemDef = {
  id: 'halcyon',
  name: 'Halcyon Logistics',
  location: 'Frankfurt, DE',
  entry: 'gw',
  nodes: [
    { id: 'gw', name: 'Public Gateway', kind: 'gateway', x: 0, y: 2 },
    { id: 'edge', name: 'Edge Router', kind: 'router', x: 1, y: 2 },
    { id: 'auth', name: 'Auth Service', kind: 'identity', x: 2, y: 1 },
    { id: 'orders', name: 'Orders Table', kind: 'database', x: 2, y: 3 },
    { id: 'core', name: 'Service Mesh', kind: 'router', x: 3, y: 2 },
    { id: 'cams', name: 'Camera Hub', kind: 'camera', x: 4, y: 1 },
    { id: 'staff', name: 'Staff Records', kind: 'database', x: 4, y: 3, hidden: true },
    { id: 'ai', name: 'Overseer Core', kind: 'overseer', x: 5, y: 2 },
  ],
  links: [
    ['gw', 'edge'],
    ['edge', 'auth'],
    ['edge', 'orders'],
    ['auth', 'core'],
    ['orders', 'core'],
    ['core', 'cams'],
    ['core', 'staff'],
    ['cams', 'ai'],
    ['staff', 'ai'],
  ],
};
