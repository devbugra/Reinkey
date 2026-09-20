/** Belgelerin gezinme ağacı. Sıra okuma sırasıdır; "önceki / sonraki" da buradan türetilir. */
export const docsNav = [
  {
    title: "Get started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/concepts", label: "How it works" },
    ],
  },
  {
    title: "Reinkey Meter",
    items: [
      { href: "/docs/meter/quickstart", label: "Quickstart" },
      { href: "/docs/meter/reference", label: "Reference" },
    ],
  },
  {
    title: "Reinkey Reins",
    items: [
      { href: "/docs/reins/quickstart", label: "Quickstart" },
      { href: "/docs/reins/policy", label: "Policy & rejections" },
    ],
  },
  {
    title: "Reinkey Float",
    items: [{ href: "/docs/float", label: "Credit pool" }],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/reason-codes", label: "Reason codes" },
      { href: "/docs/api", label: "Facilitator API" },
    ],
  },
] as const;

export const docsPages = docsNav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
