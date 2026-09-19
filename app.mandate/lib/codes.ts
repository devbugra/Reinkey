/**
 * Sebep kodlarının insan için açıklaması.
 * Kod listesi docs/BACKEND.md §3.3 ile aynıdır; kod yeni eklenirse burada
 * karşılığı yoksa ham kod gösterilir (sessizce kaybolmaz).
 */
const CODES: Record<string, string> = {
  // zincir: reinkey-account
  BAD_SIGNATURE: "İmza geçersiz",
  POLICY_EXPIRED: "Politikanın süresi dolmuş",
  ACCOUNT_FROZEN: "Hesap dondurulmuş",
  CONTEXT_NOT_ALLOWED: "Bu çağrıya yetki yok",
  PAYEE_NOT_ALLOWED: "Alıcı izinli listede değil",
  PER_TX_CAP_EXCEEDED: "Tek işlem tavanı aşıldı",
  DAILY_CAP_EXCEEDED: "Günlük tavan aşıldı",
  PAIR_NOT_ALLOWED: "Bu işlem çiftine izin yok",
  SLIPPAGE_UNBOUNDED: "Kayma koruması olmayan işlem",
  // zincir: channel
  CHANNEL_NOT_FOUND: "Kanal bulunamadı",
  CHANNEL_CLOSED: "Kanal kapalı",
  VOUCHER_BAD_SIGNATURE: "Kupon imzası geçersiz",
  VOUCHER_NOT_INCREASING: "Kupon tutarı artmıyor",
  EXCEEDS_DEPOSIT: "Depozitoyu aşıyor",
  NOT_EXPIRED: "Kanal süresi dolmadı",
  NOT_AUTHORIZED: "Yetkisiz",
  INVALID_ARGUMENT: "Geçersiz parametre",
  // zincir dışı
  PAYMENT_REQUIRED: "Ödeme gerekli",
  PAYMENT_MALFORMED: "Ödeme yükü çözülemedi",
  CHANNEL_EXPIRING: "Kanalın süresi dolmak üzere",
  WRONG_PAYEE: "Kanal bu satıcıya ait değil",
  WRONG_ASSET: "Yanlış varlık",
  VOUCHER_UNDERPAID: "Kupon fiyatı karşılamıyor",
  CHANNEL_EXHAUSTED: "Depozito bitti",
  RATE_LIMITED: "Çağrı sıklığı aşıldı",
  TIMEOUT: "Kupon zamanında gelmedi",
  AGENT_BUSY: "Ajan zaten çalışıyor",
  NOT_SUPPORTED: "Bu işlem desteklenmiyor",
  PRICE_SOURCE_UNAVAILABLE: "Fiyat kaynağına ulaşılamıyor",
  UNKNOWN_CHAIN_ERROR: "Zincir hatası (kod çözülemedi)",
};

export function describeCode(code: string): string {
  return CODES[code] ?? code;
}
