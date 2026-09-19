import { ImageResponse } from "next/og";
import { ogPalette } from "@/content/site";
import { MARK_KEY, MARK_REIN, MARK_STROKE, MARK_VIEWBOX } from "@/components/landing/Wordmark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ana ekran simgesi: icon.svg ile aynı çizim, iOS PNG istediği için üretilir. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ogPalette.bg,
      }}
    >
      <svg
        viewBox={MARK_VIEWBOX}
        width={124}
        height={124}
        fill="none"
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARK_KEY} stroke={ogPalette.fg} />
        <path d={MARK_REIN} stroke={ogPalette.accent} />
      </svg>
    </div>,
    size,
  );
}
