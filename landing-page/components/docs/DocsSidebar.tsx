"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "@/content/docs";
import { cn } from "@/lib/utils";

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-7">
      {docsNav.map((group) => (
        <div key={group.title}>
          <p className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">{group.title}</p>
          <ul className="mt-3 flex flex-col gap-0.5 border-s border-line">
            {group.items.map((item) => {
              const on = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "-ms-px block border-s py-1.5 ps-4 text-sm transition-colors duration-150",
                      on ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
