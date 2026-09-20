import { ImageResponse } from "next/og";
import { ogPalette, site } from "@/content/site";
import { MARK_KEY, MARK_REIN, MARK_STROKE, MARK_VIEWBOX } from "@/components/landing/Wordmark";

/**
 * BELGELERİN PAYLAŞIM GÖRSELİ — sabit adres (`/docs/og`).
 *
 * `opengraph-image.tsx` dosya kuralı YALNIZCA bulunduğu segmente uygulanır ve
 * adresine derleme özeti eklenir; alt sayfalar (`/docs/security` …) o görseli
 * miras almaz. Sabit bir yol verince `docsMeta()` her sayfada aynı görseli
 * gösterebiliyor. Tek dilde olduğu için metin sabittir.
 */
export const dynamic = "force-static";

const SIZE = { width: 1200, height: 630 };

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: ogPalette.bg,
          padding: 80,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Sitede işaret tek renk; burada dizgin aksan alır. */}
          <svg
            viewBox={MARK_VIEWBOX}
            width={56}
            height={56}
            fill="none"
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={MARK_KEY} stroke={ogPalette.fg} />
            <path d={MARK_REIN} stroke={ogPalette.accent} />
          </svg>
          <span style={{ color: ogPalette.fg, fontSize: 44, letterSpacing: -1.5 }}>{site.name}</span>
          <span
            style={{
              color: ogPalette.fgMuted,
              fontSize: 26,
              border: `1px solid ${ogPalette.line}`,
              borderRadius: 999,
              padding: "6px 18px",
            }}
          >
            Docs
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ color: ogPalette.fg, fontSize: 68, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1000 }}>
            Build on the session layer.
          </span>
          <span style={{ color: ogPalette.fgMuted, fontSize: 30, maxWidth: 940 }}>
            Meter an endpoint, give an agent an on-chain budget, pay per request, per second or per token.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            height: 6,
            width: 240,
            borderRadius: 999,
            backgroundImage: ogPalette.gradient,
          }}
        />
      </div>
    ),
    SIZE,
  );
}
