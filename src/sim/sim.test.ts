import { clickAction, filePrice, type DataFile } from './files';
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
    expect(g.decryptCommand('all')).toBe(true); // touching its files springs the trap
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

describe('stub programs', () => {
  it('starts paused', () => {
    expect(new Game(testSystem).paused).toBe(true);
  });
  it('each first-version program can be run and only prints for now', () => {
    const g = new Game(testSystem);
    for (const t of ['attack', 'hide'] as const) expect(g.runProgram(t)).toBe(true);
    expect(g.isScouting).toBe(false);
  });
});

describe('data files and decrypt', () => {
  const inOrders = () => {
    const g = new Game(testSystem);
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
    const a = new Game(testSystem).filesIn('orders');
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(a.length).toBeLessThanOrEqual(12);
    expect(new Game(testSystem).filesIn('orders').map((f) => f.content)).toEqual(a.map((f) => f.content));
    expect(new Game(testSystem).filesIn('gw')).toEqual([]);
  });

  it('decrypts one file', () => {
    const g = inOrders();
    expect(g.decryptCommand('f2')).toBe(true);
    expect(g.travelTo('edge')).toBe(false); // busy
    finish(g);
    expect(g.filesIn('orders').filter((f) => f.decrypted).map((f) => f.id)).toEqual(['f2']);
  });

  it('decrypt all starts at the chosen file, wraps around and skips decrypted ones', () => {
    const g = inOrders();
    g.decryptCommand('f1');
    finish(g);
    const n = g.filesIn('orders').length;
    g.decryptCommand('all f3');
    expect(g.decryptingFile?.fileId).toBe('f3');
    finish(g);
    expect(g.filesIn('orders').every((f) => f.decrypted)).toBe(true);
    expect(n).toBeGreaterThan(3);
    expect(g.decryptCommand('all')).toBe(false); // nothing left
  });

  it('decrypted files offer actions by content; evaluate, identify and download work', () => {
    const g = inOrders();
    g.decryptCommand('all');
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
    const fail = new Game(testSystem, () => 0.99); // every detection roll fails
    fail.revealMap();
    fail.autoPause = false;
    fail.setPaused(false);
    fail.travelTo('orders');
    run(fail, MOVE_TICKS * 3);
    const f = fail.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(f, { content: 'honeytoken', price: 500, protection: undefined });
    fail.decryptCommand(f.id);
    finish(fail);
    expect(f.detected).toBeFalsy();
    fail.drainEvents();
    expect(fail.fileAction('download', f.id)).toBe(true);
    expect(fail.drainEvents().some((e) => e.type === 'log' && e.line.color === 'alarm3')).toBe(true);
    expect(fail.loot.length).toBe(0);

    const ok = new Game(testSystem, () => 0); // every detection roll succeeds
    ok.revealMap();
    ok.autoPause = false;
    ok.setPaused(false);
    ok.travelTo('orders');
    run(ok, MOVE_TICKS * 3);
    const h = ok.filesIn('orders')[0] as import('./files').DataFile;
    Object.assign(h, { content: 'honeytoken', price: 500 });
    h.protection = undefined;
    ok.decryptCommand(h.id);
    finish(ok);
    expect(h.detected).toBeFalsy(); // decrypt alone doesn't tell
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
    g.decryptCommand(fs[0].id);
    finish(g);
    expect(fs[0].deleted).toBe(true); // decrypted before defusing
    expect(g.decryptCommand(fs[1].id)).toBe(false); // sealed
    expect(g.fileAction('brute', fs[1].id)).toBe(true);
    expect(g.decryptCommand(fs[1].id)).toBe(true);
    finish(g);
    expect(fs[1].decrypted).toBe(true);
    expect(g.decryptCommand(fs[2].id)).toBe(false); // locked, no admin
    expect(g.fileAction('forge', fs[2].id)).toBe(true);
    expect(g.decryptCommand(fs[2].id)).toBe(true);
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
    g.decryptCommand(f.id);
    finish(g);
    expect(g.fileAction('extract', f.id)).toBe(true);
    expect(g.privileges.has('security')).toBe(true);
    expect(g.fileAction('extract', f.id)).toBe(false);
  });

  it('evaluate needs an evaluate program', () => {
    const g = inOrders();
    g.decryptCommand('all');
    finish(g);
    g.programs.splice(g.programs.findIndex((p) => p.type === 'evaluate'), 1);
    const valuable = g.filesIn('orders').find((f) => f.content === 'valuable')!;
    expect(g.fileAction('evaluate', valuable.id)).toBe(false);
  });

  it('there is nothing to decrypt outside databases', () => {
    const g = new Game(testSystem);
    expect(g.decryptCommand('')).toBe(false);
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
    g.autoPause = false;
    g.setPaused(true);
    g.travelTo('edge');
    expect(g.paused).toBe(true);
  });

  it('is on by default, and its pauses are marked automatic', () => {
    const g = new Game(testSystem);
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(true);
    const ev = g.drainEvents().find((e) => e.type === 'paused' && e.paused);
    expect(ev).toMatchObject({ paused: true, auto: true });
  });

  it('when off, time keeps running after an action', () => {
    const g = new Game(testSystem);
    g.autoPause = false;
    g.setPaused(false);
    g.travelTo('edge');
    run(g, MOVE_TICKS);
    expect(g.paused).toBe(false);
  });
});

describe('file left click', () => {
  const base = { id: 'f1', decrypted: true, price: 100 } as DataFile;
  it('evaluates a valuable file first, then downloads it', () => {
    const f = { ...base, content: 'valuable' } as DataFile;
    expect(clickAction(f)).toBe('evaluate');
    f.evaluated = true;
    expect(clickAction(f)).toBe('download');
    f.downloaded = true;
    expect(clickAction(f)).toBeUndefined();
  });
  it('cracks a seal before anything else', () => {
    expect(clickAction({ ...base, decrypted: false, content: 'valuable', protection: 'seal' } as DataFile)).toBe('brute');
    expect(clickAction({ ...base, decrypted: false, content: 'valuable' } as DataFile)).toBeUndefined();
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
    const g = new Game(testSystem, () => 0);
    g.autoPause = false;
    g.setPaused(false);
    g.revealMap();
    g.travelTo('orders');
    run(g, MOVE_TICKS * 3);
    expect(g.currentNode).toBe('orders');
    const c = g.filesIn('orders').find((f) => f.content === 'contract')!;
    expect(c.need).toBe('alter');
    Object.assign(c, { decrypted: true, protection: undefined });
    const v = g.filesIn('orders').find((f) => f.content === 'valuable')!;
    Object.assign(v, { decrypted: true, protection: undefined });
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
    const r = new Game(testSystem).endRun();
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
