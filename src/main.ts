import './style.css';
import { testSystem } from './data/testSystem';
import { FixedClock } from './sim/clock';
import { Game, TICKS_PER_SECOND } from './sim/game';
import { Console } from './ui/console';
import { ContextMenu } from './ui/contextMenu';
import { KIND_LABEL, NetworkView } from './ui/networkView';
import { Sound } from './ui/sound';
import { COMMANDS, complete, findCommand, splitCommand } from './ui/commands';

const game = new Game(testSystem);
const menu = new ContextMenu();
const sfx = new Sound(import.meta.env.BASE_URL);
// Browsers block audio until the first click or key, so the link-up sound plays then.
sfx.onReady = () => sfx.play('linkUp');
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
}

const HELP = [
  'commands:',
  ...COMMANDS.map((c) => `  ${c.usage.padEnd(16)}${c.help}`),
  'Tab completes commands and node names; Tab twice lists the options.',
  'mouse: click a node to connect, right-click for actions, click the minimap to travel.',
  'keys: Space pause, 1-9 connect to a numbered neighbour, Esc stop travelling, M sound on/off.',
];

function runCommand(raw: string): void {
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
    case 'map':
      for (const n of game.network.def.nodes) {
        const known = game.isIdentified(n.id);
        const id = known ? n.id : game.nameOf(n.id);
        game.log(`${id.padEnd(8)} ${known ? n.name : 'unknown'}${n.id === game.currentNode ? '  <- you' : ''}`);
      }
      break;
    case 'pause':
      game.setPaused(true);
      break;
    case 'resume':
      game.setPaused(false);
      break;
    case 'stop':
      game.cancelTravel();
      game.log('travel will stop after this hop', 'system');
      break;
    case 'mute':
      sfx.toggleMute();
      game.log(sfx.muted ? 'sound off' : 'sound on', 'system');
      break;
    case 'clear':
      term.clear();
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

const term = new Console(document.getElementById('console')!, (cmd) => {
  sfx.play('command');
  runCommand(cmd);
  flush();
});
term.onType = () => sfx.play('key');
term.completer = (value) =>
  complete(value, {
    names: (kind) =>
      [...new Set((kind === 'neighbour' ? game.network.neighbours(game.currentNode) : game.network.def.nodes).map((n) => game.nameOf(n.id)))],
  });
const view = new NetworkView(document.getElementById('view')!, game, menu, {
  travel: (id) => ui(`connect ${nodeName(id)}`),
  look: (id) => ui(`look ${nodeName(id)}`),
  togglePause: () => ui(game.paused ? 'resume' : 'pause'),
  mute: () => ui('mute'),
  hover: () => sfx.play('hover'),
  sound: sfx,
});

game.log('type help for commands', 'system');

const buildTag = document.createElement('div');
buildTag.className = 'build-tag';
buildTag.textContent = __BUILD_LABEL__;
document.getElementById('view')!.appendChild(buildTag);

document.addEventListener('keydown', (e) => {
  if (term.inputFocused) return;
  if (e.code === 'Space') {
    ui(game.paused ? 'resume' : 'pause');
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (menu.open) menu.dismiss();
    else if (game.isMoving) ui('stop');
  } else if (e.key === 'm' || e.key === 'M') {
    ui('mute');
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
    else if (ev.type === 'paused') sfx.play(ev.paused ? 'pause' : 'resume');
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
  requestAnimationFrame(frame);
}
flush();
requestAnimationFrame(frame);

// Exposed for debugging and automated checks.
(window as unknown as { game: Game }).game = game;
