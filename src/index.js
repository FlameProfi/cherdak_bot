const bot = require('./bot');
const setupWebhook = require('./server');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    bot.launch();
    console.log('🤖 Telegram Bot started');
    const app = setupWebhook(bot);
    app.listen(PORT, () => {
      console.log(`🌐 Webhook server listening on port ${PORT}`);
    });
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}
bootstrap();
