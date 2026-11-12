/**
 * Fixed-step clock: turns real elapsed time into a whole number of ticks.
 * Kept separate from the browser so it can be tested.
 */
export class FixedClock {
  private acc = 0;

  constructor(
    readonly ticksPerSecond: number,
    /** Upper bound per frame, so a background tab does not run hundreds of ticks at once. */
    private readonly maxTicksPerFrame = 10,
  ) {}

  /** How far the time is into the next tick (0..1): lets the view draw motion between ticks. */
  get alpha(): number {
    return Math.min(1, this.acc / (1000 / this.ticksPerSecond));
  }

  /** Adds elapsed milliseconds and returns how many ticks to run now. */
  advance(ms: number): number {
    const tickMs = 1000 / this.ticksPerSecond;
    this.acc += ms;
    let ticks = Math.floor(this.acc / tickMs);
    this.acc -= ticks * tickMs;
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
      this.acc = 0;
    }
    return ticks;
  }
}
