/** Belgelerin gezinme ağacı. Sıra okuma sırasıdır; "önceki / sonraki" da buradan türetilir. */
export const docsNav = [
  {
    title: "Get started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/concepts", label: "How it works" },
      { href: "/docs/console", label: "Console guide" },
      { href: "/docs/testnet", label: "Testnet setup" },
    ],
  },
  {
    title: "AI assistants",
    items: [{ href: "/docs/mcp", label: "Paid MCP tool calls" }],
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
      { href: "/docs/limits", label: "Limits" },
      { href: "/docs/security", label: "Security model" },
    ],
  },
] as const;

export const docsPages = docsNav.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
