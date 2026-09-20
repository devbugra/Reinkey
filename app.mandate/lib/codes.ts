/**
 * Sebep kodlarının insan için açıklaması.
 * Kod listesi docs/BACKEND.md §3.3 ile aynıdır; karşılığı olmayan bir kod
 * ham hâliyle gösterilir (sessizce kaybolmaz).
 */
import { hasMessage, t } from "./t";

export function describeCode(code: string): string {
  return hasMessage("codes", code) ? t()(`codes.${code}` as never) : code;
}
