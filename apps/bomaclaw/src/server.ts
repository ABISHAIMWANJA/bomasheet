import express from 'express';
import type { Request, Response } from 'express';
import { config, metaEnabled, twilioEnabled } from './config';
import { handleMessage } from './conversation';
import * as meta from './platforms/meta-whatsapp';
import * as twilioWhatsapp from './platforms/twilio-whatsapp';
import type { TokenStore } from './store';

/** Express's Request plus the raw body captured for signature verification. */
type IRawRequest = Request & { rawBody?: Buffer };

export function createServer(store: TokenStore) {
  const app = express();

  // Meta signs the RAW bytes, so they must be captured before JSON parsing --
  // re-serializing a parsed object will not reproduce them and every
  // signature check would fail.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as IRawRequest).rawBody = buf;
      },
    })
  );
  // Twilio posts form-encoded, not JSON.
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      whatsapp: { meta: metaEnabled(), twilio: twilioEnabled() },
    });
  });

  // --- Meta Cloud API ---

  // Verification handshake: Meta GETs this once when you register the webhook.
  app.get('/webhook/whatsapp/meta', (req: Request, res: Response) => {
    const challenge = meta.verifyChallenge(req.query as Record<string, string | undefined>);
    if (challenge === undefined) {
      res.sendStatus(403);
      return;
    }
    res.status(200).send(challenge);
  });

  app.post('/webhook/whatsapp/meta', async (req: Request, res: Response) => {
    const raw = (req as IRawRequest).rawBody ?? Buffer.from('');
    if (!meta.verifySignature(raw, req.header('x-hub-signature-256'))) {
      res.sendStatus(403);
      return;
    }

    // Acknowledge immediately: Meta retries anything not answered quickly,
    // and an LLM round-trip is far slower than that window.
    res.sendStatus(200);

    for (const inbound of meta.parseInbound(req.body)) {
      try {
        const answer = await handleMessage({
          store,
          platform: 'whatsapp',
          userId: inbound.from,
          conversationId: inbound.from,
          text: inbound.text,
        });
        await meta.sendMessage(inbound.from, answer);
      } catch (error) {
        console.error('meta webhook handling failed:', error);
      }
    }
  });

  // --- Twilio ---

  app.post('/webhook/whatsapp/twilio', async (req: Request, res: Response) => {
    // Twilio signs the exact URL it posted to, which this service cannot
    // infer reliably behind a proxy -- hence the configured public URL.
    const url = `${(config.publicUrl ?? '').replace(/\/$/, '')}/webhook/whatsapp/twilio`;
    const valid = twilioWhatsapp.verifySignature({
      signature: req.header('x-twilio-signature'),
      url,
      body: req.body as Record<string, unknown>,
    });
    if (!valid) {
      res.sendStatus(403);
      return;
    }

    res.type('text/xml').send('<Response></Response>');

    const inbound = twilioWhatsapp.parseInbound(req.body as Record<string, unknown>);
    if (!inbound) return;
    try {
      const answer = await handleMessage({
        store,
        platform: 'whatsapp',
        userId: inbound.from,
        conversationId: inbound.from,
        text: inbound.text,
      });
      await twilioWhatsapp.sendMessage(inbound.from, answer);
    } catch (error) {
      console.error('twilio webhook handling failed:', error);
    }
  });

  return app;
}
