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
    if (kind === 'shot') {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.22), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.035));
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5500, time);
      filter.frequency.exponentialRampToValueAtTime(500, time + 0.2);
      const level = ctx.createGain();
      level.gain.value = this.volume * 0.55;
      noise.connect(filter);
      filter.connect(level);
      level.connect(ctx.destination);
      noise.start(time);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        level.disconnect();
      };
    }
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
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  dispose(): void {
    void this.context?.close();
  }
}
