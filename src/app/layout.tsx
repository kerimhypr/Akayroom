import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AKAYROOM — operator comms",
  description: "Modern comms — metin, ses, canlılık. Ekipler için hızlı, sessiz ve şık operasyon merkezi.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
