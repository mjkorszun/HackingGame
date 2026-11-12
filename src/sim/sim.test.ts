import { clickAction, filePrice, type DataFile } from './files';
import { MAPPER_COOLDOWN, MAPPER_NOISE, mapperChances } from './programs';
import { describe, expect, it } from 'vitest';
import { testSystem } from '../data/testSystem';
import { FixedClock } from './clock';
import { Game, MOVE_TICKS, shieldHp, warriorDamage } from './game';
import { Network } from './network';

/** The test system without its agents, so a query never pauses a test that is about something else. */
// No agents, and gates that never stop you (their own tests use testSystem).
const quiet = { ...testSystem, agents: [], gates: [] as [string, string][] };

function run(game: Game, ticks: number) {
  for (let i = 0; i < ticks; i++) game.step();
}

/** Starts a file action and lets its loading bar fill. */
function act(game: Game, action: import('./files').FileAction, fileId: string): boolean {
  const ok = game.fileAction(action, fileId);
  for (let i = 0; i < 1000 && game.isBusy; i++) game.step();
  return ok;
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

describe('mapper', () => {
  /** Rolls in order, as d100 results (1..100). */
  const rolls = (...r: number[]) => {
    let i = 0;
    return () => (r[Math.min(i++, r.length - 1)] - 1) / 100;
  };
  const finish = (g: Game) => {
    for (let i = 0; i < 1000 && g.isMapping; i++) g.step();
  };

  it('chances grow with rating and fall with encryption', () => {
    expect(mapperChances(3, 2).identify).toBeCloseTo(90);
    expect(mapperChances(3, 2).extend).toBeCloseTo(20);
    expect(mapperChances(1000, 1).extend).toBeGreaterThan(99);
  });

  it('picks the best program, the Nth one, or one by name', () => {
    const g = new Game(quiet);
    expect(g.findProgram('mapper')?.name).toBe('Hawkeye V2');
    expect(g.findProgram('mapper', '2')?.name).toBe('Owl 1.0');
    expect(g.findProgram('mapper', 'owl 1.0')?.rating).toBe(1);
    expect(g.findProgram('mapper', '9')).toBeUndefined();
  });

  it('always finds the neighbours, even when every roll fails', () => {
    const g = new Game(quiet, rolls(100));
    g.travelTo('edge');
    run(g, MOVE_TICKS * 2);
    g.runProgram('mapper');
    for (let i = 0; i < 1000 && g.isMapping; i++) g.step();
    for (const n of g.network.neighbours('edge')) expect(g.isKnown(n.id)).toBe(true);
  });

  it('needs a long time to recharge after a run', () => {
    const g = new Game(quiet, rolls(100));
    g.autoPause = false;
    g.setPaused(false);
    expect(g.runProgram('mapper')).toBe(true);
    finish(g);
    expect(g.runProgram('mapper')).toBe(false);
    expect(g.mapperCooldown).toBeGreaterThan(0);
    run(g, MAPPER_COOLDOWN);
    expect(g.mapperCooldown).toBe(0);
    expect(g.runProgram('mapper')).toBe(true);
  });

  it('makes noise in the node it runs from', () => {
    const g = new Game(quiet, rolls(100));
    expect(g.runProgram('mapper')).toBe(true);
    expect(g.noise.get('gw')).toBe(MAPPER_NOISE);
  });

  it('identifies a hidden neighbour on a good roll and stops on a bad extend roll', () => {
    const s = new Game(quiet, rolls(1, 100));
    s.travelTo('edge');
    run(s, MOVE_TICKS * 2);
    expect(s.isIdentified('orders')).toBe(false);
    s.runProgram('mapper');
    expect(s.travelTo('gw')).toBe(false); // busy mapping
    finish(s);
    expect(s.isIdentified('orders')).toBe(true);
    expect(s.isKnown('core')).toBe(false);
  });

  it('a hidden neighbour stays hidden on a bad roll', () => {
    const s = new Game(quiet, rolls(100));
    s.travelTo('edge');
    run(s, MOVE_TICKS * 2);
    s.runProgram('mapper');
    finish(s);
    expect(s.isIdentified('orders')).toBe(false);
  });

  it('strong rolls look further, up to the whole map', () => {
    const s = new Game(quiet, rolls(1));
    s.runProgram('mapper');
    finish(s);
    expect(s.knownCount).toBe(testSystem.nodes.length);
    expect(s.isIdentified('staff')).toBe(true);
  });
});

describe('stub programs', () => {
  it('starts paused', () => {
    expect(new Game(quiet).paused).toBe(true);
  });
  it('hide only explains itself, analyze needs a target; a warrior is released as your agent', () => {
    const g = new Game(quiet);
    expect(g.runProgram('hide')).toBe(true);
    expect(g.runProgram('analyze')).toBe(false); // analyze needs an agent here to read
    expect(g.runProgram('warrior')).toBe(true);
    expect(g.allies.length).toBe(1);
    expect(g.runProgram('warrior')).toBe(false); // the only one is already out
    expect(g.isMapping).toBe(false);
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

  it('about a third of the archives that look valuable are worth nothing once evaluated', async () => {
    const { generateFiles, isEmpty, clickAction, EMPTY_SHARE } = await import('./files');
    const all = Array.from({ length: 200 }, (_, i) => generateFiles(`n${i}`, 1)).flat().filter((f) => f.content === 'valuable');
    const empty = all.filter((f) => f.price === 0).length / all.length;
    expect(Math.abs(empty - EMPTY_SHARE)).toBeLessThan(0.07);
    const f = { ...all.find((x) => x.price === 0)!, scanned: true, protection: undefined };
    expect(isEmpty(f)).toBe(false); // not known until evaluated
    expect(clickAction(f)).toBe('evaluate');
    f.evaluated = true;
    expect(isEmpty(f)).toBe(true);
    expect(clickAction(f)).toBeUndefined();
  });

  it('scanned files offer actions by content; evaluate, identify and download work', () => {
    const g = inOrders();
    g.scanCommand('all');
    finish(g);
    const files = g.filesIn('orders');
    const valuable = files.find((f) => f.content === 'valuable')!;
    const worthless = files.find((f) => f.content === 'worthless')!;
    expect(act(g, 'download', worthless.id)).toBe(false);
    expect(act(g, 'evaluate', valuable.id)).toBe(true);
    expect(valuable.evaluated).toBe(true);
    expect(act(g, 'download', valuable.id)).toBe(true);
    expect(g.loot[0].price).toBe(valuable.price);
    expect(act(g, 'download', valuable.id)).toBe(false); // only once
    const software = files.find((f) => f.content === 'software');
    if (software) {
      const before = g.programs.length;
      expect(act(g, 'identify', software.id)).toBe(true);
      expect(act(g, 'download', software.id)).toBe(true);
      expect(g.programs.length).toBe(before); // paid out only when the run ends
      expect(g.loot.at(-1)!.software!.name).toBe(software.software!.name);
    }
    const contract = files.find((f) => f.content === 'contract');
    if (contract) {
      expect(act(g, contract.need === 'alter' ? 'delete' : 'alter', contract.id)).toBe(false);
      expect(act(g, contract.need!, contract.id)).toBe(true);
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
    expect(act(fail, 'download', f.id)).toBe(true);
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
    expect(act(ok, 'evaluate', h.id)).toBe(true);
    expect(h.detected).toBe(true); // evaluate sees through it
    expect(act(ok, 'download', h.id)).toBe(false);
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
    expect(act(g, 'decrypt', fs[1].id)).toBe(true);
    expect(g.scanCommand(fs[1].id)).toBe(true);
    finish(g);
    expect(fs[1].scanned).toBe(true);
    expect(g.scanCommand(fs[2].id)).toBe(false); // locked, no admin
    expect(act(g, 'forge', fs[2].id)).toBe(true);
    expect(g.scanCommand(fs[2].id)).toBe(true);
    finish(g);
    const t = fs[3];
    t.protection = 'killswitch';
    expect(act(g, 'defuse', t.id)).toBe(true);
    expect(t.protection).toBeUndefined();
  });

  it('a file action takes time: its effect lands when the bar is full, and it can be stopped', () => {
    const g = inOrders();
    const f = g.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(f, { protection: 'seal' });
    expect(g.fileAction('decrypt', f.id)).toBe(true);
    expect(f.protection).toBe('seal');
    expect(g.scanningFile?.fileId).toBe(f.id);
    expect(g.fileAction('decrypt', f.id)).toBe(false); // busy
    expect(g.cancelFileJob()).toBe(true);
    expect(g.isBusy).toBe(false);
    expect(f.protection).toBe('seal');
    expect(act(g, 'decrypt', f.id)).toBe(true);
    expect(f.protection).toBeUndefined();
  });

  it('a keyring gives a privilege or the keys', () => {
    const g = inOrders();
    const f = g.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(f, { content: 'keyring', grant: 'security' });
    g.scanCommand(f.id);
    finish(g);
    expect(act(g, 'extract', f.id)).toBe(true);
    expect(g.privileges.has('security')).toBe(true);
    expect(act(g, 'extract', f.id)).toBe(false);
  });

  it('evaluate needs an evaluate program', () => {
    const g = inOrders();
    g.scanCommand('all');
    finish(g);
    g.programs.splice(g.programs.findIndex((p) => p.type === 'evaluate'), 1);
    const valuable = g.filesIn('orders').find((f) => f.content === 'valuable')!;
    expect(act(g, 'evaluate', valuable.id)).toBe(false);
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
    g.runProgram('mapper');
    for (let i = 0; i < 100 && !g.paused; i++) g.step();
    expect(g.isMapping).toBe(false);
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
    g.runProgram('mapper');
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
    expect(act(g, 'alter', c.id)).toBe(true);
    expect(g.contractDone).toBe(true);
    expect(act(g, 'download', v.id)).toBe(true);
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

  it('attack releases a warrior at the agent: a hit that does not kill makes it hostile and the alarm red; it fights your warrior, not you', () => {
    const { g, a } = setup(1);
    expect(g.attackCommand(a.name)).toBe(true);
    const w = g.allies[0];
    expect(w.program.name).toBe('Shooter V3');
    expect(g.programState(w.program.id)).toBe('out');
    tick(g, 3);
    expect(a.hp).toBe(a.stats.hp - warriorDamage(1));
    expect(g.alarm).toBe(3);
    tick(g, 200);
    expect(g.agents).not.toContain(a); // the warrior wins
    expect(g.integrity).toBe(g.maxIntegrity); // the agent shot at the warrior
    expect(w.hp).toBeLessThan(w.maxHp);
  });

  it('a strong enough warrior kills in one blow, quietly', () => {
    const { g, a } = setup(1);
    g.programs.push({ id: 'big', type: 'warrior', name: 'Rocket Launcher V007', rating: 5 });
    g.attackCommand(a.name);
    tick(g, 3);
    expect(g.agents).not.toContain(a);
    expect(g.alarm).toBe(0);
  });

  it('a destroyed warrior is lost for this run; with no warrior around, hostile agents wear you down', () => {
    const { g, a } = setup(1);
    a.stats = { ...a.stats, damage: 100 };
    g.attackCommand(a.name);
    tick(g, 3 + a.stats.attackEvery);
    expect(g.allies.length).toBe(0);
    expect(g.programState('p3')).toBe('lost');
    expect(g.findProgram('warrior')).toBeUndefined();
    tick(g, a.stats.attackEvery * 2);
    expect(g.kicked).toBe(true);
  });

  it('a loaded shield jumps out at the first shot and takes the hits; when it breaks it is lost for this run', () => {
    const { g, a } = setup(1);
    g.agentCommand('silence', a.name); // hostile, no alarm
    expect(a.mood).toBe('hostile');
    tick(g, a.stats.attackEvery);
    const s = g.allies.find((x) => x.program.type === 'shield')!;
    expect(s.hp).toBe(shieldHp(1) - a.stats.damage);
    expect(g.integrity).toBe(g.maxIntegrity);
    tick(g, a.stats.attackEvery * 10);
    expect(g.programState(s.program.id)).toBe('lost');
    expect(g.integrity).toBeLessThan(g.maxIntegrity);
  });

  it('a scout flies out, identifies nodes and reads agents until one catches it', () => {
    const g = new Game({ ...testSystem, agents: [{ kind: 'warrior', node: 'orders' }] });
    g.autoPause = false;
    g.setPaused(false);
    (g as unknown as { d100: () => number }).d100 = () => 100; // never caught
    g.agents[0].stayLeft = 100_000;
    g.programs.push({ id: 'sc', type: 'scout', name: 'Kite 9', rating: 9 });
    expect(g.scoutCommand('')).toBe(true);
    expect(g.programState('sc')).toBe('out');
    tick(g, 2000);
    expect(g.isIdentified('orders')).toBe(true);
    expect(g.agents[0].known).not.toBe('none');
    (g as unknown as { d100: () => number }).d100 = () => 1; // caught on the next node with an agent
    g.orderAlly('Kite 9', 'unload');
    tick(g, 2000);
    expect(g.allies.length).toBe(0);
    g.agents[0].node = 'edge';
    g.travelTo('gw');
    tick(g, 100);
    expect(g.scoutCommand('Edge Relay')).toBe(true);
    tick(g, 100);
    expect(g.programState('sc')).toBe('lost');
    expect(g.alarm).toBe(1);
  });

  it('your agent can stay, follow you, and unload back into memory', () => {
    const { g } = setup(100);
    g.runProgram('warrior');
    const w = g.allies[0];
    expect(g.orderAlly('', 'follow')).toBe(true);
    g.travelTo('edge');
    tick(g, MOVE_TICKS * 3);
    expect(g.currentNode).toBe('edge');
    expect(w.node).toBe('edge');
    g.orderAlly('Shooter V3', 'stay');
    g.travelTo('gw');
    tick(g, MOVE_TICKS * 3);
    expect(w.node).toBe('edge');
    g.orderAlly('Shooter V3', 'unload');
    tick(g, 100);
    expect(g.allies.length).toBe(0);
    expect(g.findProgram('warrior')?.name).toBe('Shooter V3');
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
    g.loot.push({ name: 'x f1', label: 'Mace 15', price: 0, evaluated: true, software: { id: 'p500', type: 'warrior', name: 'Mace 15', rating: 3 } });
    g.loot.push({ name: 'x f2', label: 'Owl', price: 0, evaluated: true, software: { id: 'p501', type: 'mapper', name: 'Owl 2', rating: 1 } });
    expect(g.loadProgram('Mace 15')).toBe(true);
    expect(g.findProgram('warrior')?.name).toBe('Mace 15');
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
  it('plants only in the payment gateway of a local business; each day pays out or gets found', async () => {
    const { generate, newPizzeria } = await import('./generate');
    const { passDay } = await import('../ui/account');
    const net = newPizzeria(42);
    const sys = generate(net);
    const g = new Game(sys);
    g.autoPause = false;
    g.setPaused(false);
    expect(g.runProgram('skimmer')).toBe(false); // at the intake, not a payment gateway
    g.revealMap();
    g.travelTo('orders');
    run(g, MOVE_TICKS * 3);
    expect(g.runProgram('skimmer')).toBe(false); // a database is not enough
    g.travelTo('payments');
    run(g, MOVE_TICKS * 3);
    expect(g.runProgram('skimmer')).toBe(true);
    expect(g.planted?.name).toBe('Skimmer 1.0');
    expect(g.allies.some((a) => a.resident && a.node === 'payments')).toBe(true);
    expect(g.runProgram('skimmer')).toBe(false); // one skimmer per gateway
    const account = { sats: 0, programs: [], loaded: [], memory: 500, day: 1, reputation: 0, networks: [net], skimmers: [{ netId: net.id, program: g.planted! }], news: [], level: 1, xp: 0, skills: [], skillPicks: 0, code: 'TEST', avatar: { icon: 'hood', color: '#3dff7a' }, customIcons: {}, hardware: { installed: {}, spare: [], bought: { day: 0, ids: [] } }, health: 100 };
    passDay(account, () => 0.99);
    expect(account.sats).toBeCloseTo(0.08);
    passDay(account, () => 0);
    expect(account.skimmers.length).toBe(0);
    expect(net.security).toBe(2);
  });
});

describe('software development', () => {
  it('work takes the planned days; finish works the days left', async () => {
    const { newProject, work } = await import('./development');
    const p = newProject('hide', 2, 'Veil 1.0');
    expect(p.daysLeft).toBe(6);
    expect(work(p, 1)).toEqual({ days: 1, done: false });
    expect(p.daysLeft).toBe(5);
    expect(work(p, 99)).toEqual({ days: 5, done: true });
  });

  it('a finished program may have up to two bugs; each one is fixed on its own', async () => {
    const { finishProgram, newProject, fixBug, bugFixDays, MAX_BUGS } = await import('./development');
    // rarity common (0), then both bug rolls hit (0) and pick from the pool (0)
    const buggy = finishProgram(newProject('scan', 2, 'Probe X'), 'p300', 'you', () => 0);
    expect(buggy.bugs!.length).toBe(MAX_BUGS);
    expect(new Set(buggy.bugs).size).toBe(2);
    const clean = finishProgram(newProject('scan', 2, 'Probe Y'), 'p301', 'you', () => 0.99);
    expect(clean.bugs).toBeUndefined();
    expect(bugFixDays(buggy)).toBe(3);
    expect(fixBug(buggy, 5)).toBe(false);
    expect(fixBug(buggy, 0)).toBe(true);
    expect(buggy.bugs!.length).toBe(1);
    expect(fixBug(buggy, 0)).toBe(true);
    expect(buggy.bugs).toBeUndefined();
  });

  it('a finished program gets a rarity and that many different traits', async () => {
    const { finishProgram, newProject, rollRarity, RARITY_TRAITS } = await import('./development');
    expect(rollRarity(() => 0)).toBe('common');
    expect(rollRarity(() => 0.995)).toBe('legendary');
    const leg = finishProgram(newProject('warrior', 3, 'Spike'), 'p200', 'you', (() => { let first = true; return () => { if (first) { first = false; return 0.995; } return 0.3; }; })());
    expect(leg.rarity).toBe('legendary');
    expect(leg.traits!.length).toBe(RARITY_TRAITS.legendary);
    expect(new Set(leg.traits).size).toBe(4);
    expect(leg.author).toBe('you');
  });

  it('several days pass at once: skimmers pay for each day and the counter moves', async () => {
    const { newPizzeria } = await import('./generate');
    const { passDay } = await import('../ui/account');
    const net = newPizzeria(7);
    const account = { sats: 0, programs: [], loaded: [], memory: 500, day: 1, reputation: 0, networks: [net], skimmers: [{ netId: net.id, program: { id: 'p1', type: 'skimmer' as const, name: 'S', rating: 1, efficiency: 1, detection: 2 } }], news: [], level: 1, xp: 0, skills: [], skillPicks: 0, code: 'TEST', avatar: { icon: 'hood', color: '#3dff7a' }, customIcons: {}, hardware: { installed: {}, spare: [], bought: { day: 0, ids: [] } }, health: 100 };
    passDay(account, () => 0.99, 7);
    expect(account.day).toBe(8);
    expect(account.sats).toBeCloseTo(0.56);
  });
});

describe('experience', () => {
  it('level 2 costs 200 XP, every next level 100 more; extra XP carries over', async () => {
    const { addXp, xpToNext } = await import('./progression');
    expect(xpToNext(1)).toBe(200);
    expect(xpToNext(2)).toBe(300);
    expect(addXp(1, 150, 40)).toEqual({ level: 1, xp: 190, levelsUp: 0 });
    expect(addXp(1, 150, 60)).toEqual({ level: 2, xp: 10, levelsUp: 1 });
    expect(addXp(1, 0, 520)).toEqual({ level: 3, xp: 20, levelsUp: 2 });
  });

  it('three different skills to pick, none you already have', async () => {
    const { skillChoices, SKILLS } = await import('./progression');
    expect(SKILLS.length).toBeGreaterThanOrEqual(12);
    const owned = SKILLS.slice(0, 5).map((s) => s.id);
    const c = skillChoices(owned, () => 0.5);
    expect(c.length).toBe(3);
    expect(new Set(c.map((s) => s.id)).size).toBe(3);
    for (const s of c) expect(owned).not.toContain(s.id);
  });

  it('a run pays XP for the goal (more for higher security) and for each feat', () => {
    const g = new Game({ ...quiet, security: 2 });
    Object.defineProperty(g, 'contractDone', { get: () => true });
    g.feats.push('kill', 'kill', 'honeytoken');
    const r = g.endRun();
    expect(r.xpLines[0].xp).toBe(100);
    expect(r.xp).toBe(100 + 20 + 10);
  });
});

describe('game code', () => {
  it('the same code and level always offer the same skills; another level or code differs', async () => {
    const { levelRoll, skillChoices, cleanGameCode, newGameCode } = await import('./progression');
    const ids = (code: string, level: number) => skillChoices([], levelRoll(code, level)).map((s) => s.id).join(',');
    expect(ids('K7QX2M9A', 2)).toBe(ids('K7QX2M9A', 2));
    const others = [ids('K7QX2M9A', 3), ids('K7QX2M9A', 4), ids('ZZZZ1234', 2)];
    expect(others.some((o) => o !== ids('K7QX2M9A', 2))).toBe(true);
    expect(newGameCode().length).toBe(8);
    expect(cleanGameCode(' ab-cd ')).toBe('ABCD');
    expect(cleanGameCode('ab')).toBe('');
  });
});

describe('software tab', () => {
  it('drag and drop loads at a place, reorders, unloads, and refuses what does not fit', async () => {
    const { placeProgram, loadedPrograms } = await import('../ui/account');
    const programs = [
      { id: 'a', type: 'hide', name: 'A', rating: 1 },
      { id: 'b', type: 'scan', name: 'B', rating: 1 },
      { id: 'c', type: 'decrypt', name: 'C', rating: 1 },
      { id: 'd', type: 'mapper', name: 'D', rating: 3 },
    ] as const;
    const a = { programs: programs.map((p) => ({ ...p })), loaded: ['a', 'b'], memory: 130 } as unknown as Parameters<typeof placeProgram>[0];
    expect(placeProgram(a, 'c', 0)).toBe(true); // c (50) in front: 40 + 30 + 50 = 120
    expect(loadedPrograms(a).map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(placeProgram(a, 'c', 3)).toBe(true); // moved to the end
    expect(a.loaded).toEqual(['a', 'b', 'c']);
    expect(placeProgram(a, 'b', 0)).toBe(true);
    expect(a.loaded).toEqual(['b', 'a', 'c']);
    expect(placeProgram(a, 'd', 1)).toBe(false); // does not fit
    expect(placeProgram(a, 'a', null)).toBe(true);
    expect(a.loaded).toEqual(['b', 'c']);
  });
});

describe('signature', () => {
  it('a failed query raises it; a fight burns it; burned agents are hostile on sight', async () => {
    const { SIGNATURE_COOL } = await import('./game');
    const g = new Game(testSystem);
    g.autoPause = false;
    g.setPaused(false);
    g.agents.splice(0);
    expect(g.signature).toBe(0);
    g.exposeSignature(1, 'test');
    expect(g.signature).toBe(1);
    g.exposeSignature(3, 'fight');
    expect(g.signature).toBe(3);
    // Out of sight it cools to 2, then to 1, and stays there.
    run(g, SIGNATURE_COOL * 5);
    expect(g.signature).toBe(1);
  });

  it('mask clears it only when no agent sees you', () => {
    const g = new Game(testSystem, () => 0.5, [{ id: 'm1', type: 'mask', name: 'Chameleon 1.0', rating: 1 }]);
    g.exposeSignature(3, 'fight');
    const watcher = g.agents[0];
    if (watcher) {
      watcher.node = g.currentNode;
      watcher.hop = null;
      expect(g.runProgram('mask')).toBe(false);
      expect(g.signature).toBe(3);
    }
    g.agents.splice(0);
    expect(g.runProgram('mask')).toBe(true);
    expect(g.signature).toBe(0);
  });

  it('with a burned signature an agent that meets you turns hostile at once', () => {
    const g = new Game(testSystem);
    g.autoPause = false;
    g.setPaused(false);
    const a = g.agents[0];
    expect(a).toBeDefined();
    g.agents.splice(1);
    g.exposeSignature(3, 'fight');
    a.node = g.currentNode;
    a.hop = null;
    a.mood = 'trusting';
    run(g, 1);
    expect(a.mood).toBe('hostile');
  });
});

describe('hardware', () => {
  it('has a long catalogue where same-size chips from different makers differ', async () => {
    const { CATALOGUE } = await import('./implants');
    expect(CATALOGUE.length).toBeGreaterThan(40);
    const mem500 = CATALOGUE.filter((c) => c.kind === 'memory' && c.value === 500 && c.maker !== 'clinic issue');
    expect(mem500.length).toBeGreaterThan(1);
    expect(new Set(mem500.map((c) => JSON.stringify(c.sides))).size).toBeGreaterThan(1);
  });

  it('offers the same stock all day, and new stock the next day', async () => {
    const { marketOffers } = await import('./implants');
    expect(marketOffers('ABC', 3)).toEqual(marketOffers('ABC', 3));
    expect(marketOffers('ABC', 3).map((o) => o.chip.id)).not.toEqual(marketOffers('ABC', 4).map((o) => o.chip.id));
  });

  it('buys, swaps memory in and sells the old chip', async () => {
    const { CATALOGUE } = await import('./implants');
    const { buyChip, installChip, sellChip, removeChip, fresh: newAccount } = await import('../ui/account');
    const a = newAccount();
    a.sats = 10000;
    const big = CATALOGUE.find((c) => c.kind === 'memory' && c.value === 1000)!;
    expect(buyChip(a, big.id, 100)).toMatch(/bought/);
    expect(a.sats).toBe(9900);
    expect(installChip(a, big.id, 'hippocampus')).toEqual({ days: big.surgery });
    expect(a.memory).toBe(1000);
    expect(a.hardware.spare).toEqual(['stock-memory']);
    expect(typeof removeChip(a, 'hippocampus')).toBe('string');
    expect(typeof removeChip(a, 'spine1')).toBe('string');
    expect(sellChip(a, 'stock-memory')).toMatch(/sold/);
    expect(a.hardware.spare).toEqual([]);
  });
});

describe('health and deadlines', () => {
  it('costs health to leave hurt, more to be thrown out', async () => {
    const { exitDamage, daysToHeal } = await import('./health');
    expect(exitDamage(60, 100, false)).toBe(0);
    expect(exitDamage(40, 100, false)).toBe(5);
    expect(exitDamage(20, 100, false)).toBe(10);
    expect(exitDamage(5, 100, false)).toBe(20);
    expect(exitDamage(0, 100, true, () => 0)).toBe(20);
    expect(exitDamage(0, 100, true, () => 0.99)).toBe(30);
    expect(daysToHeal(75)).toBe(3);
  });

  it('heals by resting, and loses a contract after its deadline', async () => {
    const { fresh, rest, passDay } = await import('../ui/account');
    const a = fresh();
    a.health = 55;
    rest(a, 2);
    expect(a.health).toBe(75);
    a.contract = { title: 'Alter File', deadline: a.day + 1 };
    passDay(a);
    expect(a.contract).toBeDefined();
    passDay(a);
    expect(a.contract).toBeUndefined();
    expect(a.news.join(' ')).toMatch(/deadline/);
  });
});

describe('gates', () => {
  it('can stop you on a gated link, more often at red alarm with a burned signature', async () => {
    const { Game } = await import('./game');
    const { testSystem } = await import('../data/testSystem');
    const gated = (testSystem.gates ?? [])[0];
    expect(gated).toBeDefined();
    let r = 0;
    const g = new Game({ ...testSystem, entry: gated[0] }, () => r);
    g.revealMap();
    const calm = g.gateBlockChance();
    g.raiseAlarm(3);
    g.exposeSignature(3, 'test');
    expect(g.gateBlockChance()).toBeGreaterThan(calm);
    g.alarm = 0;
    g.travelTo(gated[1]);
    // You walk up to the gate and it stops you and asks; the game pauses.
    for (let i = 0; i < MOVE_TICKS * 3; i++) g.step();
    expect(g.gateQuery).not.toBeNull();
    expect(g.isMoving).toBe(true);
    expect(g.paused).toBe(true);
    // Back off: you return, the alarm goes yellow.
    expect(g.answerGate('back')).toBe(true);
    g.setPaused(false);
    for (let i = 0; i < MOVE_TICKS * 3; i++) g.step();
    expect(g.isMoving).toBe(false);
    expect(g.currentNode).toBe(gated[0]);
    expect(g.alarm).toBe(1);
  });

  it('deceive: success passes quietly; a second failure is red; breaking the gate is red', async () => {
    const { Game } = await import('./game');
    const { testSystem } = await import('../data/testSystem');
    const [from, to] = (testSystem.gates ?? [])[0];
    let r = 0;
    const g = new Game({ ...testSystem, entry: from, agents: [] }, () => r);
    g.revealMap();
    const atGate = () => { g.travelTo(to); for (let i = 0; i < MOVE_TICKS * 3 && !g.gateQuery; i++) g.step(); };
    atGate();
    expect(g.answerGate('deceive')).toBe(true);
    g.setPaused(false);
    for (let i = 0; i < MOVE_TICKS * 3; i++) g.step();
    expect(g.currentNode).toBe(to);
    expect(g.alarm).toBe(0);
    g.travelTo(from);
    for (let i = 0; i < MOVE_TICKS * 3 && !g.gateQuery; i++) g.step();
    r = 0.999; // every roll fails
    g.answerGate('deceive');
    expect(g.alarm).toBe(1);
    expect(g.gateQuery?.strikes).toBe(1);
    g.answerGate('deceive');
    expect(g.alarm).toBe(3);
    r = 0;
    g.answerGate('attack');
    expect(g.gateQuery).toBeNull();
    expect(g.alarm).toBe(3);
    expect(g.network.hasGate(from, to)).toBe(false);
  });
});

describe('active analyze', () => {
  it('takes a few seconds on an agent here and reads it; leaving breaks it off', async () => {
    const { Game } = await import('./game');
    const { testSystem } = await import('../data/testSystem');
    const g = new Game({ ...testSystem, gates: [], agents: [{ kind: 'warrior', node: testSystem.entry }] }, () => 0);
    g.autoPause = false;
    g.setPaused(false);
    const tick = (gg: typeof g, n: number) => { for (let i = 0; i < n; i++) gg.step(); };
    const a = g.agents[0];
    a.stayLeft = 100_000;
    expect(g.analyzeCommand('nobody')).toBe(false);
    expect(g.analyzeCommand('')).toBe(true);
    tick(g, 10);
    expect(a.known).toBe('none'); // not yet
    tick(g, 40);
    expect(a.known).not.toBe('none');
  });
});
