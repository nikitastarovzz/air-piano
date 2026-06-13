"use client";
import dynamic from "next/dynamic";

// ssr:false — MediaPipe, getUserMedia and Web Audio are browser-only.
const AirPiano = dynamic(() => import("@/components/AirPiano"), { ssr: false });

export default function Page() {
  return <AirPiano />;
}
