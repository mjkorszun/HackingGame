import './style.css';
import { testSystem } from './data/testSystem';
import { FixedClock } from './sim/clock';
import { Game, TICKS_PER_SECOND } from './sim/game';
import { Console } from './ui/console';
import { ContextMenu } from './ui/contextMenu';
import { KIND_LABEL, NetworkView } from './ui/networkView';
import { Sound } from './ui/sound';

const game = new Game(testSystem);
const menu = new ContextMenu();
const sfx = new Sound(import.meta.env.BASE_URL);
// Browsers block audio until the first click or key, so the link-up sound plays then.
sfx.onReady = () => sfx.play('linkUp');
menu.onEvent = (e) => sfx.play(e === 'open' ? 'menuOpen' : e === 'item' ? 'menuItem' : 'menuClose');

function travel(nodeId: string): void {
  const node = game.network.node(nodeId);
  if (nodeId === game.currentNode && !game.isMoving) {
    game.log(`already at ${node.name}`, 'system');
  } else if (!game.travelTo(nodeId)) {
    error(`no route to ${node.name}`);
  } else {
    sfx.play('connect');
    if (game.paused) game.log(`route set to ${node.name} (paused)`, 'system');
  }
}

function error(text: string): void {
  game.log(text, 'alarm1');
  sfx.play('error');
}

function look(nodeId: string): void {
  const node = game.network.node(nodeId);
  const links = game.network.neighbours(nodeId).map((n) => n.name).join(', ');
  game.log(`${node.name}: ${KIND_LABEL[node.kind]}. links: ${links}`);
}

const HELP = [
  'commands:',
  '  help            this list',
  '  look [node]     describe the current node, or another one',
  '  go <node>       travel to a node (name or id)',
  '  map             list all nodes',
  '  pause / resume  stop or continue time (Space)',
  '  stop            stop after the current hop (Esc)',
  '  mute            sound on / off (M)',
  '  clear           clear the console',
  'mouse: click a node to connect, right-click for actions, click the minimap to travel.',
  'keys: Space pause, 1-9 connect to a numbered neighbour, Esc stop travelling, M sound on/off.',
];

function runCommand(raw: string): void {
  const [cmd, ...rest] = raw.split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'help':
    case '?':
      HELP.forEach((l) => game.log(l, 'system'));
      break;
    case 'look':
    case 'l': {
      const node = arg ? game.network.find(arg) : game.network.node(game.currentNode);
      if (node) look(node.id);
      else error(`unknown node: ${arg}`);
      break;
    }
    case 'go':
    case 'move':
    case 'connect': {
      const node = game.network.find(arg);
      if (!arg) game.log('usage: go <node>', 'system');
      else if (!node) error(`unknown node: ${arg}`);
      else travel(node.id);
      break;
    }
    case 'map':
      for (const n of game.network.def.nodes) {
        game.log(`${n.id.padEnd(8)} ${n.name}${n.id === game.currentNode ? '  <- you' : ''}`);
      }
      break;
    case 'pause':
      game.setPaused(true);
      break;
    case 'resume':
    case 'unpause':
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
    default:
      error(`unknown command: ${cmd} (type help)`);
  }
}

const term = new Console(document.getElementById('console')!, (cmd) => {
  sfx.play('command');
  runCommand(cmd);
});
term.onType = () => sfx.play('key');
const view = new NetworkView(document.getElementById('view')!, game, menu, {
  travel,
  look,
  togglePause: () => game.togglePause(),
  hover: () => sfx.play('hover'),
  sound: sfx,
});

game.log('type help for commands', 'system');

document.addEventListener('keydown', (e) => {
  if (term.inputFocused) return;
  if (e.code === 'Space') {
    game.togglePause();
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (menu.open) menu.dismiss();
    else if (game.isMoving) {
      game.cancelTravel();
      game.log('travel will stop after this hop', 'system');
    }
  } else if (e.key === 'm' || e.key === 'M') {
    sfx.toggleMute();
    game.log(sfx.muted ? 'sound off' : 'sound on', 'system');
  } else if (/^[1-9]$/.test(e.key)) {
    const id = view.neighbourByNumber(Number(e.key));
    if (id) travel(id);
  } else if (e.key === 'Enter' || e.key === '`') {
    (document.querySelector('#console input') as HTMLInputElement | null)?.focus();
    e.preventDefault();
  }
});

function flush(): void {
  for (const ev of game.drainEvents()) {
    if (ev.type === 'log') term.write(ev.line);
    else if (ev.type === 'progress') {
      term.progress(ev.line);
    }
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
