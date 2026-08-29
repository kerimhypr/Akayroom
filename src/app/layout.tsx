import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mobile.css";
import "./production-fixes.css";
import ClientOnly from "@/components/ClientOnly";
import MobileMenuBridge from "@/components/MobileMenuBridge";

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
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body><MobileMenuBridge /><ClientOnly>{children}</ClientOnly></body></html>;
}
