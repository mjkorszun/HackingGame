/** The game's currency: sats. Its sign is §, a stylised S that every font has. */
export const SATS = '§';

export function sats(n: number): string {
  return `${n} ${SATS}`;
}
