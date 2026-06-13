import { KeyRect, keyAtPoint } from "./keyboardLayout";
import { OneEuroFilter } from "./filters";

const FINGERTIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

export interface NoteEvent {
  type: "on" | "off";
  midi: number;
  velocity: number; // 0..1
  fingerId: string;
}

interface FingerState {
  isDown: boolean;
  activeKey: number | null;
  lastTriggerT: number;
  xFilter: OneEuroFilter;
  yFilter: OneEuroFilter;
  prevY: number | null;
  prevT: number | null;
}

export interface PressConfig {
  activationFrac: number;
  hysteresisPx: number;
  cooldownMs: number;
  velocityScale: number; // px/s mapped to volume 1.0
  minVelocity: number;   // px/s threshold for "tap" mode
  sustain: boolean;
  activeFingers: number[]; // indices into FINGERTIPS (0=thumb..4=pinky)
  mode: "line" | "tap";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class PressDetector {
  private states = new Map<string, FingerState>();
  cfg: PressConfig;

  constructor(cfg: PressConfig) {
    this.cfg = cfg;
  }

  private getState(id: string): FingerState {
    let s = this.states.get(id);
    if (!s) {
      s = {
        isDown: false,
        activeKey: null,
        lastTriggerT: 0,
        xFilter: new OneEuroFilter(1.5, 0.02),
        yFilter: new OneEuroFilter(1.5, 0.02),
        prevY: null,
        prevT: null,
      };
      this.states.set(id, s);
    }
    return s;
  }

  update(
    hands: { handedness: string; landmarksPx: { x: number; y: number }[] }[],
    keys: KeyRect[],
    canvasH: number,
    t: number,
  ): NoteEvent[] {
    const events: NoteEvent[] = [];
    const seen = new Set<string>();
    const enterY = canvasH * this.cfg.activationFrac;
    const exitY = enterY - this.cfg.hysteresisPx;

    for (const hand of hands) {
      for (const fi of this.cfg.activeFingers) {
        const raw = hand.landmarksPx[FINGERTIPS[fi]];
        if (!raw) continue;
        const id = `${hand.handedness}-${fi}`;
        seen.add(id);
        const s = this.getState(id);
        const x = s.xFilter.filter(raw.x, t);
        const y = s.yFilter.filter(raw.y, t);

        let vy = 0;
        if (s.prevY !== null && s.prevT !== null) {
          const dt = Math.max((t - s.prevT) / 1000, 1e-3);
          vy = (y - s.prevY) / dt; // +ve = downward
        }
        s.prevY = y;
        s.prevT = t;

        const key = keyAtPoint(keys, x, y);

        if (this.cfg.mode === "line") {
          if (!s.isDown && y >= enterY && key) {
            if (t - s.lastTriggerT >= this.cfg.cooldownMs) {
              const velocity = clamp(Math.abs(vy) / this.cfg.velocityScale, 0.15, 1);
              events.push({ type: "on", midi: key.midi, velocity, fingerId: id });
              s.isDown = true;
              s.activeKey = key.midi;
              s.lastTriggerT = t;
            }
          } else if (s.isDown) {
            // glissando: slide to a new key while down (sustain only)
            if (this.cfg.sustain && key && key.midi !== s.activeKey) {
              if (s.activeKey !== null) events.push({ type: "off", midi: s.activeKey, velocity: 0, fingerId: id });
              const velocity = clamp(Math.abs(vy) / this.cfg.velocityScale, 0.15, 1);
              events.push({ type: "on", midi: key.midi, velocity, fingerId: id });
              s.activeKey = key.midi;
            }
            // release
            const leftKeyArea = !key;
            if (y < exitY || (this.cfg.sustain && leftKeyArea)) {
              if (this.cfg.sustain && s.activeKey !== null) {
                events.push({ type: "off", midi: s.activeKey, velocity: 0, fingerId: id });
              }
              s.isDown = false;
              s.activeKey = null;
            }
          }
        } else {
          // tap mode
          const fastDown = vy >= this.cfg.minVelocity;
          if (fastDown && key && t - s.lastTriggerT >= this.cfg.cooldownMs && y >= enterY * 0.8) {
            const velocity = clamp(Math.abs(vy) / this.cfg.velocityScale, 0.2, 1);
            events.push({ type: "on", midi: key.midi, velocity, fingerId: id });
            s.lastTriggerT = t;
            s.isDown = true;
            s.activeKey = key.midi;
          }
          if (vy < 0) s.isDown = false;
        }
      }
    }

    // released-finger cleanup (prevents stuck notes)
    for (const [id, s] of this.states) {
      if (!seen.has(id)) {
        if (s.isDown && this.cfg.sustain && s.activeKey !== null) {
          events.push({ type: "off", midi: s.activeKey, velocity: 0, fingerId: id });
        }
        s.isDown = false;
        s.activeKey = null;
        s.prevY = null;
        s.prevT = null;
        s.xFilter.reset();
        s.yFilter.reset();
      }
    }

    return events;
  }

  panic(): NoteEvent[] {
    const events: NoteEvent[] = [];
    for (const [id, s] of this.states) {
      if (s.activeKey !== null) events.push({ type: "off", midi: s.activeKey, velocity: 0, fingerId: id });
      s.isDown = false;
      s.activeKey = null;
    }
    return events;
  }
}
