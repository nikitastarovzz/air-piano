"use client";
import { useCallback, useEffect, useRef } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "@/lib/handTracker";
import { SynthPiano, type PianoEngine } from "@/lib/pianoEngine";
import { PressDetector, type PressConfig } from "@/lib/pressDetector";
import { buildKeyboard, keyAtPoint, type KeyRect } from "@/lib/keyboardLayout";
import { midiToName } from "@/lib/notes";
import { useCamera } from "@/hooks/useCamera";
import { usePianoStore } from "@/store/usePianoStore";
import ControlsPanel from "./ControlsPanel";

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

// computer-keyboard fallback (one octave from startMidi)
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

function drawKeys(ctx: CanvasRenderingContext2D, keys: KeyRect[], active: Set<number>) {
  for (const k of keys) {
    if (k.isBlack) continue;
    ctx.fillStyle = active.has(k.midi) ? "#7cc4ff" : "#fafafa";
    ctx.fillRect(k.x, k.y, k.width, k.height);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(k.x, k.y, k.width, k.height);
    ctx.fillStyle = "#999";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(midiToName(k.midi), k.x + k.width / 2, k.y + k.height - 8);
  }
  for (const k of keys) {
    if (!k.isBlack) continue;
    ctx.fillStyle = active.has(k.midi) ? "#3a7bd5" : "#161616";
    ctx.fillRect(k.x, k.y, k.width, k.height);
  }
}

function drawHands(ctx: CanvasRenderingContext2D, hands: { landmarksPx: { x: number; y: number }[] }[]) {
  for (const hand of hands) {
    ctx.strokeStyle = "rgba(0,255,160,0.7)";
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand.landmarksPx[a];
      const q = hand.landmarksPx[b];
      if (!p || !q) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    hand.landmarksPx.forEach((p, i) => {
      ctx.beginPath();
      ctx.fillStyle = TIPS.includes(i) ? "#ff3b6b" : "rgba(255,255,255,0.85)";
      ctx.arc(p.x, p.y, TIPS.includes(i) ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawLine(ctx: CanvasRenderingContext2D, w: number, h: number, frac: number) {
  const y = h * frac;
  ctx.strokeStyle = "rgba(255,235,59,0.55)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export default function AirPiano() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const engineRef = useRef<PianoEngine | null>(null);
  const detectorRef = useRef<PressDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const activeNotesRef = useRef<Set<number>>(new Set());
  const fpsRef = useRef({ frames: 0, t0: 0 });

  const camera = useCamera();
  const status = usePianoStore((s) => s.status);
  const errorMsg = usePianoStore((s) => s.errorMsg);
  const setStatus = usePianoStore((s) => s.setStatus);
  const setFps = usePianoStore((s) => s.setFps);

  // reactive cfg fields (keep detector in sync)
  const activationFrac = usePianoStore((s) => s.activationFrac);
  const cooldownMs = usePianoStore((s) => s.cooldownMs);
  const velocityScale = usePianoStore((s) => s.velocityScale);
  const minVelocity = usePianoStore((s) => s.minVelocity);
  const sustain = usePianoStore((s) => s.sustain);
  const activeFingers = usePianoStore((s) => s.activeFingers);
  const mode = usePianoStore((s) => s.mode);
  const numHands = usePianoStore((s) => s.numHands);
  const masterVolume = usePianoStore((s) => s.masterVolume);

  const buildCfg = useCallback((): PressConfig => {
    const s = usePianoStore.getState();
    return {
      activationFrac: s.activationFrac,
      hysteresisPx: 18,
      cooldownMs: s.cooldownMs,
      velocityScale: s.velocityScale,
      minVelocity: s.minVelocity,
      sustain: s.sustain,
      activeFingers: s.activeFingers,
      mode: s.mode,
    };
  }, []);

  const noteOn = useCallback((midi: number, velocity: number) => {
    engineRef.current?.noteOn(midi, velocity);
    activeNotesRef.current.add(midi);
  }, []);

  const noteOff = useCallback((midi: number) => {
    engineRef.current?.noteOff(midi);
    activeNotesRef.current.delete(midi);
  }, []);

  const startLoop = useCallback(() => {
    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const lm = landmarkerRef.current;
      const det = detectorRef.current;
      if (!video || !canvas || !lm || !det) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const w = canvas.width;
      const h = canvas.height;

      let results: ReturnType<HandLandmarker["detectForVideo"]> | null = null;
      if (video.readyState >= 2) {
        let ts = performance.now();
        if (ts <= lastTsRef.current) ts = lastTsRef.current + 1;
        lastTsRef.current = ts;
        results = lm.detectForVideo(video, ts);
      }

      // mirrored video
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      const s = usePianoStore.getState();
      const keys = buildKeyboard(w, h, s.startMidi, s.octaves);

      const hands: { handedness: string; landmarksPx: { x: number; y: number }[] }[] = [];
      if (results?.landmarks) {
        results.landmarks.forEach((marks, i) => {
          const handed = results?.handedness?.[i]?.[0]?.categoryName ?? `H${i}`;
          const pts = marks.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
          hands.push({ handedness: handed, landmarksPx: pts });
        });
      }

      const events = det.update(hands, keys, h, performance.now());
      for (const e of events) {
        if (e.type === "on") noteOn(e.midi, e.velocity);
        else noteOff(e.midi);
      }

      drawKeys(ctx, keys, activeNotesRef.current);
      if (s.showSkeleton) drawHands(ctx, hands);
      if (s.mode === "line") drawLine(ctx, w, h, s.activationFrac);

      const f = fpsRef.current;
      f.frames++;
      const now = performance.now();
      if (now - f.t0 >= 1000) {
        setFps(Math.round((f.frames * 1000) / (now - f.t0)));
        f.frames = 0;
        f.t0 = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fpsRef.current = { frames: 0, t0: performance.now() };
    rafRef.current = requestAnimationFrame(loop);
  }, [noteOn, noteOff, setFps]);

  const handleStart = useCallback(async () => {
    try {
      setStatus("loading");
      if (!engineRef.current) engineRef.current = new SynthPiano();
      await engineRef.current.resume();
      engineRef.current.setVolume(usePianoStore.getState().masterVolume);

      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      await camera.start(video);

      if (!landmarkerRef.current) {
        landmarkerRef.current = await createHandLandmarker(usePianoStore.getState().numHands);
      }
      detectorRef.current = new PressDetector(buildCfg());
      setStatus("ready");
      startLoop();
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setStatus("denied", "Camera permission denied.");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setStatus("nocamera", "No camera found.");
      else if (name === "NotReadableError") setStatus("error", "Camera is in use by another app.");
      else if (name === "INSECURE") setStatus("error", "Camera needs HTTPS (or localhost).");
      else if (name === "UNSUPPORTED") setStatus("error", "This browser can't access the camera.");
      else setStatus("error", (err as Error)?.message ?? "Something went wrong.");
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [camera, buildCfg, setStatus, startLoop]);

  // keep detector cfg synced
  useEffect(() => {
    if (detectorRef.current) detectorRef.current.cfg = buildCfg();
  }, [activationFrac, cooldownMs, velocityScale, minVelocity, sustain, activeFingers, mode, buildCfg]);

  // master volume
  useEffect(() => {
    engineRef.current?.setVolume(masterVolume);
  }, [masterVolume]);

  // numHands change
  useEffect(() => {
    landmarkerRef.current?.setOptions({ numHands }).catch(() => {});
  }, [numHands]);

  // canvas size from video
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = v.videoWidth || 1280;
      c.height = v.videoHeight || 720;
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, []);

  // tab visibility / blur => stop loop + release notes (saves battery, no stuck notes)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        engineRef.current?.allOff();
        activeNotesRef.current.clear();
      } else if (usePianoStore.getState().status === "ready") {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [startLoop]);

  // computer-keyboard fallback
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const semi = KEY_TO_SEMITONE[e.key.toLowerCase()];
      if (semi === undefined) return;
      noteOn(usePianoStore.getState().startMidi + semi, 0.8);
    };
    const up = (e: KeyboardEvent) => {
      const semi = KEY_TO_SEMITONE[e.key.toLowerCase()];
      if (semi === undefined) return;
      noteOff(usePianoStore.getState().startMidi + semi);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [noteOn, noteOff]);

  // tap-to-play fallback on canvas (percussive)
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!engineRef.current) {
        engineRef.current = new SynthPiano();
        engineRef.current.resume();
      }
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const s = usePianoStore.getState();
      const keys = buildKeyboard(canvas.width, canvas.height, s.startMidi, s.octaves);
      const k = keyAtPoint(keys, x, y);
      if (k) {
        noteOn(k.midi, 0.8);
        window.setTimeout(() => noteOff(k.midi), 250);
      }
    },
    [noteOn, noteOff],
  );

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      camera.stop();
      engineRef.current?.allOff();
      landmarkerRef.current?.close?.();
    };
  }, [camera]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>Air Piano 🎹</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Hover a fingertip over a key and dip below the yellow line to play. Two hands, ten fingers.
      </p>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onPointerDown={onPointerDown}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
        />
        {status !== "ready" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "rgba(0,0,0,0.72)",
              color: "#fff",
              textAlign: "center",
              padding: 24,
            }}
          >
            <div>
              {status === "idle" && (
                <>
                  <p style={{ marginBottom: 16, maxWidth: 420 }}>
                    Click start, then allow camera access. Sound turns on with this click too (browsers require it).
                  </p>
                  <button onClick={handleStart} style={btn}>Start camera & sound</button>
                </>
              )}
              {status === "loading" && <p>Loading model & camera…</p>}
              {(status === "denied" || status === "error" || status === "nocamera") && (
                <>
                  <p style={{ marginBottom: 12, color: "#ff9", maxWidth: 460 }}>{errorMsg}</p>
                  {status === "denied" && (
                    <p style={{ fontSize: 13, color: "#bbb", maxWidth: 460, marginBottom: 16 }}>
                      Click the camera icon in your browser&apos;s address bar → Allow, then retry.
                      You can still play with your mouse or computer keys below.
                    </p>
                  )}
                  <button onClick={handleStart} style={btn}>Retry</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <ControlsPanel />
      <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
        No camera? Tap the keys with your mouse, or use your keyboard: <code>A W S E D F T G Y H U J K</code>.
        Everything runs locally in your browser — the video is never uploaded.
      </p>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "10px 18px",
  fontSize: 15,
  borderRadius: 8,
  border: "none",
  background: "#3a7bd5",
  color: "#fff",
  cursor: "pointer",
};
