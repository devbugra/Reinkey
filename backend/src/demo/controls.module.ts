import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { EventsService } from '../audit/events.service';
import { CHAIN, type ChainPort } from '../chain/chain.port';
import { FrozenRegistry } from '../channel/frozen.registry';
import { ReinkeyError } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config/config';

const SCENARIOS = {
  trader: 'trader.ts',
  compromised: 'compromised.ts',
  injected: 'injected.ts',
} as const;
type Scenario = keyof typeof SCENARIOS;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const MAX_RUN_MS = 10 * 60_000;
const FREEZE_COOLDOWN_MS = 10_000;
const RUN_COOLDOWN_MS = 5_000;

/**
 * Ajan sürecine geçen ortam: tam liste. Facilitator anahtarı, veritabanı adresi
 * ve LLM anahtarı çocuğa verilmez; çıktısı herkese açık SSE'ye aktığı için
 * orada görünebilecek hiçbir sır süreçte bulunmamalı.
 */
const CHILD_ENV = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'NODE_OPTIONS',
  'STELLAR_NETWORK_PASSPHRASE',
  'RELAYER_SECRET',
  // Senaryo ayarları (agents/*.ts)
  'ATTACKER_ADDRESS',
  'BOOK_CALLS',
  'DEPOSIT',
  'OVER_CAP',
  'SWAP_IN',
] as const;

/** Stellar gizli anahtarı ve API anahtarı biçimleri: günlüğe düşerse maskelenir. */
const SECRETS = /\bS[A-Z2-7]{55}\b|\bsk-[A-Za-z0-9_-]{16,}\b/g;
export const redact = (line: string) => line.replace(SECRETS, '[gizlendi]');

/** `x-demo-key` başlığını sabit zamanlı karşılaştırır. Anahtar tanımlı değilse kontrol yoktur. */
export function demoKeyOk(expected: string | undefined, given: string | undefined): boolean {
  if (!expected) return true;
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Panelden başlatılan GERÇEK ajan süreci. Betikler `agents/` altındadır ve testnet'e
 * gerçek işlem gönderir; burada yalnızca süreç başlatılır ve çıktısı SSE'ye aktarılır.
 */
@Injectable()
export class AgentRunner implements OnApplicationShutdown {
  private readonly log = new Logger('AgentRunner');
  private current?: {
    runId: string;
    scenario: Scenario;
    child: ChildProcess;
    startedAt: string;
  };

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly events: EventsService,
  ) {}

  status() {
    return this.current
      ? {
          running: true,
          runId: this.current.runId,
          scenario: this.current.scenario,
          startedAt: this.current.startedAt,
        }
      : { running: false };
  }

  run(scenario: Scenario): { runId: string } {
    if (this.current)
      throw new ReinkeyError(
        'AGENT_BUSY',
        `Bir ajan zaten çalışıyor (${this.current.scenario})`,
        'gateway',
        409,
      );
    const dir = resolve(this.cfg.agentsDir);
    const tsx = resolve(dir, 'node_modules/.bin/tsx');
    const script = resolve(dir, SCENARIOS[scenario]);
    if (!existsSync(tsx) || !existsSync(script))
      throw new ReinkeyError(
        'NOT_SUPPORTED',
        'Ajan betikleri bu sunucuda kurulu değil (agents/ bağımlılıkları eksik)',
      );

    const runId = randomUUID();
    const child = spawn(tsx, [script], {
      cwd: dir,
      env: {
        ...Object.fromEntries(
          CHILD_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : [])),
        ),
        API_URL: this.cfg.publicUrl,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.current = {
      runId,
      scenario,
      child,
      startedAt: new Date().toISOString(),
    };
    const meta = { transient: true, account: this.cfg.demoAccountId };
    const pipe = (stream: 'stdout' | 'stderr') => {
      const src = child[stream];
      if (!src) return;
      createInterface({ input: src }).on('line', (raw) => {
        const line = redact(raw.replace(ANSI, '')).trimEnd();
        if (line) this.events.emit('agent.log', 'gateway', { runId, scenario, line, stream }, meta);
      });
    };
    pipe('stdout');
    pipe('stderr');

    const timer = setTimeout(() => child.kill('SIGTERM'), MAX_RUN_MS);
    const done = (code: number | null) => {
      clearTimeout(timer);
      if (this.current?.runId !== runId) return;
      this.current = undefined;
      this.events.emit('agent.exited', 'gateway', { runId, scenario, code: code ?? -1 }, meta);
      this.log.log(`ajan bitti: ${scenario} (${code})`);
    };
    child.on('exit', done);
    child.on('error', (e) => {
      this.events.emit('agent.log', 'gateway', { runId, scenario, line: `süreç hatası: ${e.message}`, stream: 'stderr' }, meta);
      done(-1);
    });
    this.log.log(`ajan başlatıldı: ${scenario} (${runId})`);
    return { runId };
  }

  onApplicationShutdown() {
    this.current?.child.kill('SIGTERM');
  }
}

const RunBody = z.object({
  scenario: z.enum(['trader', 'compromised', 'injected']),
});
const FreezeBody = z.object({ frozen: z.boolean() });

// Sunucunun anahtarıyla zincire yazan uçlar: herkese açık API belgesinde yer almaz.
@ApiExcludeController()
@Controller('demo')
export class DemoControlsController {
  private lastRun = 0;
  private lastFreeze = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(CHAIN) private readonly chain: ChainPort,
    private readonly runner: AgentRunner,
    private readonly events: EventsService,
    private readonly frozen: FrozenRegistry,
  ) {}

  private guard(key: string | undefined, last: number, cooldownMs: number) {
    if (!demoKeyOk(this.cfg.demoControlKey, key))
      throw new ReinkeyError('UNAUTHORIZED', 'x-demo-key başlığı eksik ya da yanlış', 'gateway', 401);
    const wait = last + cooldownMs - Date.now();
    if (wait > 0)
      throw new ReinkeyError(
        'RATE_LIMITED',
        `Bu kontrol ${Math.ceil(wait / 1000)} sn sonra yeniden kullanılabilir`,
      );
  }

  @Get('agent')
  agent() {
    return this.runner.status();
  }

  @Post('agent/run')
  @HttpCode(202)
  run(@Body() body: unknown, @Headers('x-demo-key') key?: string) {
    this.guard(key, this.lastRun, RUN_COOLDOWN_MS);
    const p = RunBody.safeParse(body);
    if (!p.success)
      throw new ReinkeyError('BAD_REQUEST', 'scenario: "trader" | "compromised" | "injected"');
    const started = this.runner.run(p.data.scenario);
    this.lastRun = Date.now();
    return started;
  }

  @Post('owner/freeze')
  @HttpCode(200)
  async freeze(@Body() body: unknown, @Headers('x-demo-key') key?: string) {
    this.guard(key, this.lastFreeze, FREEZE_COOLDOWN_MS);
    const p = FreezeBody.safeParse(body);
    if (!p.success) throw new ReinkeyError('BAD_REQUEST', 'frozen: boolean');
    const account = this.cfg.demoAccountId;
    if (!account || !this.cfg.agentOwnerSecret)
      throw new ReinkeyError(
        'NOT_SUPPORTED',
        'DEMO_ACCOUNT_ID ve AGENT_OWNER_SECRET tanımlı değil',
      );
    // Zincire gitmeden işaretlenir: eşzamanlı istekler de bekleme süresine takılsın.
    this.lastFreeze = Date.now();
    const { tx } = await this.chain.setFrozen(
      account,
      p.data.frozen,
      this.cfg.agentOwnerSecret,
    );
    this.frozen.set(account, p.data.frozen);
    this.events.emit(
      'account.frozen',
      'chain',
      { account, frozen: p.data.frozen, tx },
      { account, tx },
    );
    return { tx, account, frozen: p.data.frozen };
  }
}

@Module({
  providers: [AgentRunner],
  controllers: [DemoControlsController],
})
export class DemoControlsModule {}
