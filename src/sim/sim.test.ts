import { SCOUT_NOISE, scoutChances } from './programs';
import { describe, expect, it } from 'vitest';
import { testSystem } from '../data/testSystem';
import { FixedClock } from './clock';
import { Game, MOVE_TICKS } from './game';
import { Network } from './network';

function run(game: Game, ticks: number) {
  for (let i = 0; i < ticks; i++) game.step();
}

describe('FixedClock', () => {
  it('turns elapsed time into whole ticks and keeps the remainder', () => {
    const c = new FixedClock(10);
    expect(c.advance(50)).toBe(0);
    expect(c.advance(60)).toBe(1); // 110 ms -> 1 tick, 10 ms left
    expect(c.advance(190)).toBe(2); // 200 ms -> 2 ticks
  });

  it('caps ticks after a long stall', () => {
    expect(new FixedClock(10, 10).advance(60_000)).toBe(10);
  });
});

describe('Network', () => {
  const net = new Network(testSystem);
  it('finds the shortest path', () => {
    expect(net.path('gw', 'core')).toHaveLength(3);
    expect(net.path('gw', 'gw')).toEqual([]);
  });
  it('finds nodes by id or name', () => {
    expect(net.find('ORDERS DB')?.id).toBe('orders');
    expect(net.find('cams')?.id).toBe('cams');
  });
  it('rejects broken links', () => {
    expect(() => new Network({ ...testSystem, links: [['gw', 'nope']] })).toThrow();
  });
});

describe('Game', () => {
  it('moves to a neighbour after MOVE_TICKS ticks', () => {
    const g = new Game(testSystem);
    expect(g.travelTo('edge')).toBe(true);
    run(g, MOVE_TICKS - 1);
    expect(g.currentNode).toBe('gw');
    run(g, 1);
    expect(g.currentNode).toBe('edge');
    expect(g.isMoving).toBe(false);
  });

  it('travels hop by hop to a distant node', () => {
    const g = new Game(testSystem);
    g.revealMap();
    g.travelTo('ai');
    const hops = new Network(testSystem).path('gw', 'ai').length;
    run(g, hops * MOVE_TICKS);
    expect(g.currentNode).toBe('ai');
  });

  it('does not advance while paused', () => {
    const g = new Game(testSystem);
    g.travelTo('edge');
    g.setPaused(true);
    run(g, MOVE_TICKS * 5);
    expect(g.tick).toBe(0);
    expect(g.currentNode).toBe('gw');
    g.setPaused(false);
    run(g, MOVE_TICKS);
    expect(g.currentNode).toBe('edge');
  });

  it('stops after the current hop when travel is cancelled', () => {
    const g = new Game(testSystem);
    g.revealMap();
    g.travelTo('ai');
    run(g, 1);
    g.cancelTravel();
    run(g, MOVE_TICKS * 10);
    expect(g.currentNode).toBe('edge');
  });

  it('emits hop and arrival events', () => {
    const g = new Game(testSystem);
    g.drainEvents();
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    const events = g.drainEvents();
    expect(events.some((e) => e.type === 'hop' && e.nodeId === 'edge')).toBe(true);
    expect(events.some((e) => e.type === 'progress')).toBe(false);
    expect(events.some((e) => e.type === 'moved' && e.nodeId === 'edge')).toBe(true);
  });
});

describe('Game.moveTarget', () => {
  it('reports the final destination, not the next hop', () => {
    const g = new Game(testSystem);
    g.revealMap();
    g.travelTo('ai');
    expect(g.moveTarget).toBe('ai');
  });
});

describe('Game hop state', () => {
  it('exposes the next hop and its progress', () => {
    const g = new Game(testSystem);
    expect(g.nextHop).toBeNull();
    expect(g.hopProgress).toBe(0);
    g.revealMap();
    g.travelTo('ai');
    expect(g.nextHop).toBe('edge');
    run(g, MOVE_TICKS / 2);
    expect(g.hopProgress).toBeCloseTo(0.5);
  });
});

describe('hidden nodes', () => {
  it('show as hidden until the player enters them', () => {
    const game = new Game(testSystem);
    expect(game.kindOf('staff')).toBe('hidden');
    expect(game.findNode('Staff Records')).toBeUndefined();
    expect(game.findNode('staff')).toBeUndefined();
    game.revealMap();
    expect(game.nameOf('orders')).toBe('?1');
    expect(game.nameOf('staff')).toBe('?2');
    expect(game.findNode('?2')?.id).toBe('staff');
    expect(game.findNode('?')).toBeUndefined(); // not next to any hidden node yet
    game.travelTo('staff');
    run(game, MOVE_TICKS * 5);
    expect(game.currentNode).toBe('staff');
    expect(game.nameOf('staff')).toBe('Staff Records');
    expect(game.kindOf('staff')).toBe('database');
    expect(game.findNode('staff records')?.id).toBe('staff');
  });
});

describe('discovery', () => {
  it('knows only the entry and its neighbours at the start', () => {
    const game = new Game(testSystem);
    expect(game.isKnown('gw')).toBe(true);
    expect(game.isKnown('edge')).toBe(true);
    expect(game.isKnown('auth')).toBe(false);
    expect(game.findNode('Auth Service')).toBeUndefined();
  });
  it('reveals neighbours on arrival', () => {
    const game = new Game(testSystem);
    game.travelTo('edge');
    run(game, MOVE_TICKS * 2);
    expect(game.currentNode).toBe('edge');
    expect(game.isKnown('auth')).toBe(true);
    expect(game.isKnown('orders')).toBe(true);
    expect(game.nameOf('orders')).toBe('?1');
    expect(game.isKnown('core')).toBe(false);
  });
});

describe('node actions', () => {
  function at(id: string) {
    const g = new Game(testSystem);
    g.revealMap();
    g.travelTo(id);
    run(g, MOVE_TICKS * 20);
    expect(g.currentNode).toBe(id);
    return g;
  }

  it('download-map in the overseer core identifies every node', () => {
    const g = at('ai');
    expect(g.isIdentified('orders')).toBe(false);
    expect(g.runAction('download-map')).toBe(true);
    expect(g.isIdentified('orders')).toBe(true);
    expect(g.nameOf('orders')).toBe('Orders DB');
  });

  it('refuses actions that need a privilege the player lacks', () => {
    const g = at('ai');
    expect(g.runAction('cancel-alarm')).toBe(false);
    g.privileges.add('overseer');
    expect(g.runAction('cancel-alarm')).toBe(true);
  });

  it('only offers actions of the current node', () => {
    const g = new Game(testSystem);
    expect(g.currentActions).toEqual([]);
    expect(g.runAction('download-map')).toBe(false);
  });

  it('a honeypot looks like its disguise and raises the alarm when used', () => {
    const g = at('trap');
    expect(g.kindOf('trap')).toBe('database');
    g.drainEvents();
    expect(g.runAction('query')).toBe(true);
    expect(g.drainEvents().some((e) => e.type === 'log' && e.line.color === 'alarm3')).toBe(true);
  });
});

describe('gates', () => {
  it('sit on links, in either direction', () => {
    const net = new Network(testSystem);
    expect(net.hasGate('edge', 'auth')).toBe(true);
    expect(net.hasGate('auth', 'edge')).toBe(true);
    expect(net.hasGate('gw', 'edge')).toBe(false);
  });
});

describe('discovering the map', () => {
  it('starts knowing only the entry and its neighbours, and grows as you move', () => {
    const g = new Game(testSystem);
    expect(g.isKnown('gw')).toBe(true);
    expect(g.isKnown('edge')).toBe(true);
    expect(g.isKnown('auth')).toBe(false);
    expect(g.travelTo('ai')).toBe(false); // cannot route to a node you have not found
    g.travelTo('edge');
    run(g, MOVE_TICKS * 2);
    expect(g.isKnown('auth')).toBe(true);
    expect(g.isKnown('orders')).toBe(true);
    expect(g.isKnown('core')).toBe(false);
  });

  it('download-map reveals the whole system', () => {
    const g = new Game(testSystem);
    g.revealMap();
    expect(g.isKnown('ai')).toBe(true);
  });
});

describe('scout', () => {
  /** Rolls in order, as d100 results (1..100). */
  const rolls = (...r: number[]) => {
    let i = 0;
    return () => (r[Math.min(i++, r.length - 1)] - 1) / 100;
  };
  const finish = (g: Game) => {
    for (let i = 0; i < 1000 && g.isScouting; i++) g.step();
  };

  it('chances grow with rating and fall with encryption', () => {
    expect(scoutChances(3, 2).identify).toBeCloseTo(90);
    expect(scoutChances(3, 2).extend).toBeCloseTo(20);
    expect(scoutChances(1000, 1).extend).toBeGreaterThan(99);
  });

  it('picks the best program, the Nth one, or one by name', () => {
    const g = new Game(testSystem);
    expect(g.findProgram('scout')?.name).toBe('Hawkeye V2');
    expect(g.findProgram('scout', '2')?.name).toBe('Owl 1.0');
    expect(g.findProgram('scout', 'owl 1.0')?.rating).toBe(1);
    expect(g.findProgram('scout', '9')).toBeUndefined();
  });

  it('always finds the neighbours, even when every roll fails', () => {
    const g = new Game(testSystem, rolls(100));
    g.travelTo('edge');
    run(g, MOVE_TICKS * 2);
    g.runProgram('scout');
    for (let i = 0; i < 1000 && g.isScouting; i++) g.step();
    for (const n of g.network.neighbours('edge')) expect(g.isKnown(n.id)).toBe(true);
  });

  it('makes noise in the node it runs from', () => {
    const g = new Game(testSystem, rolls(100));
    expect(g.runProgram('scout')).toBe(true);
    expect(g.noise.get('gw')).toBe(SCOUT_NOISE);
  });

  it('identifies a hidden neighbour on a good roll and stops on a bad extend roll', () => {
    const s = new Game(testSystem, rolls(1, 100));
    s.travelTo('edge');
    run(s, MOVE_TICKS * 2);
    expect(s.isIdentified('orders')).toBe(false);
    s.runProgram('scout');
    expect(s.travelTo('gw')).toBe(false); // busy scouting
    finish(s);
    expect(s.isIdentified('orders')).toBe(true);
    expect(s.isKnown('core')).toBe(false);
  });

  it('a hidden neighbour stays hidden on a bad roll', () => {
    const s = new Game(testSystem, rolls(100));
    s.travelTo('edge');
    run(s, MOVE_TICKS * 2);
    s.runProgram('scout');
    finish(s);
    expect(s.isIdentified('orders')).toBe(false);
  });

  it('strong rolls look further, up to the whole map', () => {
    const s = new Game(testSystem, rolls(1));
    s.runProgram('scout');
    finish(s);
    expect(s.knownCount).toBe(testSystem.nodes.length);
    expect(s.isIdentified('staff')).toBe(true);
  });
});

describe('auto-pause', () => {
  it('stops time when travel ends, not after each hop', () => {
    const g = new Game(testSystem);
    g.revealMap();
    g.setAutoPause(true);
    g.travelTo('auth');
    run(g, MOVE_TICKS);
    expect(g.currentNode).toBe('edge');
    expect(g.paused).toBe(false);
    run(g, MOVE_TICKS);
    expect(g.currentNode).toBe('auth');
    expect(g.paused).toBe(true);
  });

  it('stops time when a program ends', () => {
    const g = new Game(testSystem, () => 0.99);
    g.setAutoPause(true);
    g.runProgram('scout');
    for (let i = 0; i < 100 && !g.paused; i++) g.step();
    expect(g.isScouting).toBe(false);
    expect(g.paused).toBe(true);
  });

  it('a new action lets time run again', () => {
    const g = new Game(testSystem);
    g.setAutoPause(true);
    g.setPaused(true);
    g.travelTo('edge');
    expect(g.paused).toBe(false);
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(true);
    g.runProgram('scout');
    expect(g.paused).toBe(false);
  });

  it('without auto-pause a route set while paused waits', () => {
    const g = new Game(testSystem);
    g.setPaused(true);
    g.travelTo('edge');
    expect(g.paused).toBe(true);
  });

  it('is off by default', () => {
    const g = new Game(testSystem);
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(false);
  });
});
