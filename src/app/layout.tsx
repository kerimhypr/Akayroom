import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientOnly from "@/components/ClientOnly";

export const metadata: Metadata = {
  title: "AKAYROOM",
  description: "Gerçek zamanlı iletişim — metin, ses, görüntü ve canlılık. Ekipler için hızlı ve şık operasyon merkezi.",
  applicationName: "AKAYROOM",
  authors: [{ name: "AKAYROOM" }],
  keywords: ["akayroom", "sohbet", "sesli", "webrtc", "topluluk", "discord"],
  formatDetection: { telephone: false },
  openGraph: {
    title: "AKAYROOM",
    description: "Gerçek zamanlı iletişim — metin, ses, görüntü ve canlılık.",
    type: "website",
    locale: "tr_TR",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body><ClientOnly>{children}</ClientOnly></body></html>;
}
