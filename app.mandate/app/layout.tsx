import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

/* Tanıtım sitesiyle aynı üçlü: konsol ile site aynı markanın iki yüzü. */
const display = Sora({ variable: "--font-sora", subsets: ["latin", "latin-ext"], display: "swap" });
const body = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });
const code = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin", "latin-ext"], weight: ["400", "500"], display: "swap" });

/*
 * Üst veri tek dildedir (İngilizce): düzen bir sunucu bileşenidir ve kullanıcının
 * dilini bilemez — dil tarayıcıda seçilir (bkz. lib/locale.ts). Konsol dizine
 * eklenmediği için bu bir arama sorunu da değil.
 */
export const metadata: Metadata = {
  title: "Reinkey Console",
  description:
    "Watch your revenue with Meter and your agent account with Reins: channels, vouchers, settlements and on-chain rejections.",
  robots: { index: false, follow: false },
};

/**
 * `lang` varsayılan dille ("en") başlar ve panel açılınca tarayıcıda
 * güncellenir (bkz. components/DashboardLoader.tsx). Varsayılan, dil seçimiyle
 * aynı olmalı: `lib/locale.ts` de Türkçe olmayan her tarayıcıda "en" döner.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
