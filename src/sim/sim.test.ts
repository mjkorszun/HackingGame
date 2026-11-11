import { clickAction, filePrice, type DataFile } from './files';
import { SCOUT_NOISE, scoutChances } from './programs';
import { describe, expect, it } from 'vitest';
import { testSystem } from '../data/testSystem';
import { FixedClock } from './clock';
import { Game, MOVE_TICKS } from './game';
import { Network } from './network';

/** The test system without its agents, so a query never pauses a test that is about something else. */
const quiet = { ...testSystem, agents: [] };

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
    const g = new Game(quiet);
    expect(g.travelTo('edge')).toBe(true);
    run(g, MOVE_TICKS - 1);
    expect(g.currentNode).toBe('gw');
    run(g, 1);
    expect(g.currentNode).toBe('edge');
    expect(g.isMoving).toBe(false);
  });

  it('travels hop by hop to a distant node', () => {
    const g = new Game(quiet);
    g.revealMap();
    g.travelTo('ai');
    const hops = new Network(testSystem).path('gw', 'ai').length;
    run(g, hops * MOVE_TICKS);
    expect(g.currentNode).toBe('ai');
  });

  it('does not advance while paused', () => {
    const g = new Game(quiet);
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
    const g = new Game(quiet);
    g.revealMap();
    g.travelTo('ai');
    run(g, 1);
    g.cancelTravel();
    run(g, MOVE_TICKS * 10);
    expect(g.currentNode).toBe('edge');
  });

  it('emits hop and arrival events', () => {
    const g = new Game(quiet);
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
    const g = new Game(quiet);
    g.revealMap();
    g.travelTo('ai');
    expect(g.moveTarget).toBe('ai');
  });
});

describe('Game hop state', () => {
  it('exposes the next hop and its progress', () => {
    const g = new Game(quiet);
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
    const game = new Game(quiet);
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
    const game = new Game(quiet);
    expect(game.isKnown('gw')).toBe(true);
    expect(game.isKnown('edge')).toBe(true);
    expect(game.isKnown('auth')).toBe(false);
    expect(game.findNode('Auth Service')).toBeUndefined();
  });
  it('reveals neighbours on arrival', () => {
    const game = new Game(quiet);
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
    const g = new Game(quiet);
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
    const g = new Game(quiet);
    expect(g.currentActions).toEqual([]);
    expect(g.runAction('download-map')).toBe(false);
  });

  it('a honeypot looks like its disguise and raises the alarm when used', () => {
    const g = at('trap');
    expect(g.kindOf('trap')).toBe('database');
    g.drainEvents();
    expect(g.scanCommand('all')).toBe(true); // touching its files springs the trap
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
    const g = new Game(quiet);
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
    const g = new Game(quiet);
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
    const g = new Game(quiet);
    expect(g.findProgram('scout')?.name).toBe('Hawkeye V2');
    expect(g.findProgram('scout', '2')?.name).toBe('Owl 1.0');
    expect(g.findProgram('scout', 'owl 1.0')?.rating).toBe(1);
    expect(g.findProgram('scout', '9')).toBeUndefined();
  });

  it('always finds the neighbours, even when every roll fails', () => {
    const g = new Game(quiet, rolls(100));
    g.travelTo('edge');
    run(g, MOVE_TICKS * 2);
    g.runProgram('scout');
    for (let i = 0; i < 1000 && g.isScouting; i++) g.step();
    for (const n of g.network.neighbours('edge')) expect(g.isKnown(n.id)).toBe(true);
  });

  it('makes noise in the node it runs from', () => {
    const g = new Game(quiet, rolls(100));
    expect(g.runProgram('scout')).toBe(true);
    expect(g.noise.get('gw')).toBe(SCOUT_NOISE);
  });

  it('identifies a hidden neighbour on a good roll and stops on a bad extend roll', () => {
    const s = new Game(quiet, rolls(1, 100));
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
    const s = new Game(quiet, rolls(100));
    s.travelTo('edge');
    run(s, MOVE_TICKS * 2);
    s.runProgram('scout');
    finish(s);
    expect(s.isIdentified('orders')).toBe(false);
  });

  it('strong rolls look further, up to the whole map', () => {
    const s = new Game(quiet, rolls(1));
    s.runProgram('scout');
    finish(s);
    expect(s.knownCount).toBe(testSystem.nodes.length);
    expect(s.isIdentified('staff')).toBe(true);
  });
});

describe('stub programs', () => {
  it('starts paused', () => {
    expect(new Game(quiet).paused).toBe(true);
  });
  it('passive programs only explain themselves; attack needs an agent here', () => {
    const g = new Game(quiet);
    for (const t of ['hide', 'analyze'] as const) expect(g.runProgram(t)).toBe(true);
    expect(g.runProgram('attack')).toBe(false);
    expect(g.isScouting).toBe(false);
  });
});

describe('data files and scan', () => {
  const inOrders = () => {
    const g = new Game(quiet);
    g.autoPause = false;
    g.setPaused(false);
    g.revealMap();
    g.travelTo('orders');
    run(g, MOVE_TICKS * 3);
    expect(g.currentNode).toBe('orders');
    // Protections get their own tests.
    for (const f of g.filesIn('orders') as import('./files').DataFile[]) f.protection = undefined;
    return g;
  };
  const finish = (g: Game) => {
    for (let i = 0; i < 2000 && g.isBusy; i++) g.step();
  };

  it('databases hold 6-12 files, the same every run; other nodes none', () => {
    const a = new Game(quiet).filesIn('orders');
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(a.length).toBeLessThanOrEqual(12);
    expect(new Game(quiet).filesIn('orders').map((f) => f.content)).toEqual(a.map((f) => f.content));
    expect(new Game(quiet).filesIn('gw')).toEqual([]);
  });

  it('scans one file', () => {
    const g = inOrders();
    expect(g.scanCommand('f2')).toBe(true);
    expect(g.travelTo('edge')).toBe(false); // busy
    finish(g);
    expect(g.filesIn('orders').filter((f) => f.scanned).map((f) => f.id)).toEqual(['f2']);
  });

  it('scan all starts at the chosen file, wraps around and skips scanned ones', () => {
    const g = inOrders();
    g.scanCommand('f1');
    finish(g);
    const n = g.filesIn('orders').length;
    g.scanCommand('all f3');
    expect(g.scanningFile?.fileId).toBe('f3');
    finish(g);
    expect(g.filesIn('orders').every((f) => f.scanned)).toBe(true);
    expect(n).toBeGreaterThan(3);
    expect(g.scanCommand('all')).toBe(false); // nothing left
  });

  it('scanned files offer actions by content; evaluate, identify and download work', () => {
    const g = inOrders();
    g.scanCommand('all');
    finish(g);
    const files = g.filesIn('orders');
    const valuable = files.find((f) => f.content === 'valuable')!;
    const worthless = files.find((f) => f.content === 'worthless')!;
    expect(g.fileAction('download', worthless.id)).toBe(false);
    expect(g.fileAction('evaluate', valuable.id)).toBe(true);
    expect(valuable.evaluated).toBe(true);
    expect(g.fileAction('download', valuable.id)).toBe(true);
    expect(g.loot[0].price).toBe(valuable.price);
    expect(g.fileAction('download', valuable.id)).toBe(false); // only once
    const software = files.find((f) => f.content === 'software');
    if (software) {
      const before = g.programs.length;
      expect(g.fileAction('identify', software.id)).toBe(true);
      expect(g.fileAction('download', software.id)).toBe(true);
      expect(g.programs.length).toBe(before); // paid out only when the run ends
      expect(g.loot.at(-1)!.software!.name).toBe(software.software!.name);
    }
    const contract = files.find((f) => f.content === 'contract');
    if (contract) {
      expect(g.fileAction(contract.need === 'alter' ? 'delete' : 'alter', contract.id)).toBe(false);
      expect(g.fileAction(contract.need!, contract.id)).toBe(true);
    }
  });

  it('a honeytoken looks valuable unless detected; downloading it springs the trap', () => {
    const fail = new Game(quiet, () => 0.99); // every detection roll fails
    fail.revealMap();
    fail.autoPause = false;
    fail.setPaused(false);
    fail.travelTo('orders');
    run(fail, MOVE_TICKS * 3);
    const f = fail.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(f, { content: 'honeytoken', price: 500, protection: undefined });
    fail.scanCommand(f.id);
    finish(fail);
    expect(f.detected).toBeFalsy();
    fail.drainEvents();
    expect(fail.fileAction('download', f.id)).toBe(true);
    expect(fail.drainEvents().some((e) => e.type === 'log' && e.line.color === 'alarm3')).toBe(true);
    expect(fail.loot.length).toBe(0);

    const ok = new Game(quiet, () => 0); // every detection roll succeeds
    ok.revealMap();
    ok.autoPause = false;
    ok.setPaused(false);
    ok.travelTo('orders');
    run(ok, MOVE_TICKS * 3);
    const h = ok.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(h, { content: 'honeytoken', price: 500 });
    h.protection = undefined;
    ok.scanCommand(h.id);
    finish(ok);
    expect(h.detected).toBeFalsy(); // scan alone doesn't tell
    expect(ok.fileAction('evaluate', h.id)).toBe(true);
    expect(h.detected).toBe(true); // evaluate sees through it
    expect(ok.fileAction('download', h.id)).toBe(false);
  });

  it('protections: kill switch, seal, tracker, lock', () => {
    const g = inOrders();
    const fs = g.filesIn('orders') as import('./files').DataFile[];
    Object.assign(fs[0], { protection: 'killswitch' });
    Object.assign(fs[1], { protection: 'seal' });
    Object.assign(fs[2], { protection: 'lock', lockPrivilege: 'admin' });
    g.scanCommand(fs[0].id);
    finish(g);
    expect(fs[0].deleted).toBe(true); // scanned before defusing
    expect(g.scanCommand(fs[1].id)).toBe(false); // sealed
    expect(g.fileAction('decrypt', fs[1].id)).toBe(true);
    expect(g.scanCommand(fs[1].id)).toBe(true);
    finish(g);
    expect(fs[1].scanned).toBe(true);
    expect(g.scanCommand(fs[2].id)).toBe(false); // locked, no admin
    expect(g.fileAction('forge', fs[2].id)).toBe(true);
    expect(g.scanCommand(fs[2].id)).toBe(true);
    finish(g);
    const t = fs[3];
    t.protection = 'killswitch';
    expect(g.fileAction('defuse', t.id)).toBe(true);
    expect(t.protection).toBeUndefined();
  });

  it('a keyring gives a privilege or the keys', () => {
    const g = inOrders();
    const f = g.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(f, { content: 'keyring', grant: 'security' });
    g.scanCommand(f.id);
    finish(g);
    expect(g.fileAction('extract', f.id)).toBe(true);
    expect(g.privileges.has('security')).toBe(true);
    expect(g.fileAction('extract', f.id)).toBe(false);
  });

  it('evaluate needs an evaluate program', () => {
    const g = inOrders();
    g.scanCommand('all');
    finish(g);
    g.programs.splice(g.programs.findIndex((p) => p.type === 'evaluate'), 1);
    const valuable = g.filesIn('orders').find((f) => f.content === 'valuable')!;
    expect(g.fileAction('evaluate', valuable.id)).toBe(false);
  });

  it('there is nothing to scan outside databases', () => {
    const g = new Game(quiet);
    expect(g.scanCommand('')).toBe(false);
  });
});

describe('auto-pause', () => {
  it('stops time when travel ends, not after each hop', () => {
    const g = new Game(quiet);
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
    const g = new Game(quiet, () => 0.99);
    g.setAutoPause(true);
    g.runProgram('scout');
    for (let i = 0; i < 100 && !g.paused; i++) g.step();
    expect(g.isScouting).toBe(false);
    expect(g.paused).toBe(true);
  });

  it('a new action lets time run again', () => {
    const g = new Game(quiet);
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
    const g = new Game(quiet);
    g.autoPause = false;
    g.setPaused(true);
    g.travelTo('edge');
    expect(g.paused).toBe(true);
  });

  it('is on by default, and its pauses are marked automatic', () => {
    const g = new Game(quiet);
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(true);
    const ev = g.drainEvents().find((e) => e.type === 'paused' && e.paused);
    expect(ev).toMatchObject({ paused: true, auto: true });
  });

  it('when off, time keeps running after an action', () => {
    const g = new Game(quiet);
    g.autoPause = false;
    g.setPaused(false);
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(false);
  });
});

describe('file left click', () => {
  const base = { id: 'f1', scanned: true, price: 100 } as DataFile;
  it('evaluates a valuable file first, then downloads it', () => {
    const f = { ...base, content: 'valuable' } as DataFile;
    expect(clickAction(f)).toBe('evaluate');
    f.evaluated = true;
    expect(clickAction(f)).toBe('download');
    f.downloaded = true;
    expect(clickAction(f)).toBeUndefined();
  });
  it('cracks a seal before anything else', () => {
    expect(clickAction({ ...base, scanned: false, content: 'valuable', protection: 'seal' } as DataFile)).toBe('decrypt');
    expect(clickAction({ ...base, scanned: false, content: 'valuable' } as DataFile)).toBeUndefined();
  });
  it('downloads software', () => {
    expect(clickAction({ ...base, content: 'software' } as DataFile)).toBe('download');
    expect(clickAction({ ...base, content: 'software', downloaded: true } as DataFile)).toBeUndefined();
  });
  it('does what a contract needs', () => {
    expect(clickAction({ ...base, content: 'contract', need: 'delete' } as DataFile)).toBe('delete');
    expect(clickAction({ ...base, content: 'contract', need: 'alter' } as DataFile)).toBe('alter');
    expect(clickAction({ ...base, content: 'contract', need: 'alter', altered: true } as DataFile)).toBeUndefined();
  });
});

describe('run and contract', () => {
  it('the contract file sits in its database; altering it completes the contract and the report pays out', () => {
    const g = new Game(quiet, () => 0);
    g.autoPause = false;
    g.setPaused(false);
    g.revealMap();
    g.travelTo('orders');
    run(g, MOVE_TICKS * 3);
    expect(g.currentNode).toBe('orders');
    const c = g.filesIn('orders').find((f) => f.content === 'contract')!;
    expect(c.need).toBe('alter');
    Object.assign(c, { scanned: true, protection: undefined });
    const v = g.filesIn('orders').find((f) => f.content === 'valuable')!;
    Object.assign(v, { scanned: true, protection: undefined });
    expect(g.contractDone).toBe(false);
    expect(g.fileAction('alter', c.id)).toBe(true);
    expect(g.contractDone).toBe(true);
    expect(g.fileAction('download', v.id)).toBe(true);
    const r = g.endRun();
    expect(r.success).toBe(true);
    expect(r.pay).toBe(50);
    expect(r.files[0].price).toBe(v.price);
    expect(r.total).toBe(50 + v.price!);
    expect(g.ended).toBe(true);
  });

  it('without the contract task the run pays only the files', () => {
    const r = new Game(quiet).endRun();
    expect(r.success).toBe(false);
    expect(r.total).toBe(0);
  });

  it('file prices at security 1 are d30+20', () => {
    for (const r of [0, 0.5, 0.999]) {
      const p = filePrice(1, () => r);
      expect(p).toBeGreaterThanOrEqual(21);
      expect(p).toBeLessThanOrEqual(50);
    }
  });
});

describe('agents', () => {
  /** A game with one warrior parked in the player's node, time running, rolls fixed. */
  const setup = (roll: number) => {
    const g = new Game({ ...testSystem, agents: [{ kind: 'warrior', node: 'gw' }] });
    g.autoPause = false;
    g.setPaused(false);
    (g as unknown as { d100: () => number }).d100 = () => roll;
    const a = g.agents[0];
    a.stayLeft = 10_000;
    return { g, a };
  };
  const tick = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.step(); };

  it('a warrior in your node queries you and the game pauses', () => {
    const { g, a } = setup(1);
    tick(g, a.stats.queryEvery);
    expect(g.query?.agentId).toBe(a.id);
    expect(g.paused).toBe(true);
    g.setPaused(false);
    expect(g.paused).toBe(true); // must answer first
  });

  it('ignoring twice: yellow and a second query, then red and hostile', () => {
    const { g, a } = setup(1);
    tick(g, a.stats.queryEvery);
    expect(g.answerQuery('ignore')).toBe(true);
    expect(g.alarm).toBe(1);
    g.setPaused(false);
    tick(g, 25);
    expect(g.query?.agentId).toBe(a.id);
    g.answerQuery('ignore');
    expect(g.alarm).toBe(3);
    expect(a.mood).toBe('hostile');
  });

  it('analyzing one agent reveals every agent of the same type in the system', () => {
    const g = new Game({ ...testSystem, agents: [
      { kind: 'warrior', node: 'gw', type: 'heavy' },
      { kind: 'warrior', node: 'core', type: 'heavy' },
      { kind: 'warrior', node: 'core', type: 'watchful' },
    ] });
    g.autoPause = false;
    g.setPaused(false);
    (g as unknown as { d100: () => number }).d100 = () => 1;
    const [k1, k2, r] = g.agents;
    k1.stayLeft = 10_000;
    for (let i = 0; i < k1.stats.queryEvery; i++) g.step();
    expect(g.query?.agentId).toBe(k1.id);
    expect(k1.known).toBe('full');
    expect(k2.known).toBe('full');
    expect(r.known).toBe('none');
    expect(k1.name).not.toBe(k2.name);
    expect(k1.typeName).toBe(k2.typeName);
    expect(r.typeName).not.toBe(k1.typeName);
  });

  it('a successful deceive leaves you alone until you leave the node', () => {
    const { g, a } = setup(1);
    tick(g, a.stats.queryEvery);
    expect(g.agentCommand('deceive', '')).toBe(true);
    expect(a.mood).toBe('trusting');
    g.setPaused(false);
    tick(g, 100);
    expect(g.query).toBeNull();
  });

  it('a silenced agent turns hostile but raises no alarm', () => {
    const { g, a } = setup(1);
    expect(g.agentCommand('silence', a.name)).toBe(true);
    expect(a.silenced).toBe(true);
    expect(a.mood).toBe('hostile');
    expect(g.alarm).toBe(0);
  });

  it('an attack that does not kill makes it hostile and the alarm red; hostile agents wear down integrity until you are kicked', () => {
    const { g, a } = setup(1);
    g.agentCommand('attack', a.name);
    expect(a.hp).toBe(a.stats.hp - 10);
    expect(g.alarm).toBe(3);
    tick(g, a.stats.attackEvery * 5);
    expect(g.integrity).toBe(0);
    expect(g.kicked).toBe(true);
  });

  it('a strong enough attack kills in one blow, quietly', () => {
    const { g, a } = setup(1);
    g.programs.push({ id: 'big', type: 'attack', name: 'Rocket Launcher V007', rating: 3 });
    g.agentCommand('attack', a.name);
    expect(g.agents).not.toContain(a);
    expect(g.alarm).toBe(0);
  });

  it('a high roll misses the query', () => {
    const { g, a } = setup(100);
    tick(g, a.stats.queryEvery * 3);
    expect(g.query).toBeNull();
  });
});

describe('memory', () => {
  it('a downloaded program can be loaded into free memory and used at once', () => {
    const g = new Game(quiet, Math.random, [], { memory: 150 }); // Mace 15 (attack 3) takes 120 GB
    g.loot.push({ name: 'x f1', label: 'Mace 15', price: 0, evaluated: true, software: { id: 'p500', type: 'attack', name: 'Mace 15', rating: 3 } });
    g.loot.push({ name: 'x f2', label: 'Owl', price: 0, evaluated: true, software: { id: 'p501', type: 'scout', name: 'Owl 2', rating: 1 } });
    expect(g.loadProgram('Mace 15')).toBe(true);
    expect(g.findProgram('attack')?.name).toBe('Mace 15');
    expect(g.loadProgram('Owl 2')).toBe(false); // memory full
  });
});

describe('generated networks', () => {
  it('the same seed record always builds the same network, and it is playable', async () => {
    const { generate, newPizzeria } = await import('./generate');
    const seed = newPizzeria(12345);
    expect(JSON.stringify(seed).length).toBeLessThan(160);
    const a = generate(seed);
    expect(generate(seed)).toEqual(a);
    expect(a.entry).toBe('intake');
    for (const id of ['intake', 'orders', 'customers', 'cams']) expect(a.nodes.some((n) => n.id === id)).toBe(true);
    const g = new Game(a);
    expect(g.filesIn('orders').length).toBeGreaterThan(0);
    // Another pizzeria holds different files.
    const b = new Game(generate(newPizzeria(999)));
    expect(b.filesIn('orders').map((f) => f.content)).not.toEqual(g.filesIn('orders').map((f) => f.content));
  });
});

describe('skimmer and days', () => {
  it('plants only in a database of a local business; each day pays out or gets found', async () => {
    const { generate, newPizzeria } = await import('./generate');
    const { passDay } = await import('../ui/account');
    const net = newPizzeria(42);
    const sys = generate(net);
    const g = new Game(sys);
    g.autoPause = false;
    g.setPaused(false);
    expect(g.runProgram('skimmer')).toBe(false); // at the intake, not a database
    g.revealMap();
    g.travelTo('orders');
    run(g, MOVE_TICKS * 3);
    expect(g.runProgram('skimmer')).toBe(true);
    expect(g.planted?.name).toBe('Skimmer 1.0');
    const account = { sats: 0, programs: [], loaded: [], memory: 500, day: 1, reputation: 0, networks: [net], skimmers: [{ netId: net.id, program: g.planted! }], news: [] };
    passDay(account, () => 0.99);
    expect(account.sats).toBeCloseTo(0.08);
    passDay(account, () => 0);
    expect(account.skimmers.length).toBe(0);
    expect(net.security).toBe(2);
  });
});

describe('software development', () => {
  it('a day of work brings the project closer; a bug pushes the end back', async () => {
    const { newProject, work } = await import('./development');
    const p = newProject('hide', 2, 'Veil 1.0');
    expect(p.daysLeft).toBe(6);
    expect(work(p, 1, () => 0.99)).toEqual({ days: 1, bugs: [], done: false });
    expect(p.daysLeft).toBe(5);
    // bug roll (0) then extra-days roll (0.99 → 3 days)
    const rolls = [0, 0.99];
    const r = work(p, 1, () => rolls.shift() ?? 0.99);
    expect(r.bugs).toEqual([3]);
    expect(p.daysLeft).toBe(7);
  });

  it('finish works the days left; with no bug it ends, with a bug it does not', async () => {
    const { newProject, work } = await import('./development');
    const a = newProject('scan', 1, 'A');
    expect(work(a, a.daysLeft, () => 0.99).done).toBe(true);
    const b = newProject('scan', 1, 'B');
    const rolls = [0.99, 0, 0];
    const r = work(b, b.daysLeft, () => rolls.shift() ?? 0.99);
    expect(r.days).toBe(3);
    expect(r.done).toBe(false);
    expect(b.daysLeft).toBe(1);
  });

  it('a finished program gets a rarity and that many different traits', async () => {
    const { finishProgram, newProject, rollRarity, RARITY_TRAITS } = await import('./development');
    expect(rollRarity(() => 0)).toBe('common');
    expect(rollRarity(() => 0.995)).toBe('prototype');
    const proto = finishProgram(newProject('attack', 3, 'Spike'), 'p200', 'you', (() => { let first = true; return () => { if (first) { first = false; return 0.995; } return 0.3; }; })());
    expect(proto.rarity).toBe('prototype');
    expect(proto.traits!.length).toBe(RARITY_TRAITS.prototype);
    expect(new Set(proto.traits).size).toBe(4);
    expect(proto.author).toBe('you');
  });

  it('several days pass at once: skimmers pay for each day and the counter moves', async () => {
    const { newPizzeria } = await import('./generate');
    const { passDay } = await import('../ui/account');
    const net = newPizzeria(7);
    const account = { sats: 0, programs: [], loaded: [], memory: 500, day: 1, reputation: 0, networks: [net], skimmers: [{ netId: net.id, program: { id: 'p1', type: 'skimmer' as const, name: 'S', rating: 1, efficiency: 1, detection: 2 } }], news: [] };
    passDay(account, () => 0.99, 7);
    expect(account.day).toBe(8);
    expect(account.sats).toBeCloseTo(0.56);
  });
});
