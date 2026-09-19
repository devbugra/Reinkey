import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { ogPalette, site } from "@/content/site";
import { MARK_KEY, MARK_REIN, MARK_STROKE, MARK_VIEWBOX } from "@/components/landing/Wordmark";

export const alt = site.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return new ImageResponse(
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
        <span style={{ color: ogPalette.fg, fontSize: 44, letterSpacing: -1.5 }}>
          {site.name}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <span
          style={{
            color: ogPalette.fg,
            fontSize: 72,
            lineHeight: 1.1,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          {t("ogTitle")}
        </span>
        <span style={{ color: ogPalette.fgMuted, fontSize: 30, maxWidth: 900 }}>
          {t("ogSubtitle")}
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
    </div>,
    size,
  );
}
