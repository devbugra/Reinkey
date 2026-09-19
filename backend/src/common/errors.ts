import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorSource, OFFCHAIN_CODES, OffchainCode } from './reason-codes';

export interface ErrorBody {
  error: string;
  source: ErrorSource;
  message: string;
  tx?: string;
}

/** §3.3 biçiminde dönen hata. Kod verildiğinde HTTP durumu tablodan gelir. */
export class ReinkeyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly source: ErrorSource = 'gateway',
    readonly status: number = OFFCHAIN_CODES[code as OffchainCode] ?? 400,
    readonly tx?: string,
  ) {
    super(message);
  }

  toBody(): ErrorBody {
    return {
      error: this.code,
      source: this.source,
      message: this.message,
      ...(this.tx ? { tx: this.tx } : {}),
    };
  }
}

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

/** Her hatayı §3.3 biçimine sarar; yakalanmamış istisna `INTERNAL` olur. */
@Catch()
export class ReinkeyExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      res.end();
      return;
    }
    let status = 500;
    let body: ErrorBody;

    if (exception instanceof ReinkeyError) {
      status = exception.status;
      body = exception.toBody();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const msg =
        typeof r === 'string'
          ? r
          : Array.isArray((r as any)?.message)
            ? (r as any).message.join('; ')
            : ((r as any)?.message ?? exception.message);
      body = {
        error:
          HTTP_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
        source: 'gateway',
        message: String(msg),
      };
    } else {
      this.log.error(exception instanceof Error ? exception.stack : exception);
      body = {
        error: 'INTERNAL',
        source: 'gateway',
        message: 'Beklenmeyen sunucu hatası',
      };
    }
    res.status(status).json(body);
  }
}
