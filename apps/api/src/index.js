const bot = require('./bot');
const setupWebhook = require('./server');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app = setupWebhook(bot);
  app.listen(PORT, () => {
    console.log(`🌐 API server listening on port ${PORT}`);
  });

  try {
    await bot.launch();
    console.log('🤖 Telegram Bot started');
  } catch (error) {
    console.error('Telegram bot launch failed, API continues to run:', error.message || error);
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
bootstrap();
