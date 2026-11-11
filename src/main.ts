import './style.css';
import { testSystem } from './data/testSystem';
import { FixedClock } from './sim/clock';
import { Game, TICKS_PER_SECOND } from './sim/game';
import { Console } from './ui/console';
import { renderDeck } from './ui/deckPanel';
import { ContextMenu } from './ui/contextMenu';
import { KIND_LABEL, NetworkView } from './ui/networkView';
import { Sound } from './ui/sound';
import { fileActions } from './sim/files';
import { FILE_PROGRAMS, PROGRAM_TYPES, type ProgramType } from './sim/programs';
import { loadAccount, saveAccount } from './ui/account';
import { showRunSummary } from './ui/runSummary';
import { HomeScreen, type ContractOffer } from './ui/homeScreen';
import { COMMANDS, complete, findCommand, splitCommand } from './ui/commands';

const account = loadAccount();
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
  'keys: Space pause, A auto-pause, 1-9 connect to a numbered neighbour, Esc stop travelling, M sound on/off.',
];

/** Ends the run: pays out what was taken and shows the report. OK starts the next run. */
function leaveNet(): void {
  if (game.ended) return;
  sfx.play('pause');
  const report = game.endRun();
  account.sats += report.total;
  account.programs = [...game.programs, ...report.software];
  saveAccount(account);
  flush();
  showRunSummary(report, account.sats, () => location.reload());
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
    case 'hide':
    case 'scout':
    case 'scan':
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
      if (game.cancelScout() || game.cancelScan()) break;
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
  renderDeck(deckEl, game, account.sats, (p) => ui(p.name));
}

const offers: ContractOffer[] = testSystem.contract ? [{ contract: testSystem.contract, system: testSystem }] : [];
const home = new HomeScreen(document.getElementById('home')!, offers, {
  choose: () => {},
  enter: () => enterNetwork(home.contract),
  click: () => sfx.play('menuItem'),
});
renderDeck(home.gear, { programs: account.programs, loot: [], privileges: new Set(), keysFound: false }, account.sats);

/** Leaves the main screen and starts the run: the console, the network view and the clock. */
function enterNetwork(offer: ContractOffer | undefined): void {
  const system = { ...(offer?.system ?? testSystem), contract: offer?.contract };
  game = new Game(system, Math.random, account.programs);
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
        : kind === 'file' || (FILE_PROGRAMS as readonly string[]).includes(kind)
          ? game.filesIn(game.currentNode).filter((f) => fileActions(f).length).map((f) => f.id)
        : (PROGRAM_TYPES as readonly string[]).includes(kind)
          ? game.programsOf(kind as ProgramType).map((p) => p.name)
          : [...new Set((kind === 'neighbour' ? game.network.neighbours(game.currentNode) : game.network.def.nodes.filter((n) => game.isKnown(n.id))).map((n) => game.nameOf(n.id)))],
  });
view = new NetworkView(document.getElementById('view')!, game, menu, {
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
  sound: sfx,
});

game.log('type help for commands', 'system');
}

const buildTag = document.createElement('div');
buildTag.className = 'build-tag';
buildTag.textContent = __BUILD_LABEL__;
document.getElementById('view')!.appendChild(buildTag);
document.getElementById('home')!.appendChild(buildTag.cloneNode(true));

document.addEventListener('keydown', (e) => {
  if (!game || term.inputFocused || game.ended) return;
  if (e.code === 'Space') {
    ui(game.paused ? 'resume' : 'pause');
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (menu.open) menu.dismiss();
    else if (game.isMoving || game.isBusy) ui('stop');
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
  view.update();
  updateDeck();
  requestAnimationFrame(frame);
}
