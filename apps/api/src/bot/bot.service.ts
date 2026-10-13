/**
 * TelegramBotService — owns the grammY bot: RU handlers + lifecycle (design D7,
 * task 5.1).
 * =============================================================================
 * THE hard guarantee (spec "Bot outage does not block the app"): nothing in
 * this service ever throws into the API. Every network call (polling start,
 * deleteWebhook) is wrapped and logged. The bot is OPTIONAL infrastructure —
 * CRUD/auth must work while it is down.
 *
 * Mode matrix by NODE_ENV:
 * - development → long polling (bot.start(), fire-and-forget — start() only
 *   resolves when polling STOPS, so awaiting it would block Nest boot).
 * - production  → webhook mode. The webhook ROUTE is mounted and registered
 *   by BotModule.onApplicationBootstrap (route first, then setWebhook, so
 *   Telegram is only told about a URL that already answers).
 * - test        → bot + handlers exist (unit-testable via bot.handleUpdate
 *   with fake updates) but nothing touches the network.
 */

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Bot, InlineKeyboard } from 'grammy';

import { BOT } from './bot.tokens';

/** Bot-owned RU strings — single map, no i18n framework (design D8 note). */
const RU = {
  welcome:
    'Добро пожаловать в ваш личный каталог картин. Нажмите кнопку ниже, чтобы открыть приложение.',
  openCatalog: 'Открыть каталог',
  otherMessageHint: 'Нажмите кнопку ниже, чтобы открыть каталог картин.',
} as const;

/** The webhook lives at ${PUBLIC_URL}${BOT_WEBHOOK_PATH_PREFIX}/<secret>. */
export const BOT_WEBHOOK_PATH_PREFIX = '/bot';

/**
 * Deterministic webhook secret: sha256(BOT_TOKEN) → 32 hex chars (128 bits).
 * Stable across restarts so the registered path never drifts between boots.
 * It doubles as the X-Telegram-Bot-Api-Secret-Token (defense in depth — a
 * leaked path alone is not enough to forge updates).
 */
export function deriveWebhookSecret(botToken: string): string {
  return createHash('sha256').update(botToken).digest('hex').slice(0, 32);
}

/** Safe error text for logs — never include tokens or derived secrets. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly nodeEnv: string;

  constructor(
    @Inject(BOT) private readonly bot: Bot,
    private readonly config: ConfigService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    this.registerHandlers();
  }

  async onModuleInit(): Promise<void> {
    if (this.nodeEnv !== 'development') return;
    // start() only resolves once polling STOPS — never await it during boot.
    void this.bot.start().catch((error: unknown) => {
      this.logger.error(`long polling failed: ${describe(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.bot.stop();
    } catch (error) {
      this.logger.warn(`bot stop failed: ${describe(error)}`);
    }
    if (this.nodeEnv !== 'production') return;
    try {
      // Graceful webhook cleanup (task 5.1). NOTE for deploy wave: this makes
      // Telegram stop delivering queued updates during downtime; if
      // catch-up-on-restart is preferred, remove this one call.
      await this.bot.api.deleteWebhook();
    } catch (error) {
      this.logger.warn(`webhook cleanup failed: ${describe(error)}`);
    }
  }

  private registerHandlers(): void {
    this.bot.command('start', async (ctx) => {
      try {
        await ctx.reply(RU.welcome, this.startReplyMarkup());
      } catch (error) {
        this.logger.error(`/start reply failed: ${describe(error)}`);
      }
    });

    // Any other message → short RU hint (spec only mandates /start; this keeps
    // the bot from feeling dead). Does not run for /start — the command
    // handler above stops the middleware chain.
    this.bot.on('message', async (ctx) => {
      try {
        await ctx.reply(RU.otherMessageHint, this.startReplyMarkup());
      } catch (error) {
        this.logger.error(`message reply failed: ${describe(error)}`);
      }
    });
  }

  /**
   * Inline keyboard with the WebApp button (web_app.url = PUBLIC_URL — the
   * Mini App contract). Returns undefined when PUBLIC_URL is unset (local dev
   * default) — the reply is text-only rather than a dead button.
   */
  private startReplyMarkup(): { reply_markup: InlineKeyboard } | undefined {
    const publicUrl = this.config.get<string>('PUBLIC_URL', '').replace(/\/+$/, '');
    if (!publicUrl) return undefined;
    return { reply_markup: new InlineKeyboard().webApp(RU.openCatalog, publicUrl) };
  }
}
