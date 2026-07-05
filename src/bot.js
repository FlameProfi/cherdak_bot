const { Telegraf, Markup, session } = require('telegraf');
const QRCode = require('qrcode');
const db = require('./database');
const fusion = require('./fusion-api');
const { calculateStatus, LOYALTY_LEVELS, buildBookingRequestMessage } = require('./utils');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session()); // Use session to store temporary registration data

const bookingAdminChatId = process.env.ADMIN_CHAT_ID || process.env.ADMIN_TG_ID;
const bookingRequests = new Map();

function isAdmin(ctx) {
  return ctx.from && ctx.from.id && ctx.from.id.toString() === process.env.ADMIN_TG_ID;
}

function escapeMarkdown(text = '') {
  return text.toString().replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

const mainMenu = Markup.keyboard([
  ['📇 Моя карта'],
  ['📜 Меню', '📅 Забронировать'],
  // ['🤝 Пригласить друга']
]).resize();

const bookingIntroText = '✨ Отлично, давайте оформим бронь. Я помогу быстро собрать данные и отправлю заявку администратору.';

bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  const user = db.getUserByTgId(tgId);

  // Если пользователь уже есть в нашей базе данных
  if (user) {
    return ctx.reply(`С возвращением, ${user.full_name}!`, mainMenu);
  }

  // Ловим реферальный хвост из ссылки (то, что идет после /start)
  const startPayload = ctx.payload; 
  let referrerId = null;

  // Проверяем: параметр есть, и пригласивший — это не сам пользователь
  if (startPayload && startPayload !== tgId.toString()) {
    referrerId = Number(startPayload);
    // На всякий случай проверяем, что это корректное число и такой пригласитель существует у нас в БД
    if (isNaN(referrerId) || !db.getUserByTgId(referrerId)) {
      referrerId = null; 
    }
  }

  // Создаем предварительный профиль "Новичка" с привязкой к пригласителю
  // Телефон и имя обновятся/запишутся на следующих этапах вашей регистрации
  db.saveUser({
    telegram_id: tgId,
    fusion_client_id: null,
    phone: '',
    full_name: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || 'Гость',
    total_spent: 0,
    current_level: 'Новичок',
    referred_by: referrerId, // Сохраняем ID того, кто пригласил
    is_ref_rewarded: 0       // Бонус пока не выдан (выдадим на вебхуке после покупки)
  });

  // Отправляем приветственный текст
  if (referrerId) {
    await ctx.reply('🎉 Вы зашли по приглашению друга! После вашей первой покупки он получит приятный бонус.');
  }

  // Запрашиваем телефон (ваша стандартная логика)
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
    phone: fusion.formatPhoneForFusion(contact.phone_number),
    first_name: contact.first_name,
    last_name: contact.last_name || ''
  };

  await ctx.reply('Пожалуйста, укажите ваш пол:', Markup.inlineKeyboard([
    [Markup.button.callback('Мужской ♂️', 'gender_male'), Markup.button.callback('Женский ♀️', 'gender_female')]
  ]));
  
  try {
    
  } catch (error) {
    console.error(error);
  }
});

bot.action(/gender_(.+)/, async (ctx) => {
  const gender = ctx.match[1];
  const regData = ctx.session?.registration;

  if (!regData) {
    return ctx.reply('Ошибка сессии. Пожалуйста, начните регистрацию заново /start');
  }

  try {
    let rawClient = await fusion.findClientByPhone(regData.phone);

    if (!rawClient) {
      rawClient = await fusion.createClient({
        first_name: regData.first_name,
        last_name: regData.last_name,
        phone: regData.phone,
        gender: gender // 'male' or 'female'
      });
    }

    const fusionClient = fusion.normalizeClient(rawClient);
    const { current } = calculateStatus(fusionClient.total_spent);

    db.saveUser({
      telegram_id: ctx.from.id,
      fusion_client_id: fusionClient.id,
      phone: fusionClient.phone,
      full_name: fusionClient.full_name,
      total_spent: fusionClient.total_spent,
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
    const rawData = await fusion.getClientDetails(user.fusion_client_id);
    const fusionData = fusion.normalizeClient(rawData);

    // ИСПРАВЛЕНИЕ: Берем нормализованное числовое поле total_spent
    const totalSpent = fusionData ? fusionData.total_spent : user.total_spent;
    const { current, next } = calculateStatus(totalSpent);

    db.saveUser({ ...user, total_spent: totalSpent, current_level: current.name });

    let message = `👤 *Имя:* ${user.full_name}\n`;
    message += `🏆 *Статус:* ${current.name}\n`;
    message += `💰 *Скидка:* ${current.discount}%\n`;
    message += `🔢 *Ваш код:* \`${user.fusion_client_id}\`\n`;
    message += `📈 *Всего потрачено:* ${totalSpent} руб.\n\n`;

    if (next) {
      // Математика теперь сработает без ошибок, так как totalSpent — число
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

bot.hears('📅 Забронировать', async (ctx) => {
  const user = db.getUserByTgId(ctx.from.id);
  if (!user) return ctx.reply('Пожалуйста, сначала пройдите регистрацию /start');

  ctx.session = ctx.session || {};
  ctx.session.booking = ctx.session.booking || {};
  ctx.session.booking.step = 'date';
  ctx.session.booking.userName = user.full_name || ctx.from.first_name || 'Клиент';

  await ctx.replyWithMarkdown(`${bookingIntroText}\n\n📅 Шаг 1/4\nВведите дату бронирования в формате *ДД.ММ.ГГГГ*, например *10.07.2026*`);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text || '';
  ctx.session = ctx.session || {};
  const adminFlow = ctx.session.adminFlow;
  const booking = ctx.session.booking;

  if (adminFlow && isAdmin(ctx)) {
    if (adminFlow.type === 'add_menu') {
      if (adminFlow.step === 'name') {
        adminFlow.data.name = text.trim();
        adminFlow.step = 'price';
        return ctx.reply('Введите цену в рублях, например: 420');
      }
      if (adminFlow.step === 'price') {
        const price = Number(text.trim().replace(/\D/g, ''));
        if (!price || price <= 0) return ctx.reply('Введите корректную числовую цену.');
        adminFlow.data.price = price;
        adminFlow.step = 'description';
        return ctx.reply('Введите описание позиции.');
      }
      if (adminFlow.step === 'description') {
        adminFlow.data.description = text.trim();
        const { name, price, description } = adminFlow.data;
        const id = await db.addMenuItem(name, price, description);
        delete ctx.session.adminFlow;
        return ctx.reply(`Позиция добавлена: #${id} ${name} — ${price}₽\n${description}`);
      }
    }

    if (adminFlow.type === 'create_booking') {
      if (adminFlow.step === 'name') {
        adminFlow.data.name = text.trim();
        adminFlow.step = 'date';
        return ctx.reply('Введите дату бронирования в формате ДД.MM.ГГГГ.');
      }
      if (adminFlow.step === 'date') {
        adminFlow.data.date = text.trim();
        adminFlow.step = 'time';
        return ctx.reply('Введите время бронирования, например 19:00.');
      }
      if (adminFlow.step === 'time') {
        adminFlow.data.time = text.trim();
        adminFlow.step = 'guests';
        return ctx.reply('Сколько гостей будет? Введите число.');
      }
      if (adminFlow.step === 'guests') {
        const guests = Number(text.trim().replace(/\D/g, ''));
        if (!Number.isInteger(guests) || guests <= 0) return ctx.reply('Введите корректное число гостей.');
        adminFlow.data.guests = guests;
        adminFlow.step = 'table';
        return ctx.reply('Введите код стола, например P1, или введите - если без стола.');
      }
      if (adminFlow.step === 'table') {
        const tableCode = text.trim().toUpperCase();
        if (tableCode !== '-' && !tableCode) return ctx.reply('Введите код стола или -.');
        adminFlow.data.tableCode = tableCode === '-' ? null : tableCode;
        adminFlow.step = 'comment';
        return ctx.reply('Введите комментарий или - если его нет.');
      }
      if (adminFlow.step === 'comment') {
        adminFlow.data.comment = text.trim() === '-' ? '' : text.trim();
        const bookingData = {
          name: adminFlow.data.name,
          phone: '—',
          date: adminFlow.data.date,
          time: adminFlow.data.time,
          guests: adminFlow.data.guests,
          table_code: adminFlow.data.tableCode,
          comment: adminFlow.data.comment || null,
          status: 'pending'
        };
        const bookingId = await db.saveBooking(bookingData);
        if (adminFlow.data.tableCode) {
          await db.updateTableStatus(adminFlow.data.tableCode, 'reserved');
        }
        delete ctx.session.adminFlow;
        return ctx.reply(`Бронь создана: #${bookingId}\nИмя: ${bookingData.name}\nДата: ${bookingData.date} ${bookingData.time}\nСтол: ${bookingData.table_code || 'не указан'}`);
      }
    }
  }

  if (!booking || !booking.step) return;

  if (booking.step === 'date') {
    booking.date = text.trim();
    booking.step = 'time';
    return ctx.replyWithMarkdown('🕒 Шаг 2/4\nТеперь введите время бронирования, например *19:00*');
  }

  if (booking.step === 'time') {
    booking.time = text.trim();
    booking.step = 'guests';
    return ctx.replyWithMarkdown('👥 Шаг 3/4\nСколько гостей будет?');
  }

  if (booking.step === 'guests') {
    const guests = Number(text.trim());
    if (!Number.isInteger(guests) || guests <= 0) {
      return ctx.reply('Пожалуйста, введите корректное число гостей.');
    }

    booking.guests = guests;
    booking.step = 'comment';
    return ctx.replyWithMarkdown('💬 Шаг 4/4\nДобавьте комментарий к броням или отправьте *-* если комментария нет');
  }

  if (booking.step === 'comment') {
    booking.comment = text.trim() === '-' ? '' : text.trim();
    booking.id = Date.now();
    booking.user_name = booking.userName || ctx.from.first_name || 'Клиент';

    bookingRequests.set(String(booking.id), {
      id: booking.id,
      user_tg_id: ctx.from.id,
      user_name: booking.user_name,
      date: booking.date,
      time: booking.time,
      guests: booking.guests,
      comment: booking.comment
    });

    const message = buildBookingRequestMessage(booking);
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('✅ Подтвердить', `booking_confirm_${booking.id}`),
      Markup.button.callback('❌ Отклонить', `booking_reject_${booking.id}`)
    ]);

    try {
      if (bookingAdminChatId) {
        await bot.telegram.sendMessage(bookingAdminChatId, message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      }
      await ctx.reply('✅ Ваша заявка отправлена в админскую беседу. Ожидайте обработки. Мы скоро свяжемся с вами.');
    } catch (error) {
      console.error('Booking notify error:', error);
      await ctx.reply('Не удалось отправить заявку в админскую беседу. Попробуйте позже.');
    }

    delete ctx.session.booking;
  }
});

bot.action(/booking_(confirm|reject)_(\d+)/, async (ctx) => {
  const [, action, bookingId] = ctx.match;

  const isAdmin = ctx.from.id.toString() === process.env.ADMIN_TG_ID || ctx.chat?.id.toString() === bookingAdminChatId;
  if (!isAdmin) {
    return ctx.answerCbQuery('Только администратор может обрабатывать заявки.');
  }

  const bookingData = bookingRequests.get(bookingId);
  if (!bookingData) {
    return ctx.answerCbQuery('Эта заявка уже обработана или недоступна.');
  }

  const actionText = action === 'confirm' ? 'подтверждена' : 'отклонена';
  bookingRequests.delete(bookingId);
  await ctx.answerCbQuery(`Заявка ${actionText}`);
  await ctx.editMessageText(`${ctx.update.callback_query.message.text}\n\n🛠️ Статус: ${actionText.toUpperCase()}`);

  try {
    await bot.telegram.sendMessage(bookingData.user_tg_id, `Ваша бронь ${actionText}.`);
  } catch (error) {
    console.error('Booking status notify error:', error);
  }
});

bot.hears('⭐ Оставить отзыв', (ctx) => ctx.reply('Спасибо, что делитесь мнением!\n\n🗺️ Оставить отзыв можно здесь:\nhttps://yandex.ru/maps/-/CTq6aD2X'));
bot.hears('🤝 Пригласить друга', async (ctx) => {
  const tgId = ctx.from.id;
  const user = db.getUserByTgId(tgId);
  
  if (!user) return ctx.reply('Пожалуйста, сначала пройдите регистрацию.');

  const botUsername = ctx.botInfo.username;
  const refLink = `https://t.me/${botUsername}?start=${tgId}`;

  let msg = `🤝 *Приглашайте друзей и получайте бонусы!*\n\n`;
  msg += `Отправьте эту ссылку другу. Когда он зарегистрируется и совершит *первую покупку* в Чердаке, вы получите *+1000 руб.* к вашей сумме покупок для быстрого повышения статуса! 📈\n\n`;
  msg += `🔗 *Ваша ссылка:* \`${refLink}\``;

  await ctx.replyWithMarkdown(msg);
});

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

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(`*Админка Чердак*\n\n` +
    `/admin_menu — показать меню\n` +
    `/admin_add_menu — добавить позицию\n` +
    `/admin_remove_menu — удалить позицию\n` +
    `/admin_bookings — последние бронирования\n` +
    `/admin_tables — статус столов\n` +
    `/admin_create_booking — создать бронь вручную\n` +
    `/admin_stats — статистика пользователей`, { parse_mode: 'Markdown' });
});

bot.command('admin_menu', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const items = await db.getMenuItems();
  if (!items.length) {
    return ctx.reply('Меню пока пустое. Добавьте позицию командой /admin_add_menu.');
  }

  let text = '📋 Текущее меню:\n\n';
  const buttons = [];
  items.forEach(item => {
    text += `#${item.id} ${escapeMarkdown(item.name)} — ${item.price}₽\n${escapeMarkdown(item.description)}\n\n`;
    buttons.push([Markup.button.callback(`Удалить #${item.id}`, `delete_menu_${item.id}`)]);
  });

  await ctx.reply(text, Markup.inlineKeyboard(buttons).resize());
});

bot.command('admin_add_menu', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = ctx.session || {};
  ctx.session.adminFlow = { type: 'add_menu', step: 'name', data: {} };
  ctx.reply('Введите название новой позицию меню.');
});

bot.command('admin_remove_menu', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const items = await db.getMenuItems();
  if (!items.length) return ctx.reply('Меню пустое.');

  let text = 'Выберите позицию для удаления:\n\n';
  const buttons = items.map(item => [Markup.button.callback(`Удалить #${item.id}`, `delete_menu_${item.id}`)]);
  items.forEach(item => {
    text += `#${item.id} ${escapeMarkdown(item.name)} — ${item.price}₽\n`;
  });
  await ctx.reply(text, Markup.inlineKeyboard(buttons).resize());
});

bot.command('admin_bookings', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const bookings = await db.getAllBookings();
  if (!bookings.length) return ctx.reply('Бронирований пока нет.');

  let text = '📚 Последние бронирования:\n\n';
  bookings.slice(0, 20).forEach(booking => {
    text += `#${booking.id} ${escapeMarkdown(booking.name || 'Гость')} — ${booking.date || '—'} ${booking.time || '—'}\n`;
    text += `Стол: ${escapeMarkdown(booking.table_code || 'не указан')} | Гостей: ${booking.guests || 0} | Статус: ${escapeMarkdown(booking.status)}\n`;
    text += `Комментарий: ${escapeMarkdown(booking.comment || '—')}\n\n`;
  });
  await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('admin_tables', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const tables = await db.getAllTables();
  if (!tables.length) return ctx.reply('Таблицы не найдены.');

  let text = '🪑 Статусы столов:\n\n';
  const buttons = [];
  tables.forEach(table => {
    text += `${table.code} ${escapeMarkdown(table.label)} — ${table.seats} мест — ${table.status === 'available' ? 'Свободен' : 'Занят'}\n`;
    buttons.push([
      Markup.button.callback(`Свободен`, `table_status_${table.code}_available`),
      Markup.button.callback(`Занят`, `table_status_${table.code}_reserved`)
    ]);
  });

  await ctx.reply(text, Markup.inlineKeyboard(buttons).resize(), { parse_mode: 'Markdown' });
});

bot.command('admin_create_booking', (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = ctx.session || {};
  ctx.session.adminFlow = { type: 'create_booking', step: 'name', data: {} };
  ctx.reply('Создание брони: введите имя гостя.');
});

bot.action(/delete_menu_(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ.');
  const itemId = Number(ctx.match[1]);
  await db.removeMenuItem(itemId);
  await ctx.answerCbQuery(`Позиция #${itemId} удалена`);
  await ctx.editMessageText(`Позиция #${itemId} удалена.`);
});

bot.action(/table_status_([A-Z0-9]+)_(available|reserved)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Только админ.');
  const tableCode = ctx.match[1];
  const newStatus = ctx.match[2];

  try {
    const updated = await db.updateTableStatus(tableCode, newStatus);
    await ctx.answerCbQuery(`Статус стола ${tableCode} изменён на ${newStatus === 'available' ? 'Свободен' : 'Занят'}`);
    await ctx.editMessageText(`Стол ${updated.code} ${escapeMarkdown(updated.label)} теперь ${newStatus === 'available' ? 'Свободен' : 'Занят'}.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Update table status error:', error);
    await ctx.answerCbQuery('Ошибка при изменении статуса.');
  }
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
