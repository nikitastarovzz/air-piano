import { isBlackKey } from "./notes";

export interface KeyRect {
  midi: number;
  isBlack: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Build a piano spanning `octaves` octaves from startMidi (C4 = 60), laid out in pixels.
export function buildKeyboard(
  canvasW: number,
  canvasH: number,
  startMidi: number,
  octaves: number,
  bandTopFrac = 0.55,
): KeyRect[] {
  const whiteSemis = [0, 2, 4, 5, 7, 9, 11];
  const whiteMidis: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const s of whiteSemis) whiteMidis.push(startMidi + o * 12 + s);
  }
  whiteMidis.push(startMidi + octaves * 12); // closing tonic
  const nWhite = whiteMidis.length;
  const whiteW = canvasW / nWhite;
  const bandTop = canvasH * bandTopFrac;
  const bandH = canvasH - bandTop;
  const blackW = whiteW * 0.62;
  const blackH = bandH * 0.62;

  const keys: KeyRect[] = [];
  whiteMidis.forEach((midi, i) => {
    keys.push({ midi, isBlack: false, x: i * whiteW, y: bandTop, width: whiteW, height: bandH });
  });
  whiteMidis.forEach((midi, i) => {
    const blackMidi = midi + 1;
    if (isBlackKey(blackMidi) && i < nWhite - 1) {
      const cx = (i + 1) * whiteW;
      keys.push({ midi: blackMidi, isBlack: true, x: cx - blackW / 2, y: bandTop, width: blackW, height: blackH });
    }
  });
  return keys;
}

// Black keys take priority (drawn on top).
export function keyAtPoint(keys: KeyRect[], px: number, py: number): KeyRect | null {
  for (const k of keys) {
    if (k.isBlack && px >= k.x && px <= k.x + k.width && py >= k.y && py <= k.y + k.height) return k;
  }
  for (const k of keys) {
    if (!k.isBlack && px >= k.x && px <= k.x + k.width && py >= k.y && py <= k.y + k.height) return k;
  }
  return null;
}
