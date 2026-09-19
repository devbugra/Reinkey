import { Inter, JetBrains_Mono, Sora } from "next/font/google";

/** Yazı tipleri iki kök düzende de (tanıtım sitesi ve belgeler) aynıdır. */
export const display = Sora({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
export const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
/* HTTP istekleri, sebep kodları ve adresler için. Ajanın gördüğü dünya
   metin değil protokoldür; sayfada da öyle görünmeli. */
export const code = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  display: "swap",
});

export const fontVariables = `${display.variable} ${body.variable} ${code.variable}`;
