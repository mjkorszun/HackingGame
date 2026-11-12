/**
 * Hardware is wired into your head: you jack into the net through a plug in your spine, and every
 * piece of hardware is an implant in a part of the brain. For now only memory is installed;
 * the other slots are empty and have no effects yet.
 */

export type ImplantId =
  | 'jack'
  | 'surge'
  | 'memory'
  | 'processor'
  | 'attack'
  | 'defense'
  | 'stealth'
  | 'analysis'
  | 'trace'
  | 'bio'
  | 'damper';

export interface ImplantSlot {
  id: ImplantId;
  /** Name of the implant that goes there. */
  name: string;
  /** Part of the brain (or spine) it sits in. */
  region: string;
  /** What it does (planned: no effects yet except memory). */
  about: string;
}

export const IMPLANT_SLOTS: readonly ImplantSlot[] = [
  { id: 'jack', name: 'Neural Jack', region: 'spinal cord', about: 'the plug you jack into the net with. a better jack means more bandwidth: faster downloads, decrypts and program loading' },
  { id: 'surge', name: 'Surge Suppressor', region: 'spinal cord, at the jack', about: 'blocks surges coming down the cable, so agents\' attacks damage your implants less' },
  { id: 'damper', name: 'Neural Damper', region: 'thalamus', about: 'filters pain and neural shocks before they reach the cortex: less damage to your brain from attacks' },
  { id: 'bio', name: 'Bio Monitor', region: 'brainstem', about: 'watches your body and brain; a better one pulls you out of the net before your integrity hits zero' },
  { id: 'memory', name: 'Memory', region: 'hippocampus', about: 'holds the programs you take into the net' },
  { id: 'processor', name: 'Neural Processor', region: 'frontal cortex', about: 'raw thinking power: how many program instances (agents) you can run at once without slowing down' },
  { id: 'attack', name: 'Attack Module', region: 'motor cortex', about: 'boosts all attack programs' },
  { id: 'stealth', name: 'Stealth Module', region: 'parietal cortex', about: 'boosts all stealth programs' },
  { id: 'analysis', name: 'Analysis Module', region: 'visual cortex', about: 'boosts all analysis programs' },
  { id: 'trace', name: 'Trace Monitor', region: 'visual cortex', about: 'an overlay in your sight: shows how well agents know you, and slows your detection' },
  { id: 'defense', name: 'Defense Module', region: 'cerebellum', about: 'boosts all defensive programs' },
];

/** What is installed in a slot, or undefined when the slot is empty. */
export function installedImplant(id: ImplantId, memoryGB: number): string | undefined {
  if (id === 'memory') return `${memoryGB} GB`;
  return undefined;
}
