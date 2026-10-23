/** Small original synthesized effects; no remote assets or audio permissions. */
export class GameAudio {
  private context?: AudioContext;
  volume = 0.35;

  async unlock(): Promise<void> {
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
    } catch {
      /* Gameplay also works on systems without audio output. */
    }
  }

  play(kind: 'shot' | 'hit' | 'reload'): void {
    if (!this.context || this.volume === 0 || this.context.state !== 'running') return;
    const ctx = this.context;
    const time = ctx.currentTime;
    const duration = kind === 'shot' ? 0.13 : kind === 'hit' ? 0.16 : 0.07;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = kind === 'shot' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'shot' ? 150 : kind === 'hit' ? 1050 : 300, time);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'shot' ? 35 : 120, time + duration);
    gain.gain.setValueAtTime(this.volume * (kind === 'shot' ? 0.16 : 0.08), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  dispose(): void {
    void this.context?.close();
  }
}
