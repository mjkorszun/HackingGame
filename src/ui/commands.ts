/** Console command names and tab completion. Pure functions, no DOM. */

import { FILE_PROGRAMS, PROGRAM_TYPES, type ProgramType } from '../sim/programs';

export type ArgKind = 'none' | 'node' | 'neighbour' | 'action' | 'file' | ProgramType;

export interface CommandSpec {
  name: string;
  aliases?: string[];
  arg: ArgKind;
  /** Usage shown in help, e.g. "connect <node>". */
  usage: string;
  help: string;
}

const PROGRAM_HELP: Partial<Record<ProgramType, string>> = {
  decrypt: 'decrypt files here: decrypt [all] [fN], or pick the program by name',
  evaluate: 'price of a valuable file (needs an evaluate program)',
  identify: 'what software a file holds (needs an identify program)',
  defuse: "disarm an archive's kill switch",
  brute: "crack an archive's heavy seal",
  scrub: "remove an archive's tracker",
  forge: "fake the privilege an archive's lock wants",
};

export const COMMANDS: CommandSpec[] = [
  { name: 'help', aliases: ['?'], arg: 'none', usage: 'help', help: 'this list' },
  { name: 'connect', aliases: ['go', 'move'], arg: 'neighbour', usage: 'connect <node>', help: 'travel to a node (Tab completes names)' },
  { name: 'look', aliases: ['l'], arg: 'node', usage: 'look [node]', help: 'describe the current node, or another one' },
  { name: 'do', arg: 'action', usage: 'do <action>', help: "use an action of the current node (look lists them)" },
  ...PROGRAM_TYPES.map(
    (t): CommandSpec => ({ name: t, arg: t, usage: (FILE_PROGRAMS as readonly string[]).includes(t) ? `${t} <file>` : `${t} [n|name]`, help: PROGRAM_HELP[t] ?? `run your best ${t} program, or the Nth one, or one by name` }),
  ),
  { name: 'download', arg: 'file', usage: 'download <file>', help: 'copy a decrypted file (valuable data or software) into your deck' },
  { name: 'alter', arg: 'file', usage: 'alter <file>', help: 'change contract data' },
  { name: 'delete', arg: 'file', usage: 'delete <file>', help: 'destroy contract data' },
  { name: 'extract', arg: 'file', usage: 'extract <file>', help: 'take the privilege or keys from a keyring' },
  { name: 'map', arg: 'none', usage: 'map', help: 'list all nodes' },
  { name: 'pause', arg: 'none', usage: 'pause', help: 'stop time (Space)' },
  { name: 'resume', aliases: ['unpause'], arg: 'none', usage: 'resume', help: 'continue time (Space)' },
  { name: 'stop', arg: 'none', usage: 'stop', help: 'stop travelling after this hop, or stop a running scout (Esc)' },
  { name: 'autopause', arg: 'none', usage: 'autopause', help: 'auto-pause on / off: time stops after every action (A)' },
  { name: 'mute', arg: 'none', usage: 'mute', help: 'sound on / off (M)' },
  { name: 'clear', arg: 'none', usage: 'clear', help: 'clear the console' },
];

export function findCommand(word: string): CommandSpec | undefined {
  const w = word.toLowerCase();
  return COMMANDS.find((c) => c.name === w || c.aliases?.includes(w));
}

/** Splits "connect Edge Router" into the command word and the rest. */
export function splitCommand(raw: string): { word: string; arg: string } {
  const trimmed = raw.replace(/^\s+/, '');
  const i = trimmed.search(/\s/);
  if (i < 0) return { word: trimmed, arg: '' };
  return { word: trimmed.slice(0, i), arg: trimmed.slice(i).trim() };
}

export interface CompletionContext {
  /** Names a command argument can take, per argument kind. */
  names(kind: Exclude<ArgKind, 'none'>): string[];
  /** Extra whole-line commands, such as program names typed on their own ("Rocket Launcher V007"). */
  extraCommands?(): string[];
}

export interface Completion {
  /** The new input text. Equal to the input when nothing could be completed. */
  value: string;
  /** All matching options (shown on a second Tab when there is more than one). */
  options: string[];
}

function commonPrefix(items: string[]): string {
  if (!items.length) return '';
  let p = items[0];
  for (const s of items.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i].toLowerCase() === s[i].toLowerCase()) i++;
    p = p.slice(0, i);
  }
  return p;
}

/** Bash-like completion of a command line. */
export function complete(input: string, ctx: CompletionContext): Completion {
  const lead = input.match(/^\s*/)![0];
  const body = input.slice(lead.length);
  const space = body.search(/\s/);
  const extras = (ctx.extraCommands?.() ?? []).filter((n) => n.toLowerCase().startsWith(body.toLowerCase()));
  const completeAmong = (options: string[], suffix: (o: string) => string): Completion => {
    if (options.length === 1) return { value: options[0] + suffix(options[0]), options };
    const common = commonPrefix(options);
    return { value: common.length > body.length ? common : input, options };
  };

  // Completing the command word (or a program name typed on its own).
  if (space < 0) {
    const prefix = body.toLowerCase();
    const matches = COMMANDS.filter((c) => c.name.startsWith(prefix));
    const options = [...matches.map((c) => c.name), ...extras];
    return completeAmong(options, (o) => {
      const c = matches.find((m) => m.name === o);
      return c && c.arg !== 'none' ? ' ' : '';
    });
  }

  // Completing the argument.
  const word = body.slice(0, space);
  const cmd = findCommand(word);
  if (!cmd && extras.length) return completeAmong(extras, () => '');
  if (!cmd || cmd.arg === 'none') return { value: input, options: [] };
  const argPrefix = body.slice(space).replace(/^\s+/, '');
  const options = ctx.names(cmd.arg).filter((n) => n.toLowerCase().startsWith(argPrefix.toLowerCase()));
  if (options.length === 1) return { value: `${word} ${options[0]}`, options };
  const common = commonPrefix(options);
  if (common.length > argPrefix.length) return { value: `${word} ${common}`, options };
  return { value: input, options };
}
