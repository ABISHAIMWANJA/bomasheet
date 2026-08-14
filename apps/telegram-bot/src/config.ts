function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),

  // The BomaSheet instance this bot talks to. Not assumed to be co-located --
  // BomaClaw is a separate app with its own deploy lifecycle, and calls
  // BomaSheet's public REST API the same way any other API client would.
  bomasheetOrigin: required('BOMASHEET_ORIGIN').replace(/\/$/, ''),

  openaiApiKey: required('OPENAI_API_KEY'),
  openaiApiEndpoint: (process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com').replace(
    /\/$/,
    ''
  ),
  aiModel: process.env.AI_FIELD_MODEL || 'gpt-3.5-turbo',

  // Encrypts stored personal access tokens at rest. Deliberately a separate
  // secret from BomaSheet's own SECRET_KEY/BACKEND_SESSION_SECRET -- this is
  // a different app with its own deploy lifecycle, and it should be possible
  // to rotate one without the other.
  encryptionKey: required('BOMACLAW_ENCRYPTION_KEY'),

  dbPath: process.env.BOMACLAW_DB_PATH || './data/bomaclaw.sqlite',

  // Hard ceiling on tool-calling round-trips per message, so a model that
  // never emits a final answer can't loop forever burning API calls.
  maxToolIterations: Number(process.env.BOMACLAW_MAX_TOOL_ITERATIONS ?? 6),
};
