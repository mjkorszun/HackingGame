import { describe, expect, it } from 'vitest';
import { complete, findCommand, splitCommand, type CompletionContext } from './commands';

const ctx: CompletionContext = {
  names: (kind) =>
    kind === 'neighbour'
      ? ['Auth Service', 'Edge Router', 'Orders Table']
      : ['Auth Service', 'Edge Router', 'Orders Table', 'Overseer Core', 'Public Gateway'],
};

describe('complete', () => {
  it('completes a unique command and adds a space when it takes an argument', () => {
    expect(complete('con', ctx).value).toBe('connect ');
    expect(complete('CON', ctx).value).toBe('connect ');
    expect(complete('cl', ctx).value).toBe('clear');
  });

  it('lists all commands that match an ambiguous prefix', () => {
    const r = complete('m', ctx);
    expect(r.value).toBe('m');
    expect(r.options).toEqual(['mask', 'map', 'mute']);
  });

  it('completes a unique node name', () => {
    expect(complete('connect E', ctx).value).toBe('connect Edge Router');
    expect(complete('connect e', ctx).value).toBe('connect Edge Router');
    expect(complete('go a', ctx).value).toBe('go Auth Service');
  });

  it('offers all neighbours after connect', () => {
    const r = complete('connect ', ctx);
    expect(r.value).toBe('connect ');
    expect(r.options).toEqual(['Auth Service', 'Edge Router', 'Orders Table']);
  });

  it('completes to the common prefix of several names', () => {
    const r = complete('look O', ctx);
    expect(r.value).toBe('look O');
    expect(r.options).toEqual(['Orders Table', 'Overseer Core']);
    expect(complete('look Ov', ctx).value).toBe('look Overseer Core');
  });

  it('does nothing for commands without arguments', () => {
    expect(complete('map x', ctx)).toEqual({ value: 'map x', options: [] });
  });
});

describe('command parsing', () => {
  it('splits the command word from a multi-word argument', () => {
    expect(splitCommand('  connect  Edge Router ')).toEqual({ word: 'connect', arg: 'Edge Router' });
  });
  it('resolves aliases', () => {
    expect(findCommand('GO')?.name).toBe('connect');
    expect(findCommand('nope')).toBeUndefined();
  });
});

describe('program names as commands', () => {
  const ctx = { names: () => [], extraCommands: () => ['Hawkeye V2', 'Owl 1.0'] };
  it('completes a program name typed on its own', () => {
    expect(complete('haw', ctx).value).toBe('Hawkeye V2');
    expect(complete('Owl', ctx).value).toBe('Owl 1.0');
    expect(complete('hawkeye v', ctx).value).toBe('Hawkeye V2');
  });
});
