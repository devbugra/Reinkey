import type { NextFunction, Request, Response } from 'express';

/**
 * IP başına sabit pencereli hız sınırı (bellekte, tek örnek). Amaç adil kullanım
 * değil, anonim bir döngünün veritabanını doldurmasını ya da facilitator'a
 * zincir ücreti ödetmesini durdurmak. Yazan / zincire giden uçlar daha dardır.
 */
export interface IpLimitOptions {
  windowMs: number;
  /** Pencere başına genel tavan. Ödeme yolu (kupon, /verify) da buna sayılır; geniş tutulur. */
  general: number;
  /** Sunucuya zincir ücreti ödeten ya da kalıcı kayıt yazan uçlar için dar tavan. */
  writes: number;
  /** Dar tavanın uygulandığı istekler. */
  costly: (req: Request) => boolean;
  /** Sınır dışı tutulan yollar (uzun ömürlü SSE, sağlık kontrolü). */
  skip: (path: string) => boolean;
}

type Bucket = { reset: number; general: number; writes: number };

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function ipLimit(o: IpLimitOptions) {
  const buckets = new Map<string, Bucket>();
  // Süresi dolan kovalar atılır: harita ziyaretçi sayısıyla sınırsız büyümesin.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) if (b.reset <= now) buckets.delete(ip);
  }, o.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' || o.skip(req.path)) return next();
    const now = Date.now();
    const ip = clientIp(req);
    let b = buckets.get(ip);
    if (!b || b.reset <= now) {
      b = { reset: now + o.windowMs, general: 0, writes: 0 };
      buckets.set(ip, b);
    }
    const over = o.costly(req) ? ++b.writes > o.writes : ++b.general > o.general;
    if (!over) return next();
    res.setHeader('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
    res.status(429).json({
      error: 'RATE_LIMITED',
      source: 'gateway',
      message: 'Bu adresten çok fazla istek geldi; biraz sonra yeniden deneyin',
    });
  };
}

/** helmet eklemeden temel başlıklar. Swagger UI ve CORS'a dokunmaz. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}
