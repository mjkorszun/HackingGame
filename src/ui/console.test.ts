import { describe, expect, it } from 'vitest';
import { progressBar } from './console';

describe('progressBar', () => {
  it('draws a text bar', () => {
    expect(progressBar(0, 10)).toBe('[----------]   0%');
    expect(progressBar(0.5, 10)).toBe('[#####-----]  50%');
    expect(progressBar(1, 10)).toBe('[##########] 100%');
  });
});
