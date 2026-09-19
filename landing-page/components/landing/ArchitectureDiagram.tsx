/**
 * MİMARİ DİYAGRAMI.
 *
 * İki şerit: üstte zincir dışı ve hızlı olan (ajan → satıcı → facilitator),
 * altta zincirde ve yavaş olan (hesap → kanal). Kesik çizgiler akar: kupon
 * hattı hızlı, işlem hatları ağır. Tek SVG; renkler CSS token'larından,
 * yazı tipleri sayfayla aynı. Dar ekranda yatay kaydırılır, küçültülmez;
 * küçültülmüş etiket okunmaz.
 *
 * Etiketler çeviriden gelir; kutu genişlikleri en uzun dile göre seçildi.
 */
export type DiagramLabels = {
  offchain: string;
  onchain: string;
  agent: string;
  agentSub: string;
  seller: string;
  sellerSub: string;
  facilitator: string;
  facilitatorSub: string;
  account: string;
  accountSub: string;
  channel: string;
  channelSub: string;
  voucher: string;
  verify: string;
  open: string;
  claim: string;
  policy: string;
  stellar: string;
};

function Node({
  x,
  y,
  w = 220,
  h = 84,
  title,
  sub,
  accent = false,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill="var(--surface-2)"
        stroke={accent ? "color-mix(in srgb, var(--brand-sky) 55%, var(--line-strong))" : "var(--line-strong)"}
      />
      <rect x={x + 1} y={y + 1} width={w - 2} height={1} fill="var(--highlight)" />
      <text
        x={x + 18}
        y={y + 36}
        fill="var(--fg)"
        fontSize={15}
        fontWeight={600}
        fontFamily="var(--font-display)"
        letterSpacing={-0.2}
      >
        {title}
      </text>
      <text
        x={x + 18}
        y={y + 60}
        fill={accent ? "var(--accent-text)" : "var(--fg-subtle)"}
        fontSize={11.5}
        fontFamily="var(--font-code)"
      >
        {sub}
      </text>
    </g>
  );
}

function Label({ x, y, text, tone = "muted", anchor = "middle" }: { x: number; y: number; text: string; tone?: "muted" | "accent"; anchor?: "middle" | "start" }) {
  const w = text.length * 7 + 18;
  const x0 = anchor === "middle" ? x - w / 2 : x;
  return (
    <g>
      <rect x={x0} y={y - 11} width={w} height={20} rx={10} fill="var(--bg)" stroke="var(--line)" />
      <text
        x={anchor === "middle" ? x : x + 9}
        y={y + 3.5}
        textAnchor={anchor}
        fill={tone === "accent" ? "var(--accent-text)" : "var(--fg-muted)"}
        fontSize={11}
        fontFamily="var(--font-code)"
      >
        {text}
      </text>
    </g>
  );
}

export function ArchitectureDiagram({ labels: l }: { labels: DiagramLabels }) {
  return (
    <div dir="ltr" className="overflow-x-auto">
      <svg
        viewBox="0 0 960 372"
        role="img"
        aria-label={`${l.agent} → ${l.seller} → ${l.facilitator}; ${l.account} → ${l.channel}`}
        className="h-auto w-full min-w-[760px]"
      >
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--fg-subtle)" />
          </marker>
          <marker id="arr-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--accent)" />
          </marker>
        </defs>

        {/* Şerit etiketleri */}
        <text x={24} y={22} fill="var(--fg-subtle)" fontSize={10.5} letterSpacing={1.6} fontWeight={500} fontFamily="var(--font-body)">
          {l.offchain.toUpperCase()}
        </text>

        {/* Zincir bölgesi */}
        <rect x={8} y={222} width={944} height={142} rx={16} fill="color-mix(in srgb, var(--brand-blue) 6%, transparent)" stroke="var(--line)" strokeDasharray="4 6" />
        <text x={24} y={248} fill="var(--fg-subtle)" fontSize={10.5} letterSpacing={1.6} fontWeight={500} fontFamily="var(--font-body)">
          {l.onchain.toUpperCase()}
        </text>
        <text x={936} y={350} textAnchor="end" fill="var(--accent-text)" fontSize={11} fontFamily="var(--font-code)">
          {l.stellar}
        </text>

        {/* Hatlar (kutuların altında) */}
        {/* Ajan → Satıcı: kupon, hızlı */}
        <line x1={244} y1={80} x2={368} y2={80} stroke="var(--accent)" strokeWidth={1.5} className="flow-fast" markerEnd="url(#arr-accent)" />
        {/* Satıcı → Facilitator: doğrula */}
        <line x1={590} y1={80} x2={714} y2={80} stroke="var(--fg-subtle)" strokeWidth={1.5} className="flow-fast" markerEnd="url(#arr)" />
        {/* Ajan → Hesap: politika */}
        <line x1={134} y1={122} x2={134} y2={264} stroke="var(--line-strong)" strokeWidth={1.5} strokeDasharray="2 5" markerEnd="url(#arr)" />
        {/* Hesap → Kanal: open, yavaş */}
        <line x1={244} y1={308} x2={368} y2={308} stroke="var(--fg-subtle)" strokeWidth={1.5} className="flow-slow" markerEnd="url(#arr)" />
        {/* Facilitator → Kanal: claim, yavaş */}
        <path d="M826 122 V308 H592" fill="none" stroke="var(--fg-subtle)" strokeWidth={1.5} className="flow-slow" markerEnd="url(#arr)" />

        {/* Kutular */}
        <Node x={24} y={38} title={l.agent} sub={l.agentSub} />
        <Node x={370} y={38} title={l.seller} sub={l.sellerSub} accent />
        <Node x={716} y={38} title={l.facilitator} sub={l.facilitatorSub} />
        <Node x={24} y={266} title={l.account} sub={l.accountSub} accent />
        <Node x={370} y={266} title={l.channel} sub={l.channelSub} accent />

        {/* Hat etiketleri (kutuların üstünde) */}
        <Label x={307} y={80} text={l.voucher} tone="accent" />
        <Label x={652} y={80} text={l.verify} />
        <Label x={146} y={194} text={l.policy} anchor="start" />
        <Label x={307} y={308} text={l.open} />
        <Label x={708} y={308} text={l.claim} />
      </svg>
    </div>
  );
}
