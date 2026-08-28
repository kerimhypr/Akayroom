import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./v15.css";

export const metadata: Metadata = {
  title: "AKAYROOM V1.5",
  description: "Real-time communication, rebuilt.",
};
export const viewport: Viewport = { themeColor: "#08090d", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
