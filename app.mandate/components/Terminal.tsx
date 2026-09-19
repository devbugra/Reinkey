"use client";

/** Ajan sürecinin canlı çıktısı (backend'in başlattığı gerçek süreç; SSE `agent.log`). */
import { useEffect, useRef } from "react";
import type { LogLine } from "@/lib/store";
import { Panel, cn } from "./ui";

export function Terminal({ logs, running }: { logs: LogLine[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <Panel
      title="Ajanın terminali"
      hint="Ajan sürecinin canlı çıktısı"
      action={
        <span className={cn("flex items-center gap-1.5 text-[11px]", running ? "text-success" : "text-fg-subtle")}>
          <span className={cn("size-1.5 rounded-full", running ? "pulse-dot bg-success" : "bg-fg-subtle")} aria-hidden="true" />
          {running ? "çalışıyor" : "beklemede"}
        </span>
      }
    >
      <div ref={box} className="h-64 overflow-y-auto bg-bg px-4 py-3 font-mono text-[11px] leading-relaxed" tabIndex={0}>
        {logs.length === 0 ? (
          <p className="text-fg-subtle">$ ajan henüz çalıştırılmadı</p>
        ) : (
          logs.map((l) => (
            <p key={l.key} className={cn("whitespace-pre-wrap break-words", l.stream === "stderr" ? "text-danger" : "text-fg-muted")}>
              {l.line}
            </p>
          ))
        )}
      </div>
    </Panel>
  );
}
