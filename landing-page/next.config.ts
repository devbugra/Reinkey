import path from "node:path";
import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Belgeler (`app/(docs)`) MDX ile yazılır. Eklentiler ad olarak (string) verilir:
 * Turbopack fonksiyon alamaz. gfm tablolar için, slug başlık çapaları için.
 */
const withMDX = createMDX({
  options: { remarkPlugins: ["remark-gfm"], rehypePlugins: ["rehype-slug"] },
});

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Depo kökü dışındaki package-lock.json'un yanlışlıkla seçilmesini engeller.
  turbopack: { root: path.resolve(import.meta.dirname) },
  poweredByHeader: false,
  pageExtensions: ["ts", "tsx", "mdx"],
  /*
   * API VEKİLİ BURADA YOK.
   *
   * Tanıtım sitesi backend'e hiç istek atmıyor; API ve denetim defteri
   * yalnızca bağlantı olarak geçer. Kullanılmayan bir /api vekili bırakmak,
   * herkese açık bu kökten backend'e açık bir kapı bırakmak olurdu.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          /**
           * TANITIM SİTESİ İÇİN İÇERİK GÜVENLİK POLİTİKASI.
           *
           * Burada nonce KULLANILMAZ, çünkü nonce istek başına üretilmek
           * zorundadır ve bu da sayfaları statik üretimden çıkarır. Tanıtım
           * sitesi statik kalmalı; karşılığında `script-src` satır içi betiğe
           * izin verir. Bu bilinçli bir ödünç: sitede kullanıcıdan gelen
           * hiçbir içerik render edilmiyor (metinler `messages/*.json`'dan,
           * derleme zamanında), dolayısıyla enjeksiyon yüzeyi yok. Politikanın
           * asıl kazancı DIŞ kaynakları kapatması: yabancı bir kökten betik,
           * iframe veya form gönderimi yüklenemez.
           *
           * Geliştirmede `'unsafe-eval'` eklenir: React hata yığınlarını
           * yeniden kurmak için eval kullanır. Üretimde eval çağrılmaz ve izin
           * verilmez.
           */
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(withMDX(nextConfig));
