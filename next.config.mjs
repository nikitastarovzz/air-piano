/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The default single-threaded MediaPipe WASM works with no special headers.
  // If you later self-host the threaded/SIMD build, enable cross-origin isolation:
  // async headers() {
  //   return [{
  //     source: "/(.*)",
  //     headers: [
  //       { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  //       { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  //     ],
  //   }];
  // },
};

export default nextConfig;
