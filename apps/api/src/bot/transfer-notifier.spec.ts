/**
 * TransferNotifierService (spec telegram-bot / ownership-transfer, task 5.1,
 * unit portion).
 * ======================================================================
 * The core guarantee: bot.sendMessage failures are SWALLOWED here — the
 * transfer/ownership flow completes even when the bot is down. The bot is
 * fully mocked (no network). Messages are the module-owned RU strings,
 * pinned exactly here.
 */

import { Logger } from '@nestjs/common';
import type { Bot } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransferNotifierService } from './transfer-notifier';

// Pinned from the module's RU map — exact-match is the point.
const RU_TRANSFER_GRANTED =
  'Вам передан доступ к каталогу картин. Откройте приложение, чтобы подтвердить.';

function makeBot(sendMessage: ReturnType<typeof vi.fn>): Bot {
  return { api: { sendMessage } } as unknown as Bot;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TransferNotifierService.notifyTransfer', () => {
  it('swallows bot failures — NEVER throws when sendMessage rejects', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sendMessage = vi.fn().mockRejectedValue(new Error('network down'));
    const notifier = new TransferNotifierService(makeBot(sendMessage));

    expect(() => notifier.notifyTransfer('12345', 'owner')).not.toThrow();
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('transfer notification to 12345 failed: network down'),
      ),
    );
  });

  it('swallows non-Error rejections too (opaque bot failures)', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sendMessage = vi.fn().mockRejectedValue('timeout');
    const notifier = new TransferNotifierService(makeBot(sendMessage));

    expect(() => notifier.notifyTransfer('12345')).not.toThrow();
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('timeout')),
    );
  });

  it('sends the RU message with the @username prefix when the from-username is known', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const notifier = new TransferNotifierService(makeBot(sendMessage));

    notifier.notifyTransfer('12345', 'owner');

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(
      '12345',
      `@owner передал вам доступ к каталогу картин. ${RU_TRANSFER_GRANTED}`,
    );
  });

  it('sends the bare RU message when no from-username is known', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const notifier = new TransferNotifierService(makeBot(sendMessage));

    notifier.notifyTransfer('12345');

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith('12345', RU_TRANSFER_GRANTED);
  });

  it('does not log an error on a successful send', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const notifier = new TransferNotifierService(makeBot(sendMessage));

    notifier.notifyTransfer('12345', 'owner');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
