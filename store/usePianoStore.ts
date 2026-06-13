import { create } from "zustand";

export type Status = "idle" | "loading" | "ready" | "denied" | "error" | "nocamera";

interface PianoState {
  octaves: number;
  startMidi: number;
  mode: "line" | "tap";
  sustain: boolean;
  activationFrac: number;
  velocityScale: number;
  minVelocity: number;
  cooldownMs: number;
  showSkeleton: boolean;
  activeFingers: number[];
  numHands: number;
  masterVolume: number;
  status: Status;
  errorMsg: string;
  fps: number;
  set: <K extends keyof PianoState>(k: K, v: PianoState[K]) => void;
  setStatus: (s: Status, msg?: string) => void;
  setFps: (n: number) => void;
}

export const usePianoStore = create<PianoState>((set) => ({
  octaves: 2,
  startMidi: 60, // C4
  mode: "line",
  sustain: false,
  activationFrac: 0.62,
  velocityScale: 900,
  minVelocity: 450,
  cooldownMs: 180,
  showSkeleton: true,
  activeFingers: [1, 2, 3, 4], // exclude thumb by default
  numHands: 2,
  masterVolume: 0.8,
  status: "idle",
  errorMsg: "",
  fps: 0,
  set: (k, v) => set({ [k]: v } as Pick<PianoState, typeof k>),
  setStatus: (s, msg = "") => set({ status: s, errorMsg: msg }),
  setFps: (n) => set({ fps: n }),
}));
