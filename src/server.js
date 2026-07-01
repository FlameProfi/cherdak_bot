const express = require('express');
const db = require('./database');
const fusion = require('./fusion-api');
const { calculateStatus } = require('./utils');
require('dotenv').config();

function setupWebhook(bot) {
  const app = express();
  app.use(express.json());

  app.post('/webhooks/fusionpos', async (req, res) => {
    // Webhook verification
    const secret = req.headers['x-fusion-secret'] || req.query.secret;
    if (secret !== process.env.WEBHOOK_SECRET) {
      console.warn('Unauthorized webhook attempt');
      return res.sendStatus(403);
    }

    console.log('Received Fusion POS webhook:', req.body);
    const { event, data } = req.body;

    if (event === 'order.closed' || event === 'receipt.created') {
      const fusionClientId = data.client_id;
      const amount = data.total_sum || 0;

      if (fusionClientId) {
        const user = db.getUserByFusionId(fusionClientId);
        if (user) {
          try {
            const fusionClient = await fusion.getClientDetails(fusionClientId);
            const totalSpent = fusionClient ? fusionClient.total_buy_sum : (user.total_spent + amount);
            const { current, next } = calculateStatus(totalSpent);

            db.saveUser({
              ...user,
              total_spent: totalSpent,
              current_level: current.name
            });

            let pushMessage = `✅ *Спасибо за визит!*\n\n`;
            pushMessage += `На ваш счет зачислено: ${amount} руб.\n`;
            pushMessage += `Статус: *${current.name}*\n\n`;

            if (next) {
              pushMessage += `До *${next.name}* осталось ${next.threshold - totalSpent} руб.`;
            } else {
              pushMessage += `У вас максимальный статус! 🏆`;
            }

            await bot.telegram.sendMessage(user.telegram_id, pushMessage, { parse_mode: 'Markdown' });
          } catch (err) {
            console.error('Error processing webhook:', err);
          }
        }
      }
    }

    res.sendStatus(200);
  });

  return app;
}

module.exports = setupWebhook;
