import './style.css';
import { showMainMenu } from './ui/mainMenu';
import { clearSlot, migrateLegacy, setActiveSlot, takeResume } from './ui/saves';
import { Sound } from './ui/sound';

/**
 * Start: the main menu, unless the game reloaded itself into the main screen (after a run, or
 * after loading a save on death). The game itself loads only once a save is picked.
 */
migrateLegacy();
document.addEventListener('contextmenu', (e) => e.preventDefault());
const startGame = () => void import('./main');
if (takeResume()) startGame();
else {
  showMainMenu(new Sound(import.meta.env.BASE_URL), {
    play: (slot, fresh) => {
      if (fresh) clearSlot(slot);
      setActiveSlot(slot);
      startGame();
    },
  });
}
