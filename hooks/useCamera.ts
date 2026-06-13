import { useCallback, useMemo, useRef } from "react";

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (video: HTMLVideoElement) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error("getUserMedia unsupported"), { name: "UNSUPPORTED" });
    }
    if (!window.isSecureContext) {
      throw Object.assign(new Error("Camera requires HTTPS or localhost"), { name: "INSECURE" });
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play();
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Stable object identity so consumers can safely use `camera` as an effect
  // dependency (start/stop are useCallback-stable). Without this, returning a
  // fresh object each render would make a `[camera]`-deps effect re-run every
  // render — firing its cleanup (which stops the camera) on every update.
  return useMemo(() => ({ start, stop }), [start, stop]);
}
