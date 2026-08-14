import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from './config';
import { TokenStore } from './store';
import { BomaSheetClient } from './bomasheet-client';
import { respond } from './llm';

// Ephemeral, in-memory, per-chat conversation history. Capped so a long-lived
// chat can't grow this without bound; lost on restart -- there is no chat
// history persistence in v1, only the connected-account mapping is durable.
const HISTORY_LIMIT = 20;
const histories = new Map<number, { role: 'user' | 'assistant'; content: string }[]>();

function pushHistory(chatId: number, role: 'user' | 'assistant', content: string) {
  const history = histories.get(chatId) ?? [];
  history.push({ role, content });
  while (history.length > HISTORY_LIMIT) {
    history.shift();
  }
  histories.set(chatId, history);
}

export function createBot(store: TokenStore): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  bot.start((ctx) =>
    ctx.reply(
      "I'm BomaClaw. I can read and edit your BomaSheet data from here.\n\n" +
        'First, connect your account:\n' +
        '1. In BomaSheet, go to Settings -> Personal access tokens and create one.\n' +
        '2. Send me: /connect <token>\n\n' +
        "Then just ask, e.g. \"what tables do I have\" or \"add a record to Tasks: title=Buy milk\"."
    )
  );

  bot.help((ctx) =>
    ctx.reply(
      'Commands:\n' +
        '/connect <token> - link your BomaSheet personal access token\n' +
        '/disconnect - forget your token\n' +
        '/whoami - show which BomaSheet account is connected'
    )
  );

  bot.command('connect', async (ctx) => {
    const token = ctx.payload.trim();
    if (!token) {
      return ctx.reply('Usage: /connect <token>');
    }

    try {
      const user = await new BomaSheetClient(token).whoAmI();
      store.connect(ctx.from.id, token);
      await ctx.reply(`Connected as ${user.name} (${user.email}).`);
    } catch (error) {
      await ctx.reply(
        `Could not verify that token against ${config.bomasheetOrigin}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Best-effort only: Telegram's Bot API lets a bot delete its own messages
    // in a private chat, but not the user's -- so this silently no-ops in a
    // DM, which is the common case, and only actually removes the token from
    // the log in a group chat where the bot has admin rights. The token is
    // still encrypted at rest regardless of whether this succeeds.
    await ctx.deleteMessage().catch(() => undefined);
  });

  bot.command('disconnect', async (ctx) => {
    const removed = store.disconnect(ctx.from.id);
    histories.delete(ctx.chat.id);
    await ctx.reply(removed ? 'Disconnected.' : "You weren't connected.");
  });

  bot.command('whoami', async (ctx) => {
    const token = store.getToken(ctx.from.id);
    if (!token) {
      return ctx.reply("Not connected. Use /connect <token> first.");
    }
    try {
      const user = await new BomaSheetClient(token).whoAmI();
      await ctx.reply(`Connected as ${user.name} (${user.email}).`);
    } catch (error) {
      await ctx.reply(
        `Stored token no longer works: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  bot.on(message('text'), async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      return; // unrecognized command, ignore rather than treat as a chat message
    }

    const token = store.getToken(ctx.from.id);
    if (!token) {
      return ctx.reply("Not connected yet. Use /connect <token> to get started.");
    }

    const client = new BomaSheetClient(token);
    const chatId = ctx.chat.id;
    pushHistory(chatId, 'user', ctx.message.text);

    await ctx.sendChatAction('typing');
    try {
      const reply = await respond(client, histories.get(chatId) ?? []);
      pushHistory(chatId, 'assistant', reply);
      await ctx.reply(reply);
    } catch (error) {
      await ctx.reply(
        `Something went wrong: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  return bot;
}
