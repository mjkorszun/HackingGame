import { beforeEach, describe, expect, it } from 'vitest';
import { activeSlot, allSlots, backupKey, clearSlot, lastSlot, markLast, migrateLegacy, restoreBackup, setActiveSlot, slotKey, takeResume } from './saves';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
}

const save = (day: number) => JSON.stringify({ sats: 10 * day, day, level: 2, health: 90, programs: [] });

beforeEach(() => {
  Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
});

describe('save slots', () => {
  it('moves the save from before slots into slot 1, with its backup', () => {
    localStorage.setItem('cyberhack.account', save(7));
    localStorage.setItem('cyberhack.account.backup', save(6));
    migrateLegacy();
    expect(JSON.parse(localStorage.getItem(slotKey(1))!).day).toBe(7);
    expect(JSON.parse(localStorage.getItem(backupKey(1))!).day).toBe(6);
    expect(localStorage.getItem('cyberhack.account')).toBeNull();
    expect(lastSlot()).toBe(1);
  });

  it('lists five slots, empty ones as null', () => {
    localStorage.setItem(slotKey(3), save(4));
    const slots = allSlots();
    expect(slots).toHaveLength(5);
    expect(slots[2]).toMatchObject({ slot: 3, day: 4, sats: 40, level: 2, health: 90 });
    expect(slots.filter(Boolean)).toHaveLength(1);
  });

  it('continue needs the last slot to still hold a game', () => {
    expect(lastSlot()).toBeNull();
    localStorage.setItem(slotKey(2), save(1));
    markLast(2);
    expect(lastSlot()).toBe(2);
    clearSlot(2);
    expect(lastSlot()).toBeNull();
  });

  it('restores the copy from before the run', () => {
    localStorage.setItem(slotKey(4), save(9));
    localStorage.setItem(backupKey(4), save(8));
    restoreBackup(4);
    expect(JSON.parse(localStorage.getItem(slotKey(4))!).day).toBe(8);
  });

  it('remembers the slot in play and the one-time resume flag in the tab', () => {
    expect(activeSlot()).toBe(1);
    setActiveSlot(5);
    expect(activeSlot()).toBe(5);
    sessionStorage.setItem('cyberhack.resume', '1');
    expect(takeResume()).toBe(true);
    expect(takeResume()).toBe(false);
  });
});

describe('abandoned runs', () => {
  it('a run left without ending goes back to before entering, day included', async () => {
    const { setInRun, recoverAbandonedRuns } = await import('./saves');
    localStorage.setItem(slotKey(2), save(6));
    localStorage.setItem(backupKey(2), save(5));
    setInRun(2, true);
    recoverAbandonedRuns();
    expect(JSON.parse(localStorage.getItem(slotKey(2))!).day).toBe(5);
    // Only once: a later start keeps the slot as it is.
    localStorage.setItem(slotKey(2), save(7));
    recoverAbandonedRuns();
    expect(JSON.parse(localStorage.getItem(slotKey(2))!).day).toBe(7);
  });

  it('a run that ended leaves the slot alone', async () => {
    const { setInRun, recoverAbandonedRuns } = await import('./saves');
    localStorage.setItem(slotKey(1), save(6));
    localStorage.setItem(backupKey(1), save(5));
    setInRun(1, true);
    setInRun(1, false);
    recoverAbandonedRuns();
    expect(JSON.parse(localStorage.getItem(slotKey(1))!).day).toBe(6);
  });
});
