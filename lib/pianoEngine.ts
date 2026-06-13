import { midiToFreq } from "./notes";

export interface PianoEngine {
  resume(): Promise<void>;
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
  allOff(): void;
  setVolume(v: number): void;
}

interface Voice {
  oscillators: OscillatorNode[];
  gain: GainNode;
}

// Self-contained polyphonic synth piano. No external samples => always works offline.
export class SynthPiano implements PianoEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private voices = new Map<number, Voice>();

  constructor() {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor(); // tame clipping with many voices
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setVolume(v: number): void {
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  noteOn(midi: number, velocity: number): void {
    this.noteOff(midi);
    const now = this.ctx.currentTime;
    const freq = midiToFreq(midi);
    const peak = 0.0001 + 0.5 * Math.max(0.05, velocity);
    const gain = this.ctx.createGain();

    const partials: { ratio: number; level: number; type: OscillatorType }[] = [
      { ratio: 1, level: 1.0, type: "triangle" },
      { ratio: 2, level: 0.5, type: "sine" },
      { ratio: 3, level: 0.25, type: "sine" },
      { ratio: 4, level: 0.12, type: "sine" },
    ];
    const oscs: OscillatorNode[] = [];
    for (const p of partials) {
      const o = this.ctx.createOscillator();
      o.type = p.type;
      o.frequency.value = freq * p.ratio;
      const g = this.ctx.createGain();
      g.gain.value = p.level;
      o.connect(g);
      g.connect(gain);
      o.start(now);
      oscs.push(o);
    }

    // percussive ADSR
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(peak * 0.3, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

    gain.connect(this.master);
    oscs.forEach((o) => o.stop(now + 3.1));
    this.voices.set(midi, { oscillators: oscs, gain });
  }

  noteOff(midi: number): void {
    const v = this.voices.get(midi);
    if (!v) return;
    const now = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      v.oscillators.forEach((o) => o.stop(now + 0.2));
    } catch {
      /* already stopped */
    }
    this.voices.delete(midi);
  }

  allOff(): void {
    for (const midi of Array.from(this.voices.keys())) this.noteOff(midi);
  }
}
