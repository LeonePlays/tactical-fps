import type { WeaponSlot } from './ballistics';
type Effect = 'shot' | 'hit' | 'reload' | 'step' | 'land' | 'impact';
/** Original synthesized effects. One shared noise buffer; nodes disconnect after playback. */
export class GameAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private foot = 0;
  volume = 0.35;
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if (!this.noise) {
        const ctx = this.context;
        this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.25), ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      await this.context.resume();
    } catch {
      /* Sound is optional. */
    }
  }
  play(kind: Effect, weapon: WeaponSlot = 'primary') {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.volume === 0) return;
    const time = ctx.currentTime;
    const duration = { shot: 0.19, hit: 0.1, reload: 0.08, step: 0.085, land: 0.13, impact: 0.045 }[
      kind
    ];
    if (this.noise && kind !== 'hit') {
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = this.noise;
      filter.type = kind === 'shot' ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(
        kind === 'shot'
          ? weapon === 'primary'
            ? 5200
            : 6500
          : kind === 'step'
            ? 350 + (this.foot++ % 2) * 65
            : kind === 'reload'
              ? 2400
              : kind === 'land'
                ? 180
                : 1400,
        time,
      );
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(
        this.volume *
          (kind === 'shot' ? 0.45 : kind === 'land' ? 0.2 : kind === 'step' ? 0.11 : 0.1),
        time,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(time);
      noise.stop(time + duration);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    }
    if (kind === 'shot' || kind === 'hit') {
      const tone = ctx.createOscillator(),
        gain = ctx.createGain();
      tone.type = kind === 'shot' ? 'triangle' : 'sine';
      tone.frequency.setValueAtTime(kind === 'hit' ? 1000 : weapon === 'primary' ? 110 : 190, time);
      tone.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 400 : 40, time + duration);
      gain.gain.setValueAtTime(this.volume * (kind === 'shot' ? 0.18 : 0.06), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      tone.connect(gain);
      gain.connect(ctx.destination);
      tone.start(time);
      tone.stop(time + duration);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
      };
    }
  }
  dispose() {
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
