import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

/* Tanıtım sitesiyle aynı üçlü: konsol ile site aynı markanın iki yüzü. */
const display = Sora({ variable: "--font-sora", subsets: ["latin", "latin-ext"], display: "swap" });
const body = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });
const code = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin", "latin-ext"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "Reinkey Console",
  description:
    "Reinkey Console: Meter ile gelirinizi, Reins ile ajan hesabınızı canlı izleyin. Kanallar, kuponlar, tahsilatlar ve zincirden gelen redler.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
