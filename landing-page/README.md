# Tanıtım sitesi

Next.js 16 + next-intl (tr, en) + Tailwind 4. Backend'e istek atmaz.

```bash
npm install
npm run dev        # adres ve port .env.local içinde (PORT, NEXT_PUBLIC_SITE_URL)
npm run build
```

- Proje adı: `content/site.ts` → `site.name` (logo, başlıklar ve metinler buradan okur).
- Metinler: `messages/tr.json`, `messages/en.json`.
- API ve canlı panel adresleri: `.env.example`.
- Demo politikası, fiyatlar ve sebep kodları: `components/landing/Playground.tsx` — Reinkey Account, channel kontratı ve facilitator ile aynı tutulmalı.
