import { config, metaEnabled, telegramEnabled, twilioEnabled } from './config';
import { createServer } from './server';
import { createTelegramBot } from './platforms/telegram';
import { TokenStore } from './store';

async function main() {
  const store = new TokenStore(config.dbPath);

  const enabled = {
    telegram: telegramEnabled(),
    metaWhatsapp: metaEnabled(),
    twilioWhatsapp: twilioEnabled(),
  };

  if (!enabled.telegram && !enabled.metaWhatsapp && !enabled.twilioWhatsapp) {
    throw new Error(
      'No chat platform configured. Set TELEGRAM_BOT_TOKEN, and/or the ' +
        'META_WHATSAPP_* or TWILIO_* variables.'
    );
  }

  const telegram = enabled.telegram ? createTelegramBot(store) : undefined;

  // The HTTP server always runs: it serves /health, and the WhatsApp webhook
  // routes simply reject requests for whichever provider is unconfigured.
  const server = createServer(store).listen(config.port, () => {
    console.log(`BomaClaw listening on :${config.port}`);
    console.log(
      `  telegram=${enabled.telegram} meta-whatsapp=${enabled.metaWhatsapp} ` +
        `twilio-whatsapp=${enabled.twilioWhatsapp}`
    );
    if ((enabled.metaWhatsapp || enabled.twilioWhatsapp) && !config.publicUrl) {
      console.warn(
        'BOMACLAW_PUBLIC_URL is not set. Twilio signature validation needs the ' +
          'exact public URL and will reject requests without it.'
      );
    }
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    telegram?.stop(signal);
    server.close();
    store.close();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // launch() resolves only when the bot stops, so it is intentionally not
  // awaited -- awaiting it would block shutdown wiring above.
  if (telegram) {
    telegram.launch().catch((error) => {
      console.error('Telegram bot failed:', error);
      process.exit(1);
    });
  }
}

main().catch((error) => {
  console.error('BomaClaw failed to start:', error);
  process.exit(1);
});
