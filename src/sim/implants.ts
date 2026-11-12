/**
 * Hardware is wired into your head: you jack into the net through your spinal cord, and every
 * piece of hardware is a chip in a socket somewhere in the brain. A socket takes any chip that
 * fits there. You start with the bare minimum: a basic jack and memory; the other sockets are empty and nothing has effects yet.
 */

export type SocketId =
  | 'spine1'
  | 'spine2'
  | 'brainstem'
  | 'thalamus'
  | 'hippocampus'
  | 'frontal'
  | 'motor'
  | 'parietal'
  | 'visual1'
  | 'visual2'
  | 'cerebellum';

export interface Chip {
  name: string;
  about: string;
}

export interface Socket {
  id: SocketId;
  /** The socket's name: the part of the brain or spine it is in. */
  name: string;
  /** Chips that fit this socket (planned: none can be bought yet). */
  fits: Chip[];
}

const JACK: Chip = { name: 'Neural Jack', about: 'the plug you jack into the net with. more bandwidth: faster downloads, decrypts and program loading' };
const SURGE: Chip = { name: 'Surge Suppressor', about: 'blocks surges coming down the cable, so attacks damage your implants less' };
const DAMPER: Chip = { name: 'Neural Damper', about: 'filters pain and neural shocks before they reach the cortex: less damage to your brain' };
const BIO: Chip = { name: 'Bio Monitor', about: 'watches your body and brain, and pulls you out of the net before your integrity hits zero' };
const MEMORY: Chip = { name: 'Memory', about: 'holds the programs you take into the net' };
const PROCESSOR: Chip = { name: 'Neural Processor', about: 'thinking power: how many program instances (agents) you run at once without slowing down' };
const ATTACK: Chip = { name: 'Attack Module', about: 'boosts all attack programs' };
const STEALTH: Chip = { name: 'Stealth Module', about: 'boosts all stealth programs' };
const ANALYSIS: Chip = { name: 'Analysis Module', about: 'boosts all analysis programs' };
const TRACE: Chip = { name: 'Trace Monitor', about: 'an overlay in your sight: shows how well agents know you, and slows your detection' };
const DEFENSE: Chip = { name: 'Defense Module', about: 'boosts all defensive programs' };

export const SOCKETS: readonly Socket[] = [
  { id: 'spine1', name: 'Spinal cord I', fits: [JACK, SURGE] },
  { id: 'spine2', name: 'Spinal cord II', fits: [JACK, SURGE] },
  { id: 'brainstem', name: 'Brainstem', fits: [BIO] },
  { id: 'thalamus', name: 'Thalamus', fits: [DAMPER] },
  { id: 'hippocampus', name: 'Hippocampus', fits: [MEMORY] },
  { id: 'frontal', name: 'Frontal cortex', fits: [PROCESSOR] },
  { id: 'motor', name: 'Motor cortex', fits: [ATTACK] },
  { id: 'parietal', name: 'Parietal cortex', fits: [STEALTH] },
  { id: 'visual1', name: 'Visual cortex I', fits: [ANALYSIS, TRACE] },
  { id: 'visual2', name: 'Visual cortex II', fits: [ANALYSIS, TRACE] },
  { id: 'cerebellum', name: 'Cerebellum', fits: [DEFENSE] },
];

/** The chip in a socket (with its size or level), or undefined when the socket is empty. */
export function installedChip(id: SocketId, memoryGB: number): { chip: Chip; label: string } | undefined {
  if (id === 'hippocampus') return { chip: MEMORY, label: `Memory ${memoryGB} GB` };
  // The bare minimum to go online at all: a basic jack (bandwidth x1) and memory.
  if (id === 'spine1') return { chip: JACK, label: 'Neural Jack 1.0' };
  return undefined;
}
