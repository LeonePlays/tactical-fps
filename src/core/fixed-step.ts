/** Bounded catch-up keeps simulation stable at ordinary low frame rates. */
export class FixedStepClock {
  private pending = 0;
  readonly step = 1 / 60;
  reset(): void {
    this.pending = 0;
  }
  advance(seconds: number, simulate: (dt: number) => void): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return this.pending / this.step;
    // Background pauses are reset by the caller; a long stall cannot create an unbounded loop.
    this.pending += Math.min(seconds, 0.25);
    while (this.pending + 1e-9 >= this.step) {
      this.pending -= this.step;
      simulate(this.step);
    }
    this.pending = Math.max(0, this.pending);
    return this.pending / this.step;
  }
}
