"use client";
import { usePianoStore } from "@/store/usePianoStore";

const FINGER_LABELS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

export default function ControlsPanel() {
  const s = usePianoStore();

  const toggleFinger = (i: number) => {
    const has = s.activeFingers.includes(i);
    s.set("activeFingers", has ? s.activeFingers.filter((f) => f !== i) : [...s.activeFingers, i].sort());
  };

  return (
    <div style={wrap}>
      <div style={row}>
        <span style={{ fontWeight: 600 }}>FPS: {s.fps}</span>
        <button style={ghost} onClick={() => s.setStatus(s.status)}>(status: {s.status})</button>
      </div>
      <div style={grid}>
        <label style={cell}>
          Mode
          <select value={s.mode} onChange={(e) => s.set("mode", e.target.value as "line" | "tap")}>
            <option value="line">Line (cross to play)</option>
            <option value="tap">Tap (downward stab)</option>
          </select>
        </label>
        <label style={cell}>
          Sustain
          <input type="checkbox" checked={s.sustain} onChange={(e) => s.set("sustain", e.target.checked)} />
        </label>
        <label style={cell}>
          Show skeleton
          <input type="checkbox" checked={s.showSkeleton} onChange={(e) => s.set("showSkeleton", e.target.checked)} />
        </label>
        <label style={cell}>
          Hands: {s.numHands}
          <input type="range" min={1} max={2} step={1} value={s.numHands} onChange={(e) => s.set("numHands", +e.target.value)} />
        </label>
        <label style={cell}>
          Octaves: {s.octaves}
          <input type="range" min={1} max={3} step={1} value={s.octaves} onChange={(e) => s.set("octaves", +e.target.value)} />
        </label>
        <label style={cell}>
          Start note (MIDI): {s.startMidi}
          <input type="range" min={48} max={72} step={1} value={s.startMidi} onChange={(e) => s.set("startMidi", +e.target.value)} />
        </label>
        <label style={cell}>
          Key line: {s.activationFrac.toFixed(2)}
          <input type="range" min={0.45} max={0.85} step={0.01} value={s.activationFrac} onChange={(e) => s.set("activationFrac", +e.target.value)} />
        </label>
        <label style={cell}>
          Sensitivity: {s.velocityScale}
          <input type="range" min={300} max={2000} step={50} value={s.velocityScale} onChange={(e) => s.set("velocityScale", +e.target.value)} />
        </label>
        <label style={cell}>
          Cooldown (ms): {s.cooldownMs}
          <input type="range" min={60} max={400} step={10} value={s.cooldownMs} onChange={(e) => s.set("cooldownMs", +e.target.value)} />
        </label>
        <label style={cell}>
          Volume: {s.masterVolume.toFixed(2)}
          <input type="range" min={0} max={1} step={0.05} value={s.masterVolume} onChange={(e) => s.set("masterVolume", +e.target.value)} />
        </label>
      </div>
      <div style={{ ...row, flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: "#666" }}>Active fingers:</span>
        {FINGER_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => toggleFinger(i)}
            style={{ ...chip, background: s.activeFingers.includes(i) ? "#3a7bd5" : "#e7e7e7", color: s.activeFingers.includes(i) ? "#fff" : "#333" }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { marginTop: 14, padding: 14, border: "1px solid #e3e3e3", borderRadius: 10 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 10 };
const cell: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#444" };
const chip: React.CSSProperties = { border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const ghost: React.CSSProperties = { border: "none", background: "transparent", color: "#999", cursor: "default", fontSize: 12 };
