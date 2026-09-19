"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Menu, X } from "lucide-react";
import { anchors, docs, products, routes } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Wordmark } from "./Wordmark";

export function Nav() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const locale = useLocale();
  const pathname = usePathname();
  const home = `/${locale}`;

  /**
   * Menü ürünlerle başlar: ziyaretçi önce "hangisi benim için" sorusunu
   * cevaplar. Çapalar her zaman ana sayfaya göre yazılır; menü ürün
   * sayfalarında da aynıdır ve oradan ana sayfanın bölümüne götürür.
   */
  const links = [
    { href: `${home}${products.meter.path}`, label: t("meter") },
    { href: `${home}${products.reins.path}`, label: t("reins") },
    { href: `${home}${anchors.howItWorks}`, label: t("howItWorks") },
    { href: `${home}${anchors.pricing}`, label: t("pricing") },
    { href: docs.home, label: t("docs") },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * ETKİN BÖLÜM.
   *
   * Menüde bulunduğunuz yerin işaretlenmesi, uzun bir tek sayfada nerede
   * olduğunuzu söyleyen tek ipucudur. IntersectionObserver kullanılır; kaydırma
   * olayında hesaplamak her karede düzen okuması yapar ve sayfayı takar.
   *
   * `rootMargin` üstten yüzen menünün yüksekliği kadar kısılır, yoksa menünün
   * ARKASINDA kalan bölüm "etkin" sayılırdı.
   */
  useEffect(() => {
    const ids = links.filter((l) => l.href.includes("#")).map((l) => l.href.split("#")[1]);
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(`${home}#${visible[0].target.id}`);
      },
      { rootMargin: "-88px 0px -55% 0px" },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // links dizisi her render'da yeniden kurulur; kimlikleri sabittir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    /* Yüzen hap menü. Kabuk tıklama almaz, yalnızca hap alır — altındaki
       içerik seçilebilir kalsın. Genişlik içerik kabıyla (max-w-6xl) AYNI:
       daha dar bir hap, logonun sayfadaki hiçbir şeyle hizalanmamasına yol
       açıyordu.

       AKIŞ DIŞI (fixed). `sticky` olduğunda başlık kendi yüksekliği kadar yer
       kaplıyordu ve hero'nun üstünde, ışık katmanının dışında kalan boş bir
       şerit oluşuyordu — sayfanın tepesinde görünür bir koyu bant. Sayfalar
       bunun yerine üstten dolgu verir. */
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 px-4 sm:top-4 sm:px-6">
      <a
        href="#main-content"
        className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-surface-1 focus:px-4 focus:py-2"
      >
        {tc("skipToContent")}
      </a>

      {/* PERDE. Hap sayfanın 12-16px altında yüzdüğü için üstündeki o ince
          şeritten kayan içerik görünüyordu. Zeminden şeffafa giden kısa bir
          geçiş bunu kapatır; hapın kendisine dokunmaz ve en üstteyken hiç
          çizilmez. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 h-24 bg-linear-to-b from-bg from-55% to-transparent transition-opacity duration-200",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cn(
          "pointer-events-auto relative mx-auto flex h-14 w-full max-w-6xl items-center gap-3 rounded-full ps-4 pe-2 transition-[background-color,border-color,box-shadow] duration-200 ease-(--ease-out-expo) sm:ps-5 sm:pe-2.5",
          scrolled
            ? "border border-line bg-surface-1/85 shadow-[var(--card-shadow)] backdrop-blur-xl"
            : "border border-transparent bg-transparent",
        )}
      >
        <Wordmark href={home} />

        {/* Bağlantılar ortada ve kendi içinde gruplu; iki yana yaslanınca
            aralarındaki ilişki kopuyor ve menü dağınık okunuyordu. */}
        <nav
          className="hidden flex-1 justify-center lg:flex"
          aria-label={tc("mainMenu")}
        >
          <ul className="flex items-center gap-1">
            {links.map((link) => {
              const on = link.href.includes("#") ? active === link.href : pathname === link.href;
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors duration-150",
                      on
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          {/* Dil seçici yalnızca geniş ekranda; dar ekranda menü içinde.
              1024-1200 arasında hepsi bir arada sığmıyor ve hap taşıyordu. */}
          <div className="hidden items-center gap-2 xl:flex">
            <LanguageSwitcher />
          </div>
          <Button
            href={routes.panel}
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
          >
            {t("panel")}
          </Button>
          <Button
            href={docs.home}
            size="sm"
            className="hidden sm:inline-flex"
          >
            {t("cta")}
          </Button>

          <button
            type="button"
            aria-label={tc("openMenu")}
            aria-expanded={open}
            aria-controls="mobil-menu"
            onClick={() => setOpen(true)}
            className="flex size-10 items-center justify-center rounded-full border border-line bg-surface-1 text-fg lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobil-menu"
          className="pointer-events-auto fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg px-6 lg:hidden"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
            <div className="flex h-14 items-center justify-between pt-3">
              <Wordmark href={home} onNavigate={() => setOpen(false)} />
              <button
                type="button"
                aria-label={tc("closeMenu")}
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full border border-line bg-surface-1 text-fg"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-6 flex flex-col">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between border-b border-line py-4 text-2xl text-fg"
                  >
                    {link.label}
                    <ArrowRight
                      className="size-5 text-fg-subtle rtl:-scale-x-100"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 pb-10">
              <Button
                href={docs.home}
                size="lg"
                onClick={() => setOpen(false)}
              >
                {t("cta")}
              </Button>
              <Button
                href={routes.panel}
                variant="secondary"
                size="lg"
                onClick={() => setOpen(false)}
              >
                {t("panel")}
              </Button>
              <div className="mt-4 flex items-center justify-end border-t border-line pt-6">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
