import { useLocale, useTranslations } from "next-intl";
import { anchors, docs, external, products, routes, site } from "@/content/site";
import { Container } from "@/components/ui/Container";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Wordmark";

export function Footer() {
  const t = useTranslations("footer");
  const tn = useTranslations("nav");
  const home = `/${useLocale()}`;

  const columns = [
    {
      title: t("product"),
      links: [
        { label: `${site.name} ${products.meter.name}`, href: `${home}${products.meter.path}` },
        { label: `${site.name} ${products.reins.name}`, href: `${home}${products.reins.path}` },
        { label: t("links.demo"), href: `${home}${anchors.playground}` },
        { label: t("links.howItWorks"), href: `${home}${anchors.howItWorks}` },
        { label: t("links.pricing"), href: `${home}${anchors.pricing}` },
        { label: tn("faq"), href: `${home}${anchors.faq}` },
      ],
    },
    {
      title: t("developers"),
      links: [
        { label: t("links.docs"), href: docs.home },
        { label: t("links.openapi"), href: routes.openapi },
        { label: t("links.llms"), href: routes.llms },
        { label: t("links.panel"), href: routes.panel },
      ],
    },
    {
      title: t("resources"),
      links: [
        { label: t("links.stellar"), href: external.stellar },
        { label: t("links.x402"), href: external.x402 },
        { label: t("links.x402Stellar"), href: external.x402Stellar },
        { label: t("links.networkLimits"), href: external.networkLimits },
        { label: t("links.scfRfp"), href: external.scfRfp },
      ],
    },
  ];

  return (
    <footer className="border-t border-line bg-bg-alt py-14">
      <Container>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <span dir="ltr" className="flex items-center text-fg">
              <Logo />
            </span>
            <p className="mt-3 max-w-[38ch] text-sm text-fg-muted">
              {t("tagline")}
            </p>
            <div className="mt-6">
              <LanguageSwitcher />
            </div>
          </div>

          {columns.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="md:col-span-2 md:first-of-type:col-start-7"
            >
              <p className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">
                {column.title}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => {
                  const outbound = link.href.startsWith("http");
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(outbound
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-sm text-fg-muted transition-colors duration-150 hover:text-fg"
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-sm text-fg-subtle sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} <span dir="ltr">{site.name}</span>.{" "}
            {t("disclaimer")}
          </p>
          <p>{t("event")}</p>
        </div>
      </Container>
    </footer>
  );
}
