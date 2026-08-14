import { BomaSheetClient } from './bomasheet-client';
import { respond } from './llm';
import type { IPlatform, TokenStore } from './store';

const HISTORY_LIMIT = 20;

// Ephemeral, per-conversation history. Lost on restart -- only the
// connected-account mapping is durable. Keyed by platform + conversation id so
// a Telegram chat and a WhatsApp thread never share context.
const histories = new Map<string, { role: 'user' | 'assistant'; content: string }[]>();

function pushHistory(key: string, role: 'user' | 'assistant', content: string) {
  const history = histories.get(key) ?? [];
  history.push({ role, content });
  while (history.length > HISTORY_LIMIT) {
    history.shift();
  }
  histories.set(key, history);
}

export const HELP_TEXT =
  'Commands:\n' +
  '/connect <token> - link your BomaSheet personal access token\n' +
  '/disconnect - forget your token\n' +
  '/whoami - show which BomaSheet account is connected';

export const WELCOME_TEXT =
  "I'm BomaClaw. I can read and edit your BomaSheet data from here.\n\n" +
  'First, connect your account:\n' +
  '1. In BomaSheet, go to Settings -> Personal access tokens and create one.\n' +
  '2. Send: /connect <token>\n\n' +
  'Then just ask, e.g. "what tables do I have".';

/**
 * Handles one inbound message from any platform and returns the reply text.
 *
 * Everything platform-specific (how the message arrived, how to send the
 * reply) stays in the adapter; this owns commands, auth lookup, history and
 * the LLM loop, so adding a platform means writing transport only.
 */
export async function handleMessage(params: {
  store: TokenStore;
  platform: IPlatform;
  /** Stable per-user id: Telegram user id, or WhatsApp phone number. */
  userId: string;
  /** Conversation id for history scoping; usually same as userId in DMs. */
  conversationId: string;
  text: string;
}): Promise<string> {
  const { store, platform, userId, conversationId, text } = params;
  const historyKey = `${platform}:${conversationId}`;
  const trimmed = text.trim();

  if (trimmed === '/start' || trimmed === 'start') {
    return WELCOME_TEXT;
  }
  if (trimmed === '/help') {
    return HELP_TEXT;
  }

  if (trimmed.startsWith('/connect')) {
    const token = trimmed.slice('/connect'.length).trim();
    if (!token) {
      return 'Usage: /connect <token>';
    }
    try {
      const user = await new BomaSheetClient(token).whoAmI();
      store.connect(platform, userId, token);
      return `Connected as ${user.name} (${user.email}).`;
    } catch (error) {
      return `Could not verify that token: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  if (trimmed === '/disconnect') {
    const removed = store.disconnect(platform, userId);
    histories.delete(historyKey);
    return removed ? 'Disconnected.' : "You weren't connected.";
  }

  const token = store.getToken(platform, userId);

  if (trimmed === '/whoami') {
    if (!token) return 'Not connected. Use /connect <token> first.';
    try {
      const user = await new BomaSheetClient(token).whoAmI();
      return `Connected as ${user.name} (${user.email}).`;
    } catch (error) {
      return `Stored token no longer works: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  if (trimmed.startsWith('/')) {
    return HELP_TEXT;
  }

  if (!token) {
    return 'Not connected yet. Use /connect <token> to get started.';
  }

  pushHistory(historyKey, 'user', trimmed);
  try {
    const reply = await respond(new BomaSheetClient(token), histories.get(historyKey) ?? []);
    pushHistory(historyKey, 'assistant', reply);
    return reply;
  } catch (error) {
    return `Something went wrong: ${error instanceof Error ? error.message : String(error)}`;
  }
}
