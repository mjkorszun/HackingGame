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
    expect(net.find('ORDERS TABLE')?.id).toBe('orders');
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
    g.travelTo('ai');
    expect(g.moveTarget).toBe('ai');
  });
});

describe('Game hop state', () => {
  it('exposes the next hop and its progress', () => {
    const g = new Game(testSystem);
    expect(g.nextHop).toBeNull();
    expect(g.hopProgress).toBe(0);
    g.travelTo('ai');
    expect(g.nextHop).toBe('edge');
    run(g, MOVE_TICKS / 2);
    expect(g.hopProgress).toBeCloseTo(0.5);
  });
});
