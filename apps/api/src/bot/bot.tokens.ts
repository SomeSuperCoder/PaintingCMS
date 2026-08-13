/**
 * DI token for the grammY Bot instance (task 5.1).
 *
 * Lives in its own file so the module and every consumer (TelegramBotService,
 * TransferNotifierService, BotModule) inject it without a module↔service
 * circular import. The instance itself is created ONCE by BotModule's factory
 * provider (the composition root) — nobody else constructs a Bot.
 */
export const BOT = Symbol('BOT');
