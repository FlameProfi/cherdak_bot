const { Telegraf, Markup, session } = require('telegraf');
const QRCode = require('qrcode');
const db = require('./database');
const fusion = require('./fusion-api');
const { calculateStatus, LOYALTY_LEVELS } = require('./utils');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session()); // Use session to store temporary registration data

const mainMenu = Markup.keyboard([
  ['📇 Моя карта'],
  ['📜 Меню', '📅 Забронировать'],
  ['⭐ Оставить отзыв']
]).resize();

bot.start(async (ctx) => {
  const user = db.getUserByTgId(ctx.from.id);
  if (user) {
    return ctx.reply(`С возвращением, ${user.full_name}!`, mainMenu);
  }

  await ctx.reply(
    'Добро пожаловать в систему лояльности! Для регистрации, пожалуйста, поделитесь вашим номером телефона.',
    Markup.keyboard([
      Markup.button.contactRequest('📱 Поделиться контактом')
    ]).oneTime().resize()
  );
});

bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id) {
    return ctx.reply('Пожалуйста, поделитесь СВОИМ контактом.');
  }

  ctx.session = ctx.session || {};
  ctx.session.registration = {
    phone: contact.phone_number.replace(/\D/g, ''),
    first_name: contact.first_name,
    last_name: contact.last_name || ''
  };

  await ctx.reply('Пожалуйста, укажите ваш пол:', Markup.inlineKeyboard([
    [Markup.button.callback('Мужской ♂️', 'gender_male'), Markup.button.callback('Женский ♀️', 'gender_female')]
  ]));
});

bot.action(/gender_(.+)/, async (ctx) => {
  const gender = ctx.match[1];
  const regData = ctx.session?.registration;

  if (!regData) {
    return ctx.reply('Ошибка сессии. Пожалуйста, начните регистрацию заново /start');
  }

  try {
    let fusionClient = await fusion.findClientByPhone(regData.phone);

    if (!fusionClient) {
      fusionClient = await fusion.createClient({
        first_name: regData.first_name,
        last_name: regData.last_name,
        phone: regData.phone,
        gender: gender // 'male' or 'female'
      });
    }

    const { current } = calculateStatus(fusionClient.total_buy_sum || 0);

    db.saveUser({
      telegram_id: ctx.from.id,
      fusion_client_id: fusionClient.id,
      phone: regData.phone,
      full_name: `${regData.first_name} ${regData.last_name}`.trim(),
      total_spent: fusionClient.total_buy_sum || 0,
      current_level: current.name
    });

    delete ctx.session.registration;
    await ctx.editMessageText('Спасибо! Регистрация завершена.');
    await ctx.reply('Добро пожаловать!', mainMenu);
  } catch (error) {
    console.error('Registration error:', error);
    await ctx.reply('Ошибка регистрации. Попробуйте позже.');
  }
});

bot.hears('📇 Моя карта', async (ctx) => {
  const user = db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply('Пожалуйста, пройдите регистрацию /start');

  try {
    const fusionData = await fusion.getClientDetails(user.fusion_client_id);
    const totalSpent = fusionData ? (fusionData.total_buy_sum || 0) : user.total_spent;
    const { current, next } = calculateStatus(totalSpent);

    db.saveUser({ ...user, total_spent: totalSpent, current_level: current.name });

    let message = `👤 *Имя:* ${user.full_name}\n`;
    message += `🏆 *Статус:* ${current.name}\n`;
    message += `💰 *Скидка:* ${current.discount}%\n`;
    message += `🔢 *Ваш код:* \`${user.fusion_client_id}\`\n`;
    message += `📈 *Всего потрачено:* ${totalSpent} руб.\n\n`;

    if (next) {
      message += `🚀 До статуса *${next.name}* осталось потратить ${next.threshold - totalSpent} руб.`;
    } else {
      message += `👑 У вас максимальный статус!`;
    }

    const qrBuffer = await QRCode.toBuffer(user.fusion_client_id.toString());

    await ctx.replyWithPhoto({ source: qrBuffer }, {
      caption: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('Card display error:', error);
    ctx.reply('Ошибка при получении данных карты.');
  }
});

bot.hears('📜 Меню', (ctx) => ctx.reply(`Наше меню: ${process.env.MENU_URL}`));
bot.hears('📅 Забронировать', (ctx) => ctx.reply(`Забронировать: ${process.env.BOOKING_URL}`));
bot.hears('⭐ Оставить отзыв', (ctx) => ctx.reply(`Отзыв: ${process.env.REVIEW_URL}`));

bot.command('admin_stats', (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_TG_ID) return;
  const users = db.getAllUsers();
  const stats = users.reduce((acc, u) => {
    acc[u.current_level] = (acc[u.current_level] || 0) + 1;
    return acc;
  }, {});

  let response = `📊 *Статистика:*\nВсего: ${users.length}\n\n`;
  for (const [level, count] of Object.entries(stats)) {
    response += `${level}: ${count}\n`;
  }
  ctx.reply(response, { parse_mode: 'Markdown' });
});

/**
 * Таргетированная рассылка
 * Использование: /broadcast_tier [Название уровня|all] Текст сообщения
 */
bot.command('broadcast_tier', async (ctx) => {
  if (ctx.from.id.toString() !== process.env.ADMIN_TG_ID) return;

  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('Использование: /broadcast_tier [Название уровня|all] Текст сообщения\nНапример: /broadcast_tier Новичок Скидка 10% сегодня!');
  }

  const targetTier = args[1].toLowerCase();
  const message = args.slice(2).join(' ');

  const users = db.getAllUsers().filter(u =>
    targetTier === 'all' || u.current_level.toLowerCase() === targetTier
  );

  let success = 0, fail = 0;
  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.telegram_id, message);
      success++;
    } catch (err) { fail++; }
  }

  ctx.reply(`Рассылка завершена.\nЦель: ${targetTier}\nУспешно: ${success}\nОшибок: ${fail}`);
});

module.exports = bot;
