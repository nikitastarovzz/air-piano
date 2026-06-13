import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Air Piano",
  description: "Play piano in the air with hand tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
