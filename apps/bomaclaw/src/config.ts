function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const optional = (name: string) => process.env[name] || undefined;

/**
 * WhatsApp is supported through two providers because they suit different
 * situations: Meta's Cloud API is official and free-tier but needs business
 * verification, while Twilio starts working immediately at a per-message
 * cost. Either, both, or neither may be configured -- a provider activates
 * only when its credentials are present.
 */
export const config = {
  // --- Telegram (optional; long-polling, no webhook needed) ---
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),

  // --- WhatsApp via Meta Cloud API (optional) ---
  meta: {
    accessToken: optional('META_WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: optional('META_WHATSAPP_PHONE_NUMBER_ID'),
    // Echoed back during Meta's GET webhook verification handshake.
    verifyToken: optional('META_WHATSAPP_VERIFY_TOKEN'),
    // Used to verify the X-Hub-Signature-256 header on inbound POSTs.
    appSecret: optional('META_WHATSAPP_APP_SECRET'),
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
  },

  // --- WhatsApp via Twilio (optional) ---
  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
    // Sender in Twilio's format, e.g. "whatsapp:+14155238886".
    fromNumber: optional('TWILIO_WHATSAPP_FROM'),
  },

  // Public HTTPS base URL this service is reachable at. Required by Twilio
  // signature validation, which signs the exact URL the request was sent to.
  publicUrl: optional('BOMACLAW_PUBLIC_URL'),

  port: Number(process.env.PORT ?? 3000),

  bomasheetOrigin: required('BOMASHEET_ORIGIN').replace(/\/$/, ''),

  openaiApiKey: required('OPENAI_API_KEY'),
  openaiApiEndpoint: (process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com').replace(
    /\/$/,
    ''
  ),
  aiModel: process.env.AI_FIELD_MODEL || 'gpt-3.5-turbo',

  encryptionKey: required('BOMACLAW_ENCRYPTION_KEY'),
  dbPath: process.env.BOMACLAW_DB_PATH || './data/bomaclaw.sqlite',
  maxToolIterations: Number(process.env.BOMACLAW_MAX_TOOL_ITERATIONS ?? 6),
};

export const metaEnabled = () =>
  Boolean(config.meta.accessToken && config.meta.phoneNumberId && config.meta.verifyToken);

export const twilioEnabled = () =>
  Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber);

export const telegramEnabled = () => Boolean(config.telegramBotToken);
