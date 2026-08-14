import twilio from 'twilio';
import { config } from '../config';

/**
 * WhatsApp via Twilio.
 *
 * Twilio posts inbound messages as form-encoded fields and signs the request
 * with X-Twilio-Signature. Signature validation is delegated to Twilio's own
 * SDK rather than reimplemented: the algorithm concatenates the exact request
 * URL with sorted parameters before HMAC-SHA1, and small deviations (standard
 * ports, encoding) silently break it.
 */

/** Twilio addresses WhatsApp numbers as "whatsapp:+1555...". */
const stripPrefix = (value: string) => value.replace(/^whatsapp:/, '');
const addPrefix = (value: string) =>
  value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;

export function verifySignature(params: {
  signature?: string;
  url: string;
  body: Record<string, unknown>;
}): boolean {
  const authToken = config.twilio.authToken;
  if (!authToken) return false;
  if (!params.signature) return false;
  return twilio.validateRequest(
    authToken,
    params.signature,
    params.url,
    params.body as Record<string, string>
  );
}

export interface IInboundMessage {
  from: string;
  text: string;
}

/** Reads one inbound message out of Twilio's form-encoded webhook body. */
export function parseInbound(body: Record<string, unknown>): IInboundMessage | undefined {
  const from = typeof body.From === 'string' ? body.From : undefined;
  const text = typeof body.Body === 'string' ? body.Body : undefined;
  if (!from || !text) return undefined;
  return { from: stripPrefix(from), text };
}

export async function sendMessage(to: string, text: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = config.twilio;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio is not configured');
  }
  const client = twilio(accountSid, authToken);
  await client.messages.create({
    from: addPrefix(fromNumber),
    to: addPrefix(to),
    body: text,
  });
}
