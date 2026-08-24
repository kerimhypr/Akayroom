import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AKAYROOM — operator comms",
  description: "Minimal brutalist comms — text, voice, presence. Single-operator, monochrome, terminal-grade.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
