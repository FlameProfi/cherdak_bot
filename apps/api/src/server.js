const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const fusion = require('./fusion-api');
const { createAdminToken, parseAdminToken, roleAllows } = require('./auth');
const { calculateStatus, buildBookingRequestMessage } = require('./utils');
require('dotenv').config();

const adminChatId = process.env.ADMIN_CHAT_ID || process.env.ADMIN_TG_ID;
const BOOKING_LAYOUT = {
  L1: { left: '1.7%', top: '31.6%' },
  L2: { left: '1.1%', top: '31.6%' },
  L3: { left: '54.8%', top: '30.9%' },
  L4: { left: '67.8%', top: '30.9%' },
  L5: { left: '79.6%', top: '30.9%' },
  P1: { left: '29.0%', top: '61.8%' },
  P2: { left: '42.8%', top: '61.8%' },
  P3: { left: '57.0%', top: '61.4%' },
  P4: { left: '70.0%', top: '61.5%' },
  P5: { left: '82.2%', top: '61.2%' }
};

function parseBookingDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  const normalizedTime = String(timeValue).slice(0, 5);
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  if (String(dateValue).includes('-')) {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  if (String(dateValue).includes('.')) {
    const [day, month, year] = String(dateValue).split('.').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  return null;
}

function serializeBookingMoment(dateValue, timeValue) {
  const bookingDate = parseBookingDateTime(dateValue, timeValue);
  return bookingDate ? bookingDate.toISOString() : null;
}

function readAdminSession(req) {
  const requestToken = req.get('x-admin-token') || req.query.token || '';
  return parseAdminToken(requestToken);
}

function ensureAdmin(req, res, requiredRole = 'host') {
  const admin = readAdminSession(req);

  if (!admin) {
    res.status(401).json({ error: 'Нужна авторизация администратора.' });
    return false;
  }

  if (!roleAllows(admin.role, requiredRole)) {
    res.status(403).json({ error: 'Недостаточно прав для этого действия.' });
    return false;
  }

  req.admin = admin;
  return true;
}

function buildBookingViewModel(tables, bookings) {
  const freeCount = tables.filter(table => table.status === 'available').length;
  const takenCount = tables.length - freeCount;
  const bookingsByTable = bookings.reduce((acc, booking) => {
    if (!booking.table_code) return acc;
    if (!acc[booking.table_code]) acc[booking.table_code] = [];
    acc[booking.table_code].push(booking);
    return acc;
  }, {});

  const enrichedTables = tables.map((table) => {
    const tableBookings = (bookingsByTable[table.code] || [])
      .map((booking) => ({
        booking,
        at: serializeBookingMoment(booking.date, booking.time)
      }))
      .filter((entry) => entry.at)
      .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

    const now = Date.now();
    const nextBooking = tableBookings.find((entry) => new Date(entry.at).getTime() > now);

    return {
      ...table,
      occupied_until: table.status === 'reserved' ? table.reserved_until || null : null,
      next_booking_at: nextBooking?.at || null
    };
  });

  return {
    freeCount,
    takenCount: enrichedTables.filter(table => table.status !== 'available').length,
    layout: BOOKING_LAYOUT,
    tables: enrichedTables,
    bookings,
    bookingsByTable
  };
}

async function sendBookingToAdmin(bot, bookingId, payload) {
  const bookingText = `${buildBookingRequestMessage({
    id: bookingId,
    user_name: payload.name || 'Гость',
    date: payload.date,
    time: payload.time,
    guests: payload.guests,
    comment: payload.comment
  })}\n📞 Телефон: ${payload.phone || '—'}\n🪑 Стол: ${payload.table || 'не выбран'}\nИсточник: сайт`;

  if (adminChatId) {
    await bot.telegram.sendMessage(adminChatId, bookingText, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Подтвердить', callback_data: `booking_confirm_${bookingId}` },
          { text: '❌ Отклонить', callback_data: `booking_reject_${bookingId}` }
        ]]
      }
    });
  }
}

async function buildAdminDashboard() {
  const [menuItems, tables, bookings] = await Promise.all([
    db.getMenuItems(),
    db.getAllTables(),
    db.getAllBookings()
  ]);

  return {
    menuItems,
    tables,
    bookings,
    stats: {
      totalBookings: bookings.length,
      pendingBookings: bookings.filter(item => item.status === 'pending').length,
      confirmedBookings: bookings.filter(item => item.status === 'confirmed').length,
      rejectedBookings: bookings.filter(item => item.status === 'rejected').length,
      occupiedTables: tables.filter(item => item.status === 'reserved').length,
      freeTables: tables.filter(item => item.status === 'available').length
    }
  };
}

async function buildBookingState() {
  const [tables, bookings] = await Promise.all([db.getAllTables(), db.getAllBookings()]);
  return buildBookingViewModel(tables, bookings);
}

function setupWebhook(bot) {
  const app = express();
  app.use(express.json());
  const distDir = path.resolve(__dirname, '../../web/dist');
  const distIndex = path.resolve(distDir, 'index.html');
  const hasBuiltFrontend = fs.existsSync(distIndex);
  const bookingClients = new Set();
  const adminClients = new Set();
  let lastBookingSignature = '';
  let lastDashboardSignature = '';
  let lastAccountsSignature = '';

  if (hasBuiltFrontend) {
    app.use('/assets', express.static(path.resolve(distDir, 'assets')));
  }

  function writeSse(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function broadcastBookingState(force = false) {
    if (!bookingClients.size && !force) return;

    const state = await buildBookingState();
    const signature = JSON.stringify(state);
    if (!force && signature === lastBookingSignature) return;
    lastBookingSignature = signature;
    bookingClients.forEach((client) => writeSse(client, 'booking-state', state));
  }

  async function broadcastAdminDashboard(force = false) {
    if (!adminClients.size && !force) return;

    const dashboard = await buildAdminDashboard();
    const signature = JSON.stringify(dashboard);
    if (!force && signature === lastDashboardSignature) return;
    lastDashboardSignature = signature;
    adminClients.forEach((client) => writeSse(client.res, 'admin-dashboard', dashboard));
  }

  async function broadcastAdminAccounts(force = false) {
    if (!adminClients.size && !force) return;

    const accounts = await db.getAdminAccounts();
    const signature = JSON.stringify(accounts);
    if (!force && signature === lastAccountsSignature) return;
    lastAccountsSignature = signature;
    adminClients.forEach((client) => {
      if (client.role === 'owner') {
        writeSse(client.res, 'admin-accounts', { items: accounts });
      }
    });
  }

  async function broadcastRealtime(force = false) {
    await Promise.allSettled([
      broadcastBookingState(force),
      broadcastAdminDashboard(force),
      broadcastAdminAccounts(force)
    ]);
  }

  setInterval(() => {
    broadcastRealtime(false).catch((error) => {
      console.error('Realtime sync error:', error);
    });
  }, 1000).unref();

  app.get('/api/booking', async (req, res) => {
    try {
      res.json(await buildBookingState());
    } catch (error) {
      console.error('Booking API load error:', error);
      res.status(500).json({ error: 'Не удалось загрузить схему бронирования.' });
    }
  });

  app.get('/api/booking/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    bookingClients.add(res);
    writeSse(res, 'connected', { ok: true });
    try {
      writeSse(res, 'booking-state', await buildBookingState());
    } catch (error) {
      console.error('Initial booking stream payload error:', error);
    }

    req.on('close', () => {
      bookingClients.delete(res);
      res.end();
    });
  });

  app.get('/api/menu', async (req, res) => {
    try {
      const menuItems = await db.getMenuItems();
      res.json({ items: menuItems });
    } catch (error) {
      console.error('Menu API load error:', error);
      res.status(500).json({ error: 'Не удалось загрузить меню.' });
    }
  });

  app.post('/api/bookings', async (req, res) => {
    const { name, phone, date, time, guests, comment, table } = req.body || {};

    try {
      if (table) {
        const conflictingBooking = await db.findConflictingBooking(table, date, time);
        if (conflictingBooking) {
          return res.status(409).json({ error: 'На это время стол уже забронирован. Пожалуйста, выберите другой стол.' });
        }
      }

      const bookingId = await db.saveBooking({
        name: name || null,
        phone: phone || null,
        date: date || null,
        time: time || null,
        guests: guests ? Number(guests) : null,
        comment: comment || null,
        table_code: table || null,
        status: 'pending'
      });

      await db.syncManagedTableReservations();

      await sendBookingToAdmin(bot, bookingId, { name, phone, date, time, guests, comment, table });
      const state = await buildBookingState();
      await broadcastRealtime(true);

      res.status(201).json({
        success: true,
        bookingId,
        message: 'Ваша заявка принята. Мы подтвердим бронь в ближайшее время.',
        state
      });
    } catch (error) {
      console.error('Booking API create error:', error);
      res.status(500).json({ error: 'Не удалось отправить заявку. Попробуйте позже.' });
    }
  });

  app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body || {};

    try {
      const account = await db.authenticateAdmin(String(username || '').trim(), String(password || ''));
      if (!account) {
        return res.status(401).json({ error: 'Неверный логин или пароль.' });
      }

      res.json({
        token: createAdminToken(account),
        admin: account
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Не удалось выполнить вход.' });
    }
  });

  app.get('/api/admin/session', async (req, res) => {
    if (!ensureAdmin(req, res)) return;
    res.json({ admin: req.admin });
  });

  app.get('/api/admin/dashboard', async (req, res) => {
    if (!ensureAdmin(req, res)) return;

    try {
      res.json(await buildAdminDashboard());
    } catch (error) {
      console.error('Admin dashboard load error:', error);
      res.status(500).json({ error: 'Не удалось загрузить админ-панель.' });
    }
  });

  app.patch('/api/admin/bookings/:id', async (req, res) => {
    if (!ensureAdmin(req, res)) return;

    const bookingId = Number(req.params.id);
    const { status } = req.body || {};

    if (!bookingId || !status) {
      return res.status(400).json({ error: 'Нужны id брони и новый статус.' });
    }

    try {
      const booking = await db.getBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({ error: 'Бронь не найдена.' });
      }

      const updatedBooking = await db.updateBooking(bookingId, { status });
      if (booking.table_code && (status === 'rejected' || status === 'cancelled')) {
        await db.updateTableStatus(booking.table_code, 'available');
      }
      await db.syncManagedTableReservations();
      await broadcastRealtime(true);

      res.json({
        success: true,
        booking: updatedBooking,
        dashboard: await buildAdminDashboard()
      });
    } catch (error) {
      console.error('Admin booking update error:', error);
      res.status(500).json({ error: 'Не удалось обновить бронь.' });
    }
  });

  app.patch('/api/admin/tables/:code', async (req, res) => {
    if (!ensureAdmin(req, res)) return;

    const tableCode = String(req.params.code || '').toUpperCase();
    const { status, photo } = req.body || {};

    if (!tableCode || (!status && photo === undefined)) {
      return res.status(400).json({ error: 'Нужны код стола и данные для обновления.' });
    }

    try {
      const table = await db.getTableByCode(tableCode);
      if (!table) {
        return res.status(404).json({ error: 'Стол не найден.' });
      }

      const updatedTable = await db.updateTableDetails(tableCode, {
        ...(status ? { status } : {}),
        ...(photo !== undefined ? { photo: photo ? String(photo).trim() : null } : {})
      });
      await broadcastRealtime(true);
      res.json({
        success: true,
        table: updatedTable,
        dashboard: await buildAdminDashboard()
      });
    } catch (error) {
      console.error('Admin table update error:', error);
      res.status(500).json({ error: 'Не удалось обновить данные стола.' });
    }
  });

  app.post('/api/admin/menu', async (req, res) => {
    if (!ensureAdmin(req, res, 'admin')) return;

    const { name, price, description, photo, category } = req.body || {};
    if (!name || !price) {
      return res.status(400).json({ error: 'Название и цена обязательны.' });
    }

    try {
      const menuItemId = await db.addMenuItem(
        String(name).trim(),
        Number(price),
        description ? String(description).trim() : null,
        photo ? String(photo).trim() : null,
        category ? String(category).trim() : null
      );

      await broadcastRealtime(true);
      res.status(201).json({
        success: true,
        menuItemId,
        dashboard: await buildAdminDashboard()
      });
    } catch (error) {
      console.error('Admin menu create error:', error);
      res.status(500).json({ error: 'Не удалось добавить позицию меню.' });
    }
  });

  app.delete('/api/admin/menu/:id', async (req, res) => {
    if (!ensureAdmin(req, res, 'admin')) return;

    const menuItemId = Number(req.params.id);
    if (!menuItemId) {
      return res.status(400).json({ error: 'Нужен id позиции.' });
    }

    try {
      await db.removeMenuItem(menuItemId);
      await broadcastRealtime(true);
      res.json({
        success: true,
        dashboard: await buildAdminDashboard()
      });
    } catch (error) {
      console.error('Admin menu delete error:', error);
      res.status(500).json({ error: 'Не удалось удалить позицию меню.' });
    }
  });

  app.get('/api/admin/accounts', async (req, res) => {
    if (!ensureAdmin(req, res, 'owner')) return;

    try {
      res.json({ items: await db.getAdminAccounts() });
    } catch (error) {
      console.error('Admin accounts load error:', error);
      res.status(500).json({ error: 'Не удалось загрузить админ-аккаунты.' });
    }
  });

  app.post('/api/admin/accounts', async (req, res) => {
    if (!ensureAdmin(req, res, 'owner')) return;

    const { username, password, role, displayName, telegramId } = req.body || {};
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Логин, пароль и роль обязательны.' });
    }

    try {
      const account = await db.createAdminAccount({
        username: String(username).trim(),
        password: String(password),
        role: String(role),
        display_name: displayName ? String(displayName).trim() : null,
        telegram_id: telegramId ? Number(telegramId) : null
      });

      res.status(201).json({
        success: true,
        account,
        items: await db.getAdminAccounts()
      });
    } catch (error) {
      console.error('Admin account create error:', error);
      res.status(500).json({ error: 'Не удалось создать админ-аккаунт.' });
    }
  });

  app.patch('/api/admin/accounts/:id', async (req, res) => {
    if (!ensureAdmin(req, res, 'owner')) return;

    const accountId = Number(req.params.id);
    const { username, password, role, displayName, telegramId } = req.body || {};

    if (!accountId) {
      return res.status(400).json({ error: 'Нужен id аккаунта.' });
    }

    try {
      const account = await db.updateAdminAccount(accountId, {
        ...(username ? { username: String(username).trim() } : {}),
        ...(password ? { password: String(password) } : {}),
        ...(role ? { role: String(role) } : {}),
        ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName')
          ? { display_name: displayName ? String(displayName).trim() : null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'telegramId')
          ? { telegram_id: telegramId ? Number(telegramId) : null }
          : {})
      });

      res.json({
        success: true,
        account,
        items: await db.getAdminAccounts()
      });
    } catch (error) {
      console.error('Admin account update error:', error);
      res.status(500).json({ error: 'Не удалось обновить админ-аккаунт.' });
    }
  });

  app.get('/api/admin/stream', async (req, res) => {
    if (!ensureAdmin(req, res)) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client = { res, role: req.admin.role };
    adminClients.add(client);
    writeSse(res, 'connected', { ok: true, role: req.admin.role });
    try {
      writeSse(res, 'admin-dashboard', await buildAdminDashboard());
      if (req.admin.role === 'owner') {
        writeSse(res, 'admin-accounts', { items: await db.getAdminAccounts() });
      }
    } catch (error) {
      console.error('Initial admin stream payload error:', error);
    }

    req.on('close', () => {
      adminClients.delete(client);
      res.end();
    });
  });

  app.get('/booking-react', (req, res) => {
    if (!hasBuiltFrontend) {
      return res
        .status(503)
        .type('html')
        .send('<h1>React frontend is not built yet.</h1><p>Run <code>npm run build:web</code> or start <code>npm run dev:web</code>.</p>');
    }

    return res.sendFile(distIndex);
  });

  app.get('/', (req, res) => {
    if (hasBuiltFrontend) {
      return res.sendFile(distIndex);
    }

    const reviewUrl = 'https://yandex.ru/maps/-/CTq6aD2X';

    res.type('html').send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Чердак — лофт-бар и бронь</title>
    <style>
      :root {
        --bg: #090909;
        --surface: #111111;
        --panel: #1e1e1e;
        --light: #ffffff;
        --muted: #b7b7b7;
        --accent: #f2f2f2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Inter", "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #090909 0%, #161616 100%);
        color: var(--light);
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 1040px; margin: 0 auto; padding: 30px 20px 48px; }
      .hero {
        padding: 64px 0 40px;
      }
      .pill {
        display: inline-flex;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.14);
        color: var(--muted);
        letter-spacing: .16em;
        text-transform: uppercase;
        font-size: 12px;
      }
      h1 { font-size: clamp(2.8rem, 4vw, 4.6rem); line-height: 1.05; margin: 24px 0 10px; }
      p { max-width: 650px; color: var(--muted); line-height: 1.8; }
      .cards { display: grid; gap: 20px; margin-top: 36px; }
      .card {
        background: var(--surface);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 24px;
        padding: 30px;
        box-shadow: 0 20px 45px rgba(0,0,0,.28);
      }
      .card h2 { margin-top: 0; }
      .card p { margin: 0; }
      .cta { display: inline-flex; align-items: center; gap: 10px; margin-top: 18px; padding: 14px 20px; background: #ffffff; color: #111; border-radius: 999px; font-weight: 700; }
      .grid-2 { display: grid; gap: 20px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .feature-list { display: grid; gap: 14px; margin-top: 24px; }
      .feature { display: flex; gap: 12px; align-items: flex-start; }
      .feature span { color: #ffffff; font-size: 18px; }
      .feature div { color: var(--muted); }
      @media (max-width: 820px) {
        .grid-2 { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <span class="pill">Лофт Чердак</span>
        <h1>Чердак — стильный лофт, уютные вечера и живая атмосфера.</h1>
        <p>Погрузитесь в черно-белый интерьер, выберите меню и забронируйте место прямо на сайте.</p>
      </section>

      <div class="cards grid-2">
        <div class="card">
          <h2>Меню</h2>
          <p>Полная карта блюд и авторские позиции ждут вас на странице меню.</p>
          <a class="cta" href="/menu">Перейти в меню</a>
        </div>
        <div class="card">
          <h2>Бронирование</h2>
          <p>Забронируйте столик, выберите место и мы подтвердим вашу заявку.</p>
          <a class="cta" href="/booking">Перейти к брони</a>
        </div>
      </div>

      <div class="card" style="margin-top:20px;">
        <h2>Отзывы</h2>
        <p>Оставьте своё мнение на Яндекс Картах.</p>
        <a class="cta" href="${reviewUrl}">Оставить отзыв</a>
      </div>
    </div>
  </body>
</html>`);
  });

  app.get('/menu', async (req, res) => {
    if (hasBuiltFrontend) {
      return res.sendFile(distIndex);
    }

    const reviewUrl = 'https://yandex.ru/maps/-/CTq6aD2X';
    const menuItems = await db.getMenuItems();
    const grouped = {};
    menuItems.forEach(i => {
      const cat = i.category || 'Без категории';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(i);
    });

    const sectionsHtml = Object.keys(grouped).map(cat => {
      const cards = grouped[cat].map(item => {
        const imgHtml = item.photo ? `<div class="card-media"><img src="${item.photo}" alt="${item.name}"/></div>` : '';
        return `
            <div class="card">
              ${imgHtml}
              <div class="card-title"><strong>${item.name}</strong><span>${item.price} ₽</span></div>
              <p class="description">${item.description || ''}</p>
            </div>
        `;
      }).join('');

      return `
        <section class="section">
          <h2>${cat}</h2>
          <div class="cards">
            ${cards}
          </div>
        </section>
      `;
    }).join('\n');

    res.type('html').send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Чердак — меню</title>
    <style>
      :root {
        --bg: #090909;
        --surface: #111111;
        --panel: #1f1f1f;
        --light: #ffffff;
        --muted: #b7b7b7;
        --line: rgba(255,255,255,.12);
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Inter", "Segoe UI", Arial, sans-serif; background: var(--bg); color: var(--light); }
      a { color: inherit; text-decoration: none; }
      .wrap { width: min(100%, 1520px); margin: 0 auto; padding: 24px 24px 40px; }
      .topbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 32px; }
      .topbar a { color: var(--muted); }
      h1 { margin: 0 0 12px; font-size: clamp(2.4rem, 4vw, 3.6rem); }
      .hero { padding: 28px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02)); border: 1px solid var(--line); border-radius: 28px; }
      .hero p { color: var(--muted); max-width: 680px; line-height: 1.8; }
      .sections { display: grid; gap: 24px; margin-top: 30px; }
      .section { display: grid; gap: 18px; }
      .section h2 { margin: 0; }
      .cards { display: grid; gap: 16px; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; padding: 22px; display: grid; gap: 10px; }
      .card-media { width: 100%; display: block; border-radius: 12px; overflow: hidden; }
      .card-media img { width: 100%; height: 220px; object-fit: cover; display: block; }
      .card-title { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
      .card-title strong { font-size: 1.05rem; }
      .card-title span { color: var(--muted); }
      .description { color: var(--muted); }
      .cta { display: inline-flex; align-items: center; gap: 10px; padding: 14px 20px; background: #ffffff; color: #111; border-radius: 999px; font-weight: 700; width: fit-content; margin-top: 16px; }
      @media (max-width: 860px) { .topbar { flex-direction: column; align-items: flex-start; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div>
          <a href="/">← назад</a>
          <h1>Меню Чердака</h1>
        </div>
        <a class="cta" href="/booking">Забронировать стол</a>
      </div>
      <div class="hero">
        <p>В нашем меню собраны авторские закуски, комфортные завтраки и напитки, которые идеально подходят для лофта.</p>
      </div>

      <div class="sections">
        ${sectionsHtml}
      </div>

      <div style="margin-top:38px;">
        <a class="cta" href="${reviewUrl}">Оставить отзыв</a>
      </div>
    </div>
  </body>
</html>`);
  });

  app.get('/booking', async (req, res) => {
    if (!hasBuiltFrontend) {
      return res
        .status(503)
        .type('html')
        .send('<h1>Booking frontend is not built yet.</h1><p>Run <code>npm run build:web</code> or start <code>npm run dev:web</code>.</p>');
    }

    return res.sendFile(distIndex);
  });

  app.post('/booking/open', express.urlencoded({ extended: false }), async (req, res) => {
    // Этот эндпоинт больше недоступен. Открытие стола доступно только администратору через Telegram команду /open_table
    return res.status(403).send('Доступ запрещён. Открыть стол может только администратор через Telegram команду /open_table.');
  });

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
            const rawClient = await fusion.getClientDetails(fusionClientId);
            const fusionClient = fusion.normalizeClient(rawClient);

            const totalSpent = fusionClient ? fusionClient.total_spent : (user.total_spent + amount);
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

  app.get('/admin', (req, res) => {
    if (!hasBuiltFrontend) {
      return res
        .status(503)
        .type('html')
        .send('<h1>Admin frontend is not built yet.</h1><p>Run <code>npm run build:web</code> or start <code>npm run dev:web</code>.</p>');
    }

    return res.sendFile(distIndex);
  });

  return app;
}

module.exports = setupWebhook;
