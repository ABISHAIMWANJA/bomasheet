import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import { handleMessage } from '../conversation';
import type { TokenStore } from '../store';

/**
 * Telegram transport. Long-polls, so it needs no webhook, domain or TLS --
 * unlike both WhatsApp providers.
 *
 * All commands and conversation logic live in conversation.ts; this only
 * moves text in and out.
 */
export function createTelegramBot(store: TokenStore): Telegraf {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bot = new Telegraf(config.telegramBotToken!);

  const reply = async (ctx: {
    from?: { id: number };
    chat?: { id: number };
    message: { text: string };
    reply: (text: string) => Promise<unknown>;
    sendChatAction: (action: 'typing') => Promise<unknown>;
    deleteMessage: () => Promise<unknown>;
  }) => {
    const userId = String(ctx.from?.id ?? '');
    const conversationId = String(ctx.chat?.id ?? userId);
    const text = ctx.message.text;

    await ctx.sendChatAction('typing').catch(() => undefined);
    const answer = await handleMessage({
      store,
      platform: 'telegram',
      userId,
      conversationId,
      text,
    });

    // Best-effort: Telegram only lets a bot delete its own messages in a DM,
    // so this usually no-ops. The token is encrypted at rest regardless.
    if (text.trim().startsWith('/connect')) {
      await ctx.deleteMessage().catch(() => undefined);
    }
    await ctx.reply(answer);
  };

  bot.on(message('text'), (ctx) => reply(ctx as never));
  return bot;
}
