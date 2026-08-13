/**
 * TransferNotifierService — fire-and-forget RU transfer notification
 * (design D3, spec telegram-bot, task 5.1).
 * =============================================================================
 * The core guarantee (spec "Bot outage does not block the app"): sendMessage
 * failures are caught and logged HERE, never thrown to the caller — the
 * ownership/transfer flow completes even when the bot is down.
 *
 * Consumed by the ownership wave (backend engineer): inject this service
 * (exported by BotModule) and call notifyTransfer(targetUserId, fromUsername?)
 * when a transfer is initiated/confirmed. No DB lookup here — the caller
 * passes the target Telegram user id directly.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Bot } from 'grammy';

import { BOT } from './bot.tokens';

/** Bot-owned RU strings — single map, no i18n framework (design D8 note). */
const RU = {
  transferGranted:
    'Вам передан доступ к каталогу картин. Откройте приложение, чтобы подтвердить.',
  /** Sent to the PREVIOUS owner the moment the transfer swap commits (spec ownership-transfer "Transfer notification"). */
  transferRevoked: 'Доступ к каталогу картин передан другому пользователю.',
} as const;

@Injectable()
export class TransferNotifierService {
  private readonly logger = new Logger(TransferNotifierService.name);

  constructor(@Inject(BOT) private readonly bot: Bot) {}

  /**
   * Notify `toUserId` (Telegram chat id as TEXT) that access was granted.
   * Fire-and-forget: schedules the send, NEVER throws, never blocks the caller.
   */
  notifyTransfer(toUserId: string, fromUsername?: string): void {
    const prefix = fromUsername
      ? `@${fromUsername} передал вам доступ к каталогу картин. `
      : '';
    void this.send(toUserId, `${prefix}${RU.transferGranted}`);
  }

  /**
   * Notify the PREVIOUS owner (Telegram chat id as TEXT) that ownership was
   * transferred (spec ownership-transfer "Transfer notification"). Called by
   * the ownership guard AFTER the transfer-confirmed swap commits — only a
   * real confirmation triggers it. Fire-and-forget, never throws.
   */
  notifyTransferToPreviousOwner(previousOwnerId: string): void {
    void this.send(previousOwnerId, RU.transferRevoked);
  }

  private async send(chatId: string, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, text);
    } catch (error) {
      // Swallow: bot outage must never fail the request that triggered this.
      this.logger.error(
        `transfer notification to ${chatId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
