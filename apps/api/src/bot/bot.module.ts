/**
 * BotModule — grammY bot composition root (design D7, task 5.1).
 * =============================================================================
 * Creates the Bot instance (BOT token) from the validated BOT_TOKEN env and
 * wires the RU handlers via TelegramBotService. In production it owns the
 * webhook seam:
 *   - the route is mounted at the RAW Express layer (${WEBAPP_URL}/bot/<secret>)
 *     via HttpAdapterHost — deliberately OUTSIDE Nest's guarded router, so the
 *     global ThrottlerGuard/AuthGuard never see Telegram updates and no
 *     @Public() is needed, and OUTSIDE the /api/v1 global prefix (raw Express
 *     paths are unaffected by it — the exact footgun from nest#11572);
 *   - route FIRST, setWebhook SECOND — Telegram is only told about a URL that
 *     already answers (no 404 window).
 * Both steps are best-effort and logged: a bot failure NEVER fails Nest boot
 * (spec "Bot outage does not block the app").
 *
 * Exported surface: TransferNotifierService — the ownership wave injects it to
 * notify the target user on transfer (design D3).
 */

import { Inject, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { webhookCallback, Bot } from 'grammy';
import type { Express, RequestHandler } from 'express';

import { BOT } from './bot.tokens';
import {
  BOT_WEBHOOK_PATH_PREFIX,
  deriveWebhookSecret,
  TelegramBotService,
} from './bot.service';
import { TransferNotifierService } from './transfer-notifier';

/** Safe error text for logs — never include tokens or derived secrets. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Module({
  providers: [
    {
      provide: BOT,
      inject: [ConfigService],
      // BOT_TOKEN is REQUIRED by env validation (env.validation.ts) — the
      // factory can fail fast here; boot continues regardless (see below).
      useFactory: (config: ConfigService): Bot =>
        new Bot(config.getOrThrow<string>('BOT_TOKEN')),
    },
    TelegramBotService,
    TransferNotifierService,
  ],
  exports: [TransferNotifierService],
})
export class BotModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotModule.name);

  constructor(
    @Inject(BOT) private readonly bot: Bot,
    private readonly config: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('NODE_ENV', 'development') !== 'production') return;

    try {
      this.mountWebhookRoute();
    } catch (error) {
      // Bot infra failure must not take the API down — log and continue.
      this.logger.error(`webhook route mount failed: ${describe(error)}`);
      return;
    }
    try {
      await this.registerWebhook();
    } catch (error) {
      this.logger.error(`webhook registration failed: ${describe(error)}`);
    }
  }

  /** Raw Express route at /bot/<secret> — pipes Telegram updates into the bot. */
  private mountWebhookRoute(): void {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      throw new Error('HttpAdapterHost has no httpAdapter at bootstrap');
    }
    const app = httpAdapter.getInstance<Express>();
    const secret = deriveWebhookSecret(this.bot.token);
    const handleUpdate = webhookCallback(this.bot, 'express', {
      // Defense in depth: beyond the unguessable path, require Telegram's
      // X-Telegram-Bot-Api-Secret-Token header (same derived secret).
      secretToken: secret,
    });
    const handler: RequestHandler = (req, res) => {
      // grammY 1.45.1's express adapter is typed (req, res) — Express's next
      // is neither used nor typed; errors are rethrown, not next()ed.
      void handleUpdate(req, res);
    };
    app.use(`${BOT_WEBHOOK_PATH_PREFIX}/${secret}`, handler);
  }

  /** Tell Telegram where to deliver updates — called only AFTER the route answers. */
  private async registerWebhook(): Promise<void> {
    const secret = deriveWebhookSecret(this.bot.token);
    const base = this.config.get<string>('WEBAPP_URL', '').replace(/\/+$/, '');
    if (!base) {
      throw new Error('WEBAPP_URL is required when NODE_ENV=production (webhook mode)');
    }
    const webhookUrl = `${base}${BOT_WEBHOOK_PATH_PREFIX}/${secret}`;
    await this.bot.api.setWebhook(webhookUrl, { secret_token: secret });
    this.logger.log('Telegram webhook registered (secret path derived from BOT_TOKEN)');
  }
}
