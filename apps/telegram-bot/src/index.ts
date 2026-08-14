import { config } from './config';
import { TokenStore } from './store';
import { createBot } from './bot';

async function main() {
  const store = new TokenStore(config.dbPath);
  const bot = createBot(store);

  process.once('SIGINT', () => {
    bot.stop('SIGINT');
    store.close();
  });
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    store.close();
  });

  await bot.launch();
  console.log('BomaClaw is running (long polling).');
}

main().catch((error) => {
  console.error('BomaClaw failed to start:', error);
  process.exit(1);
});
