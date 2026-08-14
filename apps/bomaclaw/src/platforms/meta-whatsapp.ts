import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/**
 * WhatsApp via Meta's Cloud API.
 *
 * Inbound messages arrive as webhook POSTs; Meta first verifies the endpoint
 * with a GET handshake. Both are handled here, the transport-only half of the
 * integration -- conversation logic lives in conversation.ts.
 */

/**
 * Meta's GET verification handshake: echo back hub.challenge when the token
 * matches. Returns undefined when it does not, so the caller can 403.
 */
export function verifyChallenge(query: Record<string, string | undefined>): string | undefined {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config.meta.verifyToken) {
    return challenge;
  }
  return undefined;
}

/**
 * Verifies the X-Hub-Signature-256 header: HMAC-SHA256 of the RAW request
 * body keyed with the app secret, hex encoded, prefixed "sha256=".
 *
 * Must run against the raw bytes, not a re-serialized object -- JSON.stringify
 * of a parsed body will not reproduce Meta's exact bytes and the signature
 * will never match.
 *
 * If no app secret is configured this returns true: Meta treats the signing
 * secret as optional, and rejecting everything would be a worse failure than
 * running unverified on a deployment that has not set one. Set
 * META_WHATSAPP_APP_SECRET in production.
 */
export function verifySignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const secret = config.meta.appSecret;
  if (!secret) return true;
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export interface IInboundMessage {
  from: string;
  text: string;
}

/**
 * Pulls plain-text messages out of Meta's deeply nested webhook payload.
 *
 * Non-text messages (images, reactions, status callbacks) are skipped rather
 * than erroring -- Meta sends delivery/read receipts through the same webhook,
 * and treating those as user input would reply to nobody.
 */
export function parseInbound(body: unknown): IInboundMessage[] {
  const out: IInboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const m = message as { from?: string; type?: string; text?: { body?: string } };
        if (m.type === 'text' && m.from && m.text?.body) {
          out.push({ from: m.from, text: m.text.body });
        }
      }
    }
  }
  return out;
}

export async function sendMessage(to: string, text: string): Promise<void> {
  const { accessToken, phoneNumberId, graphVersion } = config.meta;
  const res = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Meta send failed (${res.status}): ${detail}`);
  }
}
