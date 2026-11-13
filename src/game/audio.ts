import type { WeaponSlot } from './ballistics';
type Effect =
  | 'shot'
  | 'hit'
  | 'reload'
  | 'step'
  | 'land'
  | 'impact'
  | 'knife'
  | 'throw'
  | 'deploy'
  | 'explosion';
/** Original synthesized effects. One shared noise buffer; nodes disconnect after playback. */
export class GameAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private foot = 0;
  volume = 0.35;
  private effectsVolume = 1;
  private musicVolume = 0.15;
  private menu = true;
  private musicGain?: GainNode;
  private musicFilter?: BiquadFilterNode;
  private musicVoices: OscillatorNode[] = [];
  setMix(master: number, effects = 1, music = 0.15): void {
    const valid = (value: number, fallback: number) =>
      Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
    this.volume = valid(master, 0.35);
    this.effectsVolume = valid(effects, 1);
    this.musicVolume = valid(music, 0.15);
    this.updateMusic();
  }
  setMenu(active: boolean): void {
    this.menu = active;
    this.updateMusic();
  }
  private updateMusic(): void {
    if (!this.context || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(
      this.menu ? this.volume * this.musicVolume * 0.035 : 0,
      this.context.currentTime,
      0.15,
    );
  }
  /** An original restrained ambient triad; no network download or third-party soundtrack. */
  private startMusic(): void {
    const ctx = this.context;
    if (!ctx || this.musicGain) return;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 440;
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(ctx.destination);
    for (const [index, hz] of [55, 82.4069, 130.8128].entries()) {
      const voice = ctx.createOscillator();
      voice.type = 'sine';
      voice.frequency.value = hz;
      voice.detune.value = (index - 1) * 3;
      voice.connect(this.musicFilter);
      voice.start();
      this.musicVoices.push(voice);
    }
    this.updateMusic();
  }
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if (!this.noise) {
        const ctx = this.context;
        this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      await this.context.resume();
      this.startMusic();
    } catch {
      /* Sound is optional. */
    }
  }
  play(kind: Effect, weapon: WeaponSlot = 'primary', distanceGain = 1, pan = 0) {
    const ctx = this.context;
    const mix = this.volume * this.effectsVolume * Math.max(0, Math.min(1, distanceGain));
    if (!ctx || ctx.state !== 'running' || mix === 0) return;
    const connect = (node: AudioNode) => {
      if (pan === 0 || !ctx.createStereoPanner) {
        node.connect(ctx.destination);
        return () => {};
      }
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      panner.connect(ctx.destination);
      return () => panner.disconnect();
    };
    const time = ctx.currentTime;
    const duration = {
      shot: 0.19,
      hit: 0.1,
      reload: 0.13,
      step: 0.085,
      land: 0.13,
      impact: 0.045,
      knife: 0.16,
      throw: 0.12,
      deploy: 0.1,
      explosion: 0.75,
    }[kind];
    if (this.noise && kind !== 'hit') {
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = this.noise;
      filter.type = kind === 'shot' || kind === 'explosion' ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(
        kind === 'explosion'
          ? 680
          : kind === 'knife'
            ? 1300
            : kind === 'throw'
              ? 700
              : kind === 'deploy'
                ? 2100
                : kind === 'shot'
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
        mix *
          (kind === 'explosion'
            ? 0.7
            : kind === 'shot'
              ? 0.45
              : kind === 'land'
                ? 0.2
                : kind === 'step'
                  ? 0.11
                  : 0.1),
        time,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      noise.connect(filter);
      filter.connect(gain);
      const disconnectPan = connect(gain);
      noise.start(time);
      noise.stop(time + duration);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
        disconnectPan();
      };
    }
    if (kind === 'shot' || kind === 'hit' || kind === 'explosion') {
      const tone = ctx.createOscillator(),
        gain = ctx.createGain();
      tone.type = kind === 'shot' ? 'triangle' : 'sine';
      tone.frequency.setValueAtTime(
        kind === 'hit' ? 1000 : kind === 'explosion' ? 75 : weapon === 'primary' ? 110 : 190,
        time,
      );
      tone.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 400 : 40, time + duration);
      gain.gain.setValueAtTime(
        mix * (kind === 'explosion' ? 0.35 : kind === 'shot' ? 0.18 : 0.06),
        time,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      tone.connect(gain);
      const disconnectPan = connect(gain);
      tone.start(time);
      tone.stop(time + duration);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
        disconnectPan();
      };
    }
  }
  dispose() {
    for (const voice of this.musicVoices) {
      voice.stop();
      voice.disconnect();
    }
    this.musicVoices = [];
    this.musicFilter?.disconnect();
    this.musicGain?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
