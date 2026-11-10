import './style.css';
import { testSystem } from './data/testSystem';
import { FixedClock } from './sim/clock';
import { Game, TICKS_PER_SECOND } from './sim/game';
import { Console } from './ui/console';
import { ContextMenu } from './ui/contextMenu';
import { KIND_LABEL, NetworkView } from './ui/networkView';

const game = new Game(testSystem);
const menu = new ContextMenu();

function travel(nodeId: string): void {
  const node = game.network.node(nodeId);
  if (nodeId === game.currentNode && !game.isMoving) {
    game.log(`already at ${node.name}`, 'system');
  } else if (!game.travelTo(nodeId)) {
    game.log(`no route to ${node.name}`, 'alarm1');
  } else if (game.paused) {
    game.log(`route set to ${node.name} (paused)`, 'system');
  }
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
  '  clear           clear the console',
  'mouse: click a node to connect, right-click for actions, click the minimap to travel.',
  'keys: Space pause, 1-9 connect to a numbered neighbour, Esc stop travelling.',
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
      else game.log(`unknown node: ${arg}`, 'alarm1');
      break;
    }
    case 'go':
    case 'move':
    case 'connect': {
      const node = game.network.find(arg);
      if (!arg) game.log('usage: go <node>', 'system');
      else if (!node) game.log(`unknown node: ${arg}`, 'alarm1');
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
    case 'clear':
      term.clear();
      break;
    default:
      game.log(`unknown command: ${cmd} (type help)`, 'alarm1');
  }
}

const term = new Console(document.getElementById('console')!, runCommand);
const view = new NetworkView(document.getElementById('view')!, game, menu, {
  travel,
  look,
  togglePause: () => game.togglePause(),
});

game.log('type help for commands', 'system');

document.addEventListener('keydown', (e) => {
  if (term.inputFocused) return;
  if (e.code === 'Space') {
    game.togglePause();
    e.preventDefault();
  } else if (e.key === 'Escape') {
    if (menu.open) menu.hide();
    else if (game.isMoving) {
      game.cancelTravel();
      game.log('travel will stop after this hop', 'system');
    }
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
    else if (ev.type === 'progress') term.progress(ev.line);
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
