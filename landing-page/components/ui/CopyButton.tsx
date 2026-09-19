"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => {
        // Pano izni reddedilebilir (http, iframe); düğme sessizce eski hâlinde kalır.
        void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
      }}
      className="flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
