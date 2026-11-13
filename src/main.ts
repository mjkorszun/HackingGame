import './style.css';
import { testSystem } from './data/testSystem';
import { FixedClock } from './sim/clock';
import { Game, TICKS_PER_SECOND } from './sim/game';
import { Console } from './ui/console';
import { renderDeck, updateCooldowns } from './ui/deckPanel';
import { ContextMenu } from './ui/contextMenu';
import { KIND_LABEL, NetworkView } from './ui/networkView';
import { Sound } from './ui/sound';
import { fileActions } from './sim/files';
import { FILE_PROGRAMS, PROGRAM_TYPES, usedMemory, type Program, type ProgramType } from './sim/programs';
import { buyChip, installChip, loadAccount, rest, loadedPrograms, nextProgramId, passDay, placeProgram, removeChip, saveAccount, sellChip, toggleLoaded } from './ui/account';
import { chipById } from './sim/implants';
import { exitDamage, REST_PER_DAY } from './sim/health';
import { showGameOver } from './ui/gameOver';
import { showRunSummary } from './ui/runSummary';
import { showSkillPick } from './ui/skillPick';
import { addXp, xpToNext } from './sim/progression';
import { HomeScreen, type Choice, type ContractOffer } from './ui/homeScreen';
import { bugFixDays, finishProgram, fixBug, newProject, work } from './sim/development';
import { isBuiltInIcon, randomIcon, registerIcon } from './ui/icons';
import { generate } from './sim/generate';
import { mergeIntel } from './sim/intel';
import { needsEntryScreen, showEntryScreen } from './ui/entryScreen';
import { activeSlot, clearSlot, markLast, reloadIntoGame, slotInfo, restoreBackup, writeBackup } from './ui/saves';
import { GameMenu, ICON_GEAR } from './ui/gameMenu';
import { COMMANDS, complete, findCommand, splitCommand } from './ui/commands';

const account = loadAccount();
// A new game is saved at once, so its slot is taken; Continue then picks the slot played last.
if (!slotInfo(activeSlot())) saveAccount(account);
else markLast(activeSlot());
// Icons the player picked from the full set travel with the save.
for (const [name, body] of Object.entries(account.customIcons)) registerIcon(name, body);

/** Saves an icon from the full set with the account, so it shows after a reload. */
function keepIcon(name: string, body: string): void {
  if (isBuiltInIcon(name) || !body) return;
  account.customIcons[name] = body;
  registerIcon(name, body);
}
/** The run in progress; set when the player enters the network from the main screen. */
let game: Game;
let term: Console;
let view: NetworkView;
const menu = new ContextMenu();
const sfx = new Sound(import.meta.env.BASE_URL);
menu.onEvent = (e) => sfx.play(e === 'open' ? 'menuOpen' : e === 'item' ? 'menuItem' : 'menuClose');

function travel(nodeId: string): void {
  const name = game.nameOf(nodeId);
  if (nodeId === game.currentNode && !game.isMoving) {
    game.log(`already at ${name}`, 'system');
  } else if (!game.travelTo(nodeId)) {
    error(`no route to ${name}`);
  } else {
    sfx.play('connect');
    if (game.paused) game.log(`route set to ${name} (paused)`, 'system');
  }
}

function error(text: string): void {
  game.log(text, 'alarm1');
  sfx.play('error');
}

function look(nodeId: string): void {
  const links = game.network.neighbours(nodeId).map((n) => game.nameOf(n.id)).join(', ');
  game.log(`${game.nameOf(nodeId)}: ${KIND_LABEL[game.kindOf(nodeId)]}. links: ${links}`);
  if (nodeId !== game.currentNode) return;
  for (const act of game.currentActions) {
    game.log(`  do ${act.id.padEnd(16)}${act.help}${act.requires ? ` (needs ${act.requires} privilege)` : ''}`);
  }
}

const HELP = [
  'commands:',
  ...COMMANDS.map((c) => `  ${c.usage.padEnd(16)}${c.help}`),
  "programs: type a program's own name to run it (e.g. Hawkeye V2).",
  'Tab completes commands, node and program names; Tab twice lists the options.',
  'mouse: click a node to connect, right-click for actions, click the minimap to travel.',
  'keys: Space pause, A auto-pause, 1-9 connect to a numbered neighbour, Esc menu, M sound on/off. type stop to stop travelling.',
];

let leaving = false;

/** Leaving: the game stops and your avatar fades out for a second, then the run ends. */
function leaveNet(): void {
  if (game.ended || leaving) return;
  leaving = true;
  game.setPaused(true);
  sfx.play('pause');
  view?.avatarOut();
  setTimeout(endTheRun, 1000);
}

/** Ends the run: pays out what was taken and shows the report. OK starts the next run. */
function endTheRun(): void {
  if (game.ended) return;
  const kicked = game.kicked;
  const integrity = { now: game.integrity, max: game.maxIntegrity };
  const report = game.endRun();
  account.sats += report.total;
  if (report.success && report.contract) account.contract = undefined;
  // The run took the day: it passes once the run ends (skimmers pay out, and may be found; one planted now starts tomorrow).
  passDay(account);
  // Leaving badly hurt, or being thrown out, damages your brain.
  const loss = exitDamage(integrity.now, integrity.max, kicked);
  account.health = Math.max(0, account.health - loss);
  account.reputation += report.reputation;
  const before = { level: account.level, xp: account.xp };
  const grown = addXp(account.level, account.xp, report.xp);
  account.level = grown.level;
  account.xp = grown.xp;
  account.skillPicks += grown.levelsUp;
  if (game.planted) {
    const sk = game.planted;
    account.programs = account.programs.filter((p) => p.id !== sk.id);
    account.loaded = account.loaded.filter((id) => id !== sk.id);
    account.skimmers.push({ netId: game.network.def.id, program: sk });
  }
  // Remember the map, the agents met and any backdoor for the next visit.
  account.intel[game.network.def.id] = mergeIntel(account.intel[game.network.def.id], game.intel());
  account.programs = [...account.programs, ...report.software];
  // Programs loaded mid-run stay loaded.
  for (const l of game.loot) if (l.loaded && l.software) account.loaded.push(l.software.id);
  saveAccount(account);
  flush();
  const health = { loss, now: account.health, kicked };
  showRunSummary(report, account.sats, before, () => {
    if (account.health <= 0) return showGameOver(loadBackup, newGame);
    pickSkills(() => reloadIntoGame());
  }, health);
}

/** Loads the game as it was before the fatal run. */
function loadBackup(): void {
  restoreBackup(activeSlot());
  reloadIntoGame();
}

/** Starts a new game from scratch in the same slot. */
function newGame(): void {
  clearSlot(activeSlot());
  reloadIntoGame();
}

/** One skill choice for every level gained and not yet picked, then `done`. */
function pickSkills(done: () => void): void {
  if (account.skillPicks <= 0) return done();
  showSkillPick(account.level - account.skillPicks + 1, account.skills, account.code, (skill) => {
    account.skills.push(skill.id);
    account.skillPicks--;
    saveAccount(account);
    sfx.play('menuItem');
    pickSkills(done);
  }, () => {
    sfx.play('menuItem');
    done();
  });
}

function runCommand(raw: string): void {
  if (game.ended) return;
  // A program's own name works as a command: "Hawkeye V2".
  const program = game.programByName(raw);
  if (program) {
    if (!game.runProgram(program.type, program.name)) sfx.play('error');
    return;
  }
  const { word, arg } = splitCommand(raw);
  const cmd = findCommand(word);
  if (!cmd) {
    error(`unknown command: ${word} (type help)`);
    return;
  }
  switch (cmd.name) {
    case 'help':
      HELP.forEach((l) => game.log(l, 'system'));
      break;
    case 'look': {
      const node = arg ? game.findNode(arg) : game.network.node(game.currentNode);
      if (node) look(node.id);
      else error(`unknown node: ${arg}`);
      break;
    }
    case 'connect': {
      const node = game.findNode(arg);
      if (!arg) game.log('usage: connect <node>', 'system');
      else if (!node) error(`unknown node: ${arg}`);
      else travel(node.id);
      break;
    }
    case 'do':
      if (!arg) game.log('usage: do <action> (look lists the actions here)', 'system');
      else if (!game.runAction(arg)) sfx.play('error');
      break;
    case 'scan':
      if (!game.scanCommand(arg)) sfx.play('error');
      break;
    case 'evaluate':
    case 'identify':
    case 'defuse':
    case 'decrypt':
    case 'scrub':
    case 'forge':
    case 'download':
    case 'alter':
    case 'delete':
    case 'extract':
      if (!game.fileAction(cmd.name, arg)) sfx.play('error');
      break;
    case 'attack':
      if (!(game.gateQuery ? game.answerGate('attack') : game.attackCommand(arg))) sfx.play('error');
      break;
    case 'silence':
    case 'deceive':
      if (!(game.gateQuery && cmd.name === 'deceive' ? game.answerGate('deceive') : game.agentCommand(cmd.name, arg))) sfx.play('error');
      break;
    case 'back':
      if (!game.answerGate('back')) sfx.play('error');
      break;
    case 'analyze':
      if (!game.analyzeCommand(arg)) sfx.play('error');
      break;
    case 'scout':
      if (!game.scoutCommand(arg)) sfx.play('error');
      break;
    case 'stay':
    case 'follow':
    case 'unload':
    case 'explore':
      if (!game.orderAlly(arg, cmd.name)) sfx.play('error');
      break;
    case 'present':
    case 'ignore':
      if (!(game.gateQuery && cmd.name === 'present' ? game.answerGate('present') : game.answerQuery(cmd.name))) sfx.play('error');
      break;
    case 'warrior':
    case 'shield':
    case 'hide':
    case 'analyze':
    case 'skimmer':
    case 'scan':
    case 'mask':
      if (!game.runProgram(cmd.name, arg)) sfx.play('error');
      break;
    case 'map':
      for (const n of game.network.def.nodes) {
        if (!game.isKnown(n.id)) continue;
        const known = game.isIdentified(n.id);
        const id = known ? n.id : game.nameOf(n.id);
        game.log(`${id.padEnd(8)} ${known ? n.name : 'hidden'}${n.id === game.currentNode ? '  <- you' : ''}`);
      }
      break;
    case 'pause':
      game.setPaused(true);
      break;
    case 'resume':
      game.setPaused(false);
      break;
    case 'stop':
      if (game.cancelScan() || game.cancelFileJob()) break;
      game.cancelTravel();
      game.log('travel will stop after this hop', 'system');
      break;
    case 'autopause':
      game.setAutoPause(!game.autoPause);
      break;
    case 'mute':
      sfx.toggleMute();
      game.log(sfx.muted ? 'sound off' : 'sound on', 'system');
      break;
    case 'clear':
      term.clear();
      break;
    case 'exit':
      leaveNet();
      break;
    case 'load':
      if (!game.loadProgram(arg)) sfx.play('error');
      break;
  }
}

/** Everything the mouse and shortcuts do goes through a console command, shown in the console. */
function ui(cmd: string): void {
  flush();
  term.echo(cmd);
  runCommand(cmd);
  flush();
}

const nodeName = (id: string) => game.nameOf(id);

const deckEl = document.getElementById('deck')!;
let deckVersion = -1;
function updateDeck(): void {
  if (game.deckVersion === deckVersion) return;
  deckVersion = game.deckVersion;
  renderDeck(deckEl, game, account.sats, { run: (p) => ui(p.name), load: (p) => ui(`load ${p.name}`) });
}

const offers: ContractOffer[] = testSystem.contract ? [{ contract: testSystem.contract, system: testSystem }] : [];
const homeState = { day: account.day, reputation: account.reputation, networks: account.networks, offers, skimmers: account.skimmers, news: account.news, backdoors: Object.fromEntries(Object.entries(account.intel).map(([id, i]) => [id, i.backdoors])) };
// The browser's own right-click menu never shows: right-click belongs to the game's menus.
document.addEventListener('contextmenu', (e) => e.preventDefault());

const home = new HomeScreen(document.getElementById('home')!, homeState, {
  enter: (choice) => {
    if (dayJob) return;
    // With a choice of entry, or part of the map already known, you first pick where to come in.
    const system = systemFor(choice);
    const intel = account.intel[system.id];
    if (!needsEntryScreen(system, intel)) return enterNetwork(choice);
    sfx.play('menuOpen');
    showEntryScreen(system, intel, (node) => enterNetwork(choice, node), () => sfx.play('menuClose'), () => sfx.play('hover'));
  },
  click: () => sfx.play('menuItem'),
  character: () => ({ level: account.level, xp: account.xp, skills: account.skills, picks: account.skillPicks, code: account.code, health: shownHealth() }),
  rest: (days) => {
    if (dayJob) return;
    const before = account.day;
    const hp = account.health;
    rest(account, days);
    saveAccount(account);
    // Health comes back day by day with the ticker, not all at once.
    showDaysPassing(before, `resting ${days} day${days === 1 ? '' : 's'}`, undefined, { from: hp, to: account.health });
    homeState.news = account.news;
    renderHomeGear();
  },
  contract: () => account.contract,
  day: () => account.day,
  money: () => account.sats,
  dayJob: () => dayJob,
  setCode: (code) => {
    account.code = code;
    saveAccount(account);
  },
  levelUp: () => {
    const grown = addXp(account.level, account.xp, xpToNext(account.level) - account.xp);
    account.level = grown.level;
    account.xp = grown.xp;
    account.skillPicks += grown.levelsUp;
    saveAccount(account);
  },
  avatar: () => account.avatar,
  setAvatar: (icon, color, body) => {
    keepIcon(icon, body);
    account.avatar = { icon, color };
    saveAccount(account);
  },
  pickSkills: (done) => pickSkills(done),
  software: {
    list: () => {
      const loaded = loadedPrograms(account);
      return { loaded, stored: account.programs.filter((p) => !account.loaded.includes(p.id)), used: usedMemory(loaded), memory: account.memory };
    },
    place: (id, index) => {
      if (!placeProgram(account, id, index)) return false;
      saveAccount(account);
      renderHomeGear();
      return true;
    },
    refused: () => sfx.play('error'),
    remove: (id) => {
      if (account.loaded.includes(id)) return;
      account.programs = account.programs.filter((p) => p.id !== id);
      saveAccount(account);
      sfx.play('menuItem');
      renderHomeGear();
    },
    fix: (id, index) => {
      const p = account.programs.find((x) => x.id === id);
      if (!p?.bugs?.[index] || dayJob) return undefined;
      const days = bugFixDays(p);
      const bug = p.bugs[index].split(':')[0];
      fixBug(p, index);
      // Fixing takes days like any other work: skimmers pay out, and may be found.
      const before = account.day;
      passDay(account, Math.random, days);
      saveAccount(account);
      showDaysPassing(before, `fixing ${p.name}`);
      homeState.news = account.news;
      renderHomeGear();
      return `${days} days fixing ${p.name}: the ${bug} bug is gone`;
    },
  },
  hardware: {
    state: () => {
      const h = account.hardware;
      return { installed: h.installed, spare: h.spare, sats: account.sats, day: account.day, code: account.code, bought: h.bought.day === account.day ? h.bought.ids : [] };
    },
    buy: (id, price) => {
      const line = buyChip(account, id, price);
      saveAccount(account);
      renderHomeGear();
      return line;
    },
    sell: (id) => {
      const line = sellChip(account, id);
      saveAccount(account);
      renderHomeGear();
      return line;
    },
    install: (id, socket) => {
      if (dayJob) return 'wait: you are still recovering';
      const name = chipById(id)?.name ?? id;
      const r = installChip(account, id, socket);
      if (typeof r === 'string') return r;
      return afterSurgery(r.days, `${name} is in. you spent ${r.days} day${r.days === 1 ? '' : 's'} recovering from the surgery`, `surgery: putting in ${name}`);
    },
    remove: (socket) => {
      if (dayJob) return 'wait: you are still recovering';
      const name = chipById(account.hardware.installed[socket] ?? '')?.name ?? 'the chip';
      const r = removeChip(account, socket);
      if (typeof r === 'string') return r;
      return afterSurgery(r.days, `${name} is out and waits in your spare chips. ${r.days} day${r.days === 1 ? '' : 's'} to recover`, `surgery: taking out ${name}`);
    },
  },
  dev: {
    project: () => account.project,
    start: (type, rating, name, icon, color, body) => {
      keepIcon(icon, body);
      account.project = { ...newProject(type, rating, name), icon, color };
      saveAccount(account);
    },
    cancel: () => {
      if (dayJob || !account.project) return;
      account.news.unshift(`you abandoned ${account.project.name}: the ${account.project.daysSpent} days spent on it are lost`);
      account.project = undefined;
      saveAccount(account);
      homeState.news = account.news;
    },
    work: (mode) => {
      const p = account.project;
      if (!p || dayJob) return { lines: [] };
      const days = mode === 'day' ? 1 : mode === 'week' ? 7 : p.daysLeft;
      const r = work(p, days);
      // Days spent writing code pass like any other: skimmers pay out, and may be found.
      const before = account.day;
      passDay(account, Math.random, r.days);
      const lines = [`${r.days} day${r.days === 1 ? '' : 's'} of work on ${p.name}`];
      let program: Program | undefined;
      if (r.done) {
        program = finishProgram(p, `p${nextProgramId(account)}`, 'you');
        program.icon = p.icon ?? randomIcon(program.type);
        if (p.color) program.color = p.color;
        account.project = undefined;
        lines.push(`${p.name} is done`);
        if (program.bugs?.length) lines.push(`it has ${program.bugs.length} bug${program.bugs.length === 1 ? '' : 's'}: use it as it is, or fix ${program.bugs.length === 1 ? 'it' : 'them'} in Software (${bugFixDays(program)} days a bug)`);
      }
      saveAccount(account);
      // The finished program reaches storage (and the news) only when the last day has gone by.
      const finished = program;
      showDaysPassing(before, `developing ${p.name}`, finished && (() => {
        account.programs.push(finished);
        account.news.unshift(`${finished.name} is done (${finished.rarity}${finished.bugs?.length ? `, ${finished.bugs.length} bug${finished.bugs.length === 1 ? '' : 's'}` : ''}): it waits in your storage`);
        saveAccount(account);
        homeState.news = account.news;
        renderHomeGear();
      }));
      homeState.news = account.news;
      renderHomeGear();
      return { lines, program };
    },
  },
});
/** Days passing at the base right now, shown as a progress bar: what is going on and how far it is. */
let dayJob: { label: string; total: number; done: number; health?: { from: number; to: number } } | null = null;

/**
 * Days spent at the base tick by one at a time, a second apart: a short tick for each day and a longer
 * tone on the last one. The account has already moved on; only the day shown catches up. Meanwhile the
 * screen still scrolls and works, but nothing else that costs days can start.
 */
/** Health as shown: while resting it climbs with the days ticking by. */
function shownHealth(): number {
  const h = dayJob?.health;
  return h ? Math.min(h.to, h.from + dayJob!.done * REST_PER_DAY) : account.health;
}

function showDaysPassing(from: number, label: string, onDone?: () => void, health?: { from: number; to: number }): void {
  const to = account.day;
  homeState.day = from;
  if (to <= from) {
    homeState.day = to;
    onDone?.();
    return;
  }
  dayJob = { label, total: to - from, done: 0, health };
  const step = () => {
    if (!dayJob) return;
    dayJob.done++;
    homeState.day = from + dayJob.done;
    const last = dayJob.done >= dayJob.total;
    sfx.play(last ? 'dayDone' : 'dayTick');
    if (last) {
      dayJob = null;
      onDone?.();
      home.refresh();
    } else {
      home.tickDays();
      window.setTimeout(step, 1000);
    }
  };
  window.setTimeout(step, 400);
}

/** Recovering from surgery takes days like any other work: skimmers pay out, and may be found. */
function afterSurgery(days: number, line: string, label = 'surgery'): string {
  const before = account.day;
  passDay(account, Math.random, days);
  saveAccount(account);
  showDaysPassing(before, label);
  homeState.news = account.news;
  renderHomeGear();
  return line;
}

function renderHomeGear(): void {
  const loaded = loadedPrograms(account);
  renderDeck(home.gear, { programs: loaded, memorySlots: account.memory, loot: [], privileges: new Set(), keysFound: false }, account.sats, {
    stored: account.programs.filter((p) => !account.loaded.includes(p.id)),
    toggle: (p) => {
      if (toggleLoaded(account, p.id)) {
        saveAccount(account);
        sfx.play('menuItem');
        renderHomeGear();
      } else sfx.play('error');
    },
  });
}
renderHomeGear();

function systemFor(choice: Choice) {
  return choice.kind === 'contract' ? { ...choice.offer.system, contract: choice.offer.contract } : generate(choice.net);
}

/** Leaves the main screen and starts the run, coming in at `entry` (the gateway when not given). */
function enterNetwork(choice: Choice, entry?: string): void {
  const system = systemFor(choice);
  // The state before the run, to load if you die in it.
  writeBackup(activeSlot(), JSON.stringify(account));
  // Taking a contract starts its deadline (today counts as the first day). Nothing is saved until
  // the run ends: leaving it any other way (Quit, a refresh, a closed tab) leaves no trace.
  if (choice.kind === 'contract' && account.contract?.title !== choice.offer.contract.title) {
    const days = choice.offer.contract.days ?? 5;
    account.contract = { title: choice.offer.contract.title, deadline: account.day + days - 1 };
  }
  game = new Game(system, Math.random, loadedPrograms(account), { memory: account.memory, nextId: nextProgramId(account), entry, intel: account.intel[system.id] });
  // Skimmers planted here earlier are still at work in the payment gateway.
  const gateway = system.nodes.find((n) => n.kind === 'payment');
  if (gateway) for (const sk of account.skimmers.filter((k) => k.netId === system.id)) game.addResident(sk.program, gateway.id);
  home.hide();
  document.getElementById('app')!.hidden = false;
  updateDeck();
  startView();
  void sfx.ready.then(() => sfx.play('linkUp'));
  flush();
  last = performance.now();
  requestAnimationFrame(frame);
  // Exposed for debugging and automated checks.
  (window as unknown as { game: Game }).game = game;
  (window as unknown as { view: NetworkView }).view = view;
}

function startView(): void {
term = new Console(document.getElementById('console')!, (cmd) => {
  sfx.play('command');
  runCommand(cmd);
  flush();
});
term.onType = () => sfx.play('key');
term.completer = (value) =>
  complete(value, {
    extraCommands: () => game.programs.map((p) => p.name),
    names: (kind) =>
      kind === 'action'
        ? game.currentActions.map((a) => a.id)
        : kind === 'agent'
          ? game.agentsIn(game.currentNode).map((a) => a.name)
        : kind === 'ally'
          ? game.allies.map((x) => x.program.name)
        : kind === 'loot'
          ? game.loot.filter((l) => l.software && !l.loaded).map((l) => l.software!.name)
        : kind === 'file' || (FILE_PROGRAMS as readonly string[]).includes(kind)
          ? game.filesIn(game.currentNode).filter((f) => fileActions(f).length).map((f) => f.id)
        : (PROGRAM_TYPES as readonly string[]).includes(kind)
          ? game.programsOf(kind as ProgramType).map((p) => p.name)
          : [...new Set((kind === 'neighbour' ? game.network.neighbours(game.currentNode) : game.network.def.nodes.filter((n) => game.isKnown(n.id))).map((n) => game.nameOf(n.id)))],
  });
view = new NetworkView(document.getElementById('view')!, game, menu, {
  avatar: account.avatar,
  travel: (id) => ui(`connect ${nodeName(id)}`),
  look: (id) => ui(`look ${nodeName(id)}`),
  act: (id) => ui(`do ${id}`),
  run: (p) => ui(p.name),
  scanFile: (fileId, all) => ui(all ? `scan all ${fileId}` : `scan ${fileId}`),
  scanAll: () => ui('scan all'),
  fileAction: (action, fileId) => ui(`${action} ${fileId}`),
  togglePause: () => ui(game.paused ? 'resume' : 'pause'),
  mute: () => ui('mute'),
  autoPause: () => ui('autopause'),
  hover: () => sfx.play('hover'),
  exit: () => ui('exit'),
  // The menu pauses the game; closing it lets time run again only if it was running before.
  menuToggled: (open) => {
    if (open) {
      menuWasPaused = game.paused;
      if (!game.paused) game.setPaused(true, true);
    } else if (!menuWasPaused) game.setPaused(false, true);
    flush();
  },
  command: (cmd) => ui(cmd),
  quit: quitToMenu,
  sound: sfx,
});

game.log('type help for commands', 'system');
}

const buildTag = document.createElement('div');
buildTag.className = 'build-tag';
buildTag.textContent = __BUILD_LABEL__;
document.getElementById('view')!.appendChild(buildTag);
document.getElementById('home')!.appendChild(buildTag.cloneNode(true));

let menuWasPaused = false;

/** Back to the main menu: a plain reload opens it. Everything outside a run is already saved, and a run is saved only when it ends. */
function quitToMenu(): void {
  location.reload();
}

// The same game menu on the main screen, with the gear in the top right corner and Esc.
const homeMenu = new GameMenu(sfx, { save: () => saveAccount(account), quit: quitToMenu });
const homeGearBtn = document.createElement('button');
homeGearBtn.type = 'button';
homeGearBtn.className = 'icon-btn gear-btn home-gear-btn';
homeGearBtn.title = 'Menu (Esc)';
homeGearBtn.setAttribute('aria-label', 'Menu');
homeGearBtn.innerHTML = ICON_GEAR;
homeGearBtn.addEventListener('click', () => homeMenu.toggle());
document.getElementById('home')!.append(homeGearBtn, homeMenu.box);

document.addEventListener('keydown', (e) => {
  if (!game && e.key === 'Escape') {
    homeMenu.toggle();
    e.preventDefault();
    return;
  }
  if (!game || game.ended) return;
  // Esc: closes a right-click menu, otherwise opens or closes the game menu.
  if (e.key === 'Escape') {
    if (menu.open) menu.dismiss();
    else view.toggleMenu();
    e.preventDefault();
    return;
  }
  if (term.inputFocused || view.menuOpen) return;
  if (e.code === 'Space') {
    ui(game.paused ? 'resume' : 'pause');
    e.preventDefault();
  } else if (e.key === 'm' || e.key === 'M') {
    ui('mute');
  } else if (e.key === 'a' || e.key === 'A') {
    ui('autopause');
  } else if (/^[1-9]$/.test(e.key)) {
    const id = view.neighbourByNumber(Number(e.key));
    if (id) ui(`connect ${nodeName(id)}`);
  } else if (e.key === 'Enter' || e.key === '`') {
    (document.querySelector('#console input') as HTMLInputElement | null)?.focus();
    e.preventDefault();
  }
});

function flush(): void {
  for (const ev of game.drainEvents()) {
    if (ev.type === 'log') term.write(ev.line);
    else if (ev.type === 'progress') term.progress(ev.line);
    else if (ev.type === 'hop') sfx.play('hop');
    else if (ev.type === 'moved') sfx.play('arrive');
    else if (ev.type === 'paused' && !ev.auto) sfx.play(ev.paused ? 'pause' : 'resume');
    else if (ev.type === 'query') sfx.play('error');
    else if (ev.type === 'kicked') setTimeout(leaveNet, 600);
    else if (ev.type === 'blocked') sfx.play('error');
    else if (ev.type === 'shot' || ev.type === 'outcome') view.fx(ev);
    else if (ev.type === 'program' && (ev.programType === 'scout' || ev.programType === 'scan')) sfx.play(ev.programType);
  }
}

const clock = new FixedClock(TICKS_PER_SECOND);
let last = performance.now();
function frame(now: number): void {
  const ticks = clock.advance(now - last);
  last = now;
  for (let i = 0; i < ticks; i++) game.step();
  flush();
  // Between ticks, moving things are drawn part way along, so motion is smooth at any frame rate.
  view.update(game.paused ? 0 : clock.alpha);
  updateDeck();
  updateCooldowns(deckEl, game);
  requestAnimationFrame(frame);
}
