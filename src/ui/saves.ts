/**
 * Save slots: up to five separate games, each kept in the browser under its own key, with a copy
 * from before the last run (loaded if you die in it). The slot in play survives a page reload of
 * the same tab, so the game can reload itself into the main screen without the main menu.
 */
export const SLOTS = 5;

const LEGACY_KEY = 'cyberhack.account';
const LEGACY_BACKUP = 'cyberhack.account.backup';
const LAST_KEY = 'cyberhack.lastSlot';
const ACTIVE_KEY = 'cyberhack.activeSlot';
const RESUME_KEY = 'cyberhack.resume';

export const slotKey = (slot: number) => `cyberhack.save.${slot}`;
export const backupKey = (slot: number) => `cyberhack.save.${slot}.backup`;
const inRunKey = (slot: number) => `cyberhack.save.${slot}.inRun`;

/** What the load list shows about a save. */
export interface SlotInfo {
  slot: number;
  day: number;
  sats: number;
  level: number;
  health: number;
  /** When it was last saved (ms since 1970), if known. */
  savedAt?: number;
}

function get(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function set(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Nowhere to save.
  }
}

function remove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

/** The save from before slots existed moves into slot 1. */
export function migrateLegacy(): void {
  const old = get(localStorage, LEGACY_KEY);
  if (!old) return;
  if (!get(localStorage, slotKey(1))) {
    set(localStorage, slotKey(1), old);
    const backup = get(localStorage, LEGACY_BACKUP);
    if (backup) set(localStorage, backupKey(1), backup);
    if (!get(localStorage, LAST_KEY)) set(localStorage, LAST_KEY, '1');
  }
  remove(localStorage, LEGACY_KEY);
  remove(localStorage, LEGACY_BACKUP);
}

export function slotInfo(slot: number): SlotInfo | null {
  const raw = get(localStorage, slotKey(slot));
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (typeof a.sats !== 'number') return null;
    return { slot, day: a.day ?? 1, sats: a.sats, level: a.level ?? 1, health: a.health ?? 100, savedAt: a.savedAt };
  } catch {
    return null;
  }
}

export function allSlots(): (SlotInfo | null)[] {
  return Array.from({ length: SLOTS }, (_, i) => slotInfo(i + 1));
}

/** The slot saved most recently, if it still holds a game: what Continue loads. */
export function lastSlot(): number | null {
  const n = Number(get(localStorage, LAST_KEY));
  return n >= 1 && n <= SLOTS && slotInfo(n) ? n : null;
}

export function markLast(slot: number): void {
  set(localStorage, LAST_KEY, String(slot));
}

/** The slot being played in this tab. */
export function activeSlot(): number {
  const n = Number(get(sessionStorage, ACTIVE_KEY));
  return n >= 1 && n <= SLOTS ? n : 1;
}

export function setActiveSlot(slot: number): void {
  set(sessionStorage, ACTIVE_KEY, String(slot));
}

/** Marks a run as under way in the slot, or over. */
export function setInRun(slot: number, on: boolean): void {
  if (on) set(localStorage, inRunKey(slot), '1');
  else remove(localStorage, inRunKey(slot));
}

/**
 * A run left without ending it (Quit, a page refresh, a closed tab) never happened: the slot goes
 * back to just before you entered, day included.
 */
export function recoverAbandonedRuns(): void {
  for (let slot = 1; slot <= SLOTS; slot++) {
    if (get(localStorage, inRunKey(slot)) !== '1') continue;
    restoreBackup(slot);
    setInRun(slot, false);
  }
}

/** Empties a slot, so the next load there starts a new game. */
export function clearSlot(slot: number): void {
  remove(localStorage, slotKey(slot));
  remove(localStorage, backupKey(slot));
  setInRun(slot, false);
}

/** Copies the game as it was before the last run back into the slot. */
export function restoreBackup(slot: number): void {
  const saved = get(localStorage, backupKey(slot));
  if (saved) set(localStorage, slotKey(slot), saved);
}

export function writeBackup(slot: number, json: string): void {
  set(localStorage, backupKey(slot), json);
}

/** Reloads the page straight into the main screen of the slot in play, skipping the main menu. */
export function reloadIntoGame(): void {
  set(sessionStorage, RESUME_KEY, '1');
  location.reload();
}

/** True once, right after reloadIntoGame. */
export function takeResume(): boolean {
  const resume = get(sessionStorage, RESUME_KEY) === '1';
  remove(sessionStorage, RESUME_KEY);
  return resume;
}
