const express = require('express');
const db = require('./database');
const fusion = require('./fusion-api');
const { calculateStatus } = require('./utils');
require('dotenv').config();

const adminChatId = process.env.ADMIN_CHAT_ID || process.env.ADMIN_TG_ID;

function setupWebhook(bot) {
  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
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
    const reviewUrl = 'https://yandex.ru/maps/-/CTq6aD2X';
    const menuItems = await db.getMenuItems();
    const menuCards = menuItems.map(item => `
            <div class="card">
              <div class="card-title"><strong>${item.name}</strong><span>${item.price} ₽</span></div>
              <p class="description">${item.description}</p>
            </div>
    `).join('');

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
      .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 48px; }
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
        <section class="section">
          <h2>Позиции</h2>
          <div class="cards">
            ${menuCards}
          </div>
        </section>
      </div>

      <div style="margin-top:38px;">
        <a class="cta" href="${reviewUrl}">Оставить отзыв</a>
      </div>
    </div>
  </body>
</html>`);
  });

  app.get('/booking', async (req, res) => {
    const tables = await db.getAllTables();
    const freeCount = tables.filter(table => table.status === 'available').length;
    const takenCount = tables.length - freeCount;
    const layout = {
      P1: { left: '8%', top: '14%' },
      P2: { left: '40%', top: '10%' },
      P3: { left: '72%', top: '18%' },
      P4: { left: '16%', top: '58%' },
      P5: { left: '46%', top: '62%' },
      L1: { left: '78%', top: '58%' }
    };

    const tableCards = tables.map(table => {
      const disabled = table.status !== 'available';
      const pos = layout[table.code] || { left: '0%', top: '0%' };
      const sizeClass = table.seats >= 5 ? 'table-large' : table.seats >= 3 ? 'table-medium' : 'table-small';
      return `
            <label class="table-card ${table.status} ${sizeClass}" style="left:${pos.left}; top:${pos.top};" data-table="${table.code}" data-status="${table.status}" data-seats="${table.seats}" data-label="${table.label}">
              <span class="status-badge">${table.status === 'available' ? 'Свободно' : 'Занято'}</span>
              <span class="label">${table.label}</span>
              <span class="meta">${table.seats} ${table.seats === 1 ? 'место' : table.seats <= 4 ? 'места' : 'мест'}</span>
              <input type="radio" name="tableChoice" value="${table.code}" ${disabled ? 'disabled' : ''} />
            </label>
      `;
    }).join('');

    const bookings = await db.getAllBookings();
    const bookingsByTable = bookings.reduce((acc, booking) => {
      if (!booking.table_code) return acc;
      if (!acc[booking.table_code]) acc[booking.table_code] = [];
      acc[booking.table_code].push(booking);
      return acc;
    }, {});
    const bookingsJson = JSON.stringify(bookingsByTable).replace(/</g, '\\u003c');

    res.type('html').send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Чердак — бронирование</title>
    <style>
      :root {
        --bg: #090909;
        --surface: #111111;
        --panel: #1e1e1e;
        --light: #f5f5f5;
        --muted: #b7b7b7;
        --accent: #ffffff;
        --line: rgba(255,255,255,.12);
        --line-soft: rgba(255,255,255,.08);
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Inter", "Segoe UI", Arial, sans-serif; background: var(--bg); color: var(--light); }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 48px; }
      .topbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 32px; }
      .topbar a { color: var(--muted); }
      h1 { margin: 0 0 12px; font-size: clamp(2.4rem, 4vw, 3.4rem); }
      p { color: var(--muted); line-height: 1.8; max-width: 700px; }
      .grid { display: grid; gap: 24px; }
      .booking-shell { display: grid; grid-template-columns: 1.1fr 360px; gap: 28px; align-items: start; margin-top: 20px; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; padding: 28px; }
      .card h2 { margin-top: 0; }
      .form-grid { display: grid; gap: 16px; }
      .field { display: grid; gap: 8px; }
      label span { display: block; color: var(--muted); font-size: .95rem; }
      input, textarea, select {
        width: 100%;
        border-radius: 16px;
        border: 1px solid var(--line);
        padding: 14px 16px;
        background: #171717;
        color: var(--light);
        outline: none;
        font: inherit;
      }
      textarea { min-height: 120px; resize: vertical; }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 16px 0;
        border-radius: 18px;
        border: none;
        background: var(--accent);
        color: #111;
        font-weight: 700;
        cursor: pointer;
      }
      .map {
        background: linear-gradient(180deg, #111 0%, #161616 100%);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 24px;
      }
      .map-title { margin: 0 0 12px; }
      .status-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
      .status-pill { display: inline-flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 999px; background: #111; border: 1px solid var(--line-soft); font-size: .95rem; }
      .status-pill.available { color: #83e28d; }
      .status-pill.reserved { color: #e25d69; }
      .plan { position: relative; min-height: 500px; border: 1px solid var(--line); border-radius: 28px; background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)); overflow: hidden; }
      .plan::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle at 20% 18%, rgba(255,255,255,.04) 0, transparent 20%), radial-gradient(circle at 75% 25%, rgba(255,255,255,.03) 0, transparent 18%), linear-gradient(90deg, rgba(255,255,255,.02) 0%, transparent 100%);
        pointer-events: none;
      }
      .plan-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .table-card {
        position: absolute;
        width: 120px;
        height: 100px;
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 16px 14px 14px;
        background: rgba(20,20,20,.96);
        display: grid;
        gap: 6px;
        justify-items: center;
        align-content: center;
        text-align: center;
        cursor: pointer;
        transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
      }
      .table-card:hover { transform: translateY(-2px); border-color: #fff; box-shadow: 0 18px 40px rgba(0,0,0,.25); }
      .table-card input { position: absolute; opacity: 0; pointer-events: none; }
      .table-card.available { border-color: #3c9f5b; }
      .table-card.reserved { border-color: #d5565b; background: rgba(31,10,14,.96); opacity: .88; cursor: not-allowed; }
      .table-card.table-medium { width: 130px; height: 100px; }
      .table-card.table-large { width: 150px; height: 110px; }
      .status-badge { position: absolute; top: 12px; right: 12px; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px; border-radius: 999px; background: rgba(0,0,0,.55); }
      .table-card.available .status-badge { color: #83e28d; }
      .table-card.reserved .status-badge { color: #e25d69; }
      .table-card .label { font-size: 1rem; font-weight: 700; }
      .table-card .meta { color: var(--muted); font-size: .9rem; }
      .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; align-items: center; }
      .legend-item { display: inline-flex; width: 14px; height: 14px; border-radius: 999px; }
      .legend-item.available { background: #3c9f5b; }
      .legend-item.reserved { background: #d5565b; }
      .legend span { color: var(--muted); font-size: .95rem; }
      .floor-label { position: absolute; left: 14px; bottom: 14px; color: var(--muted); font-size: .9rem; }
      .sidebar { display: grid; gap: 20px; }
      .sidebar-card { background: #111; border: 1px solid rgba(255,255,255,.08); border-radius: 28px; overflow: hidden; }
      .sidebar-image { min-height: 260px; background: linear-gradient(180deg, #252525 0%, #121212 100%); display: grid; place-items: center; color: #fff; font-size: .95rem; letter-spacing: .18em; text-transform: uppercase; }
      .sidebar-body { padding: 24px; display: grid; gap: 16px; }
      .sidebar-title { margin: 0; font-size: 1.3rem; font-weight: 700; }
      .sidebar-subtitle { color: var(--muted); line-height: 1.5; }
      .sidebar-actions { display: grid; gap: 12px; }
      .sidebar-note { color: var(--muted); font-size: .88rem; line-height: 1.6; }
      .sidebar-info { display: grid; gap: 12px; padding: 18px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 22px; }
      .sidebar-info strong { display: block; font-weight: 700; margin-bottom: 4px; }
      .sidebar-info small { color: var(--muted); }
      .action-button { width: 100%; border-radius: 16px; padding: 16px 18px; border: none; font-weight: 700; cursor: pointer; }
      .action-button.primary { background: #d8395c; color: #fff; }
      .action-button.secondary { background: #2e8f5f; color: #fff; }
      .action-button:disabled { opacity: .45; cursor: not-allowed; }
      .timeline-card { background: #111; border: 1px solid rgba(255,255,255,.08); border-radius: 28px; padding: 24px 26px; margin-bottom: 24px; }
      .timeline-row { display: flex; justify-content: space-between; gap: 16px; color: var(--muted); font-size: .95rem; }
      .timeline-meta { display: flex; align-items: center; gap: 12px; font-size: .86rem; color: #fff; }
      .timeline-meta strong { color: #fff; }
      .timeline-bar { position: relative; margin-top: 22px; height: 84px; border-radius: 24px; background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); overflow: hidden; }
      .timeline-track { position: absolute; inset: 24px; display: flex; justify-content: space-between; align-items: center; }
      .timeline-track span { color: rgba(255,255,255,.45); font-size: .82rem; }
      .timeline-current { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 46px; background: #d8395c; }
      .timeline-label { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,.6); padding: 6px 14px; border-radius: 999px; font-size: .82rem; letter-spacing: .08em; }
      .bookings-panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 22px; padding: 18px; }
      .bookings-panel h3 { margin: 0 0 12px; font-size: 1rem; }
      .booking-list { display: grid; gap: 10px; }
      .booking-item { padding: 14px 16px; background: rgba(255,255,255,.04); border-radius: 18px; border: 1px solid rgba(255,255,255,.08); }
      .booking-item strong { display: block; margin-bottom: 4px; }
      .booking-item small { color: var(--muted); line-height: 1.4; }
      .bar-area, .window-area { position: absolute; border-radius: 18px; color: var(--muted); font-size: .85rem; display: flex; align-items: center; justify-content: center; text-transform: uppercase; letter-spacing: .08em; }
      .bar-area { top: 18px; left: 22%; width: 56%; height: 62px; background: rgba(255,255,255,.04); border: 1px dashed rgba(255,255,255,.08); }
      .window-area { bottom: 18px; left: 8%; width: 36%; height: 44px; background: rgba(255,255,255,.04); border: 1px dashed rgba(255,255,255,.08); }
      .legend-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 20px; }
      .legend-label { display: inline-flex; align-items: center; gap: 8px; }
      .callout { margin: 18px 0 10px; padding: 16px; border-radius: 18px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); color: var(--light); }
      .modal-overlay { display: none; position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.75); align-items: center; justify-content: center; padding: 20px; }
      .modal-overlay.open { display: flex; }
      .modal { width: min(540px, 100%); border-radius: 24px; background: #121212; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 32px 80px rgba(0,0,0,.5); overflow: hidden; }
      .modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 24px 24px 16px; }
      .modal-title { margin: 0 0 8px; font-size: 1.35rem; font-weight: 700; }
      .modal-subtitle { margin: 0; color: var(--muted); font-size: .98rem; line-height: 1.6; }
      .modal-body { padding: 0 24px 24px; display: grid; gap: 14px; }
      .modal-form { display: grid; gap: 14px; }
      .modal input, .modal select, .modal textarea {
        width: 100%; border-radius: 14px; background: #161616; border: 1px solid rgba(255,255,255,.08); padding: 14px 16px; color: var(--light); outline: none;
      }
      .modal textarea { min-height: 100px; resize: vertical; }
      .modal-footer { display: flex; justify-content: flex-end; padding: 0 24px 24px; }
      .modal-submit { width: 100%; padding: 16px 0; border-radius: 16px; border: none; background: #d8395c; color: #fff; font-weight: 700; cursor: pointer; }
      .close-modal { appearance: none; border: none; background: transparent; color: var(--muted); font-size: 1.8rem; cursor: pointer; line-height: 1; }
      .modal-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #83e28d; }
      .modal-status.reserved { color: #e25d69; }
      @media (max-width: 960px) {
        .columns { grid-template-columns: 1fr; }
        .plan { min-height: 420px; }
        .table-card { width: 110px; height: 90px; }
        .table-card.table-medium { width: 120px; }
        .table-card.table-large { width: 135px; }
      }
      @media (max-width: 700px) {
        .wrap { padding: 20px 16px 32px; }
        .map { padding: 20px; }
        .plan { min-height: 360px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div>
          <a href="/">← назад</a>
          <h1>Бронирование</h1>
        </div>
      </div>

      <div class="booking-shell">
        <aside class="sidebar">
          <div class="sidebar-card">
            <div class="sidebar-image">Кальянная зона L2</div>
            <div class="sidebar-body">
              <div class="sidebar-title">Кальянная зона L2</div>
              <div class="sidebar-subtitle" id="sidebar-subtitle">Нет броней</div>
              <div class="sidebar-info">
                <div>
                  <strong id="sidebar-status">Свободно</strong>
                  <small>Текущий статус стола</small>
                </div>
                <div>
                  <strong id="sidebar-bookings-count">0 броней</strong>
                  <small>Сохраненные заявки</small>
                </div>
              </div>
              <div class="sidebar-actions">
                <button type="button" class="action-button primary" id="open-booking-button" disabled>Забронировать</button>
                <form id="open-now-form" action="/booking/open" method="post">
                  <input type="hidden" name="table" id="open-now-table" value="" />
                  <button type="submit" class="action-button secondary" id="open-now-button" disabled>Открыть (если гости)</button>
                </form>
              </div>
              <div class="sidebar-note">Пока открыта форма, гости не смогут забронировать этот стол.</div>
              <div class="bookings-panel">
                <h3>Список броней</h3>
                <div class="booking-list" id="sidebar-booking-list">
                  <div style="color: var(--muted);">Выберите стол, чтобы увидеть бронь.</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <div class="timeline-card">
            <div class="timeline-row">
              <span>Забронировать</span>
              <span>Сегодня</span>
            </div>
            <div class="timeline-meta">
              <span>с <strong>00:50</strong> ч.</span>
              <span>Время работы: 18:00 - 03:00</span>
            </div>
            <div class="timeline-bar">
              <div class="timeline-track">
                <span>18:00</span>
                <span>20:00</span>
                <span>22:00</span>
                <span>00:00</span>
                <span>02:00</span>
              </div>
              <div class="timeline-current"></div>
              <div class="timeline-label">00:50</div>
            </div>
          </div>

          <div class="map card">
            <h2 class="map-title">Схема зала</h2>
            <div class="status-row">
              <span class="status-pill available">Свободно: ${freeCount}</span>
              <span class="status-pill reserved">Занято: ${takenCount}</span>
            </div>
            <div class="plan">
              <div class="bar-area">Бар</div>
              <div class="window-area">Окно</div>
              ${tableCards}
              <div class="floor-label">Схема зала Чердак</div>
            </div>
            <div class="legend-row">
              <span class="legend-label"><span class="legend-item available"></span>Свободный стол</span>
              <span class="legend-label"><span class="legend-item reserved"></span>Занятый стол</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="booking-modal" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div>
            <div class="modal-title" id="modal-title">Бронирование</div>
            <p class="modal-subtitle" id="modal-subtitle">Заполните данные и отправьте бронь.</p>
          </div>
          <button type="button" class="close-modal" id="close-modal">×</button>
        </div>
        <div class="modal-body">
          <div class="modal-status" id="modal-status">Выберите стол</div>
          <form action="/booking" method="post" class="modal-form" id="booking-form">
            <input type="hidden" name="table" id="modal-selected-table" value="" />
            <input name="date" type="date" required placeholder="Дата" />
            <input name="time" type="time" required placeholder="Время" />
            <input name="name" type="text" required placeholder="Имя гостя" />
            <input name="phone" type="tel" required placeholder="Телефон" />
            <select name="guests" required>
              <option value="" disabled selected>Гостей</option>
              <option value="1">1 гость</option>
              <option value="2">2 гостя</option>
              <option value="3">3 гостя</option>
              <option value="4">4 гостя</option>
              <option value="5">5 гостей</option>
              <option value="6">6 гостей</option>
            </select>
            <textarea name="comment" placeholder="Комментарий (необязательно)"></textarea>
            <div class="modal-footer">
              <button type="submit" class="modal-submit">Забронировать</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <script>
      const tableBookings = ${bookingsJson};
      const cards = document.querySelectorAll('.table-card');
      const modal = document.getElementById('booking-modal');
      const closeModal = document.getElementById('close-modal');
      const modalTitle = document.getElementById('modal-title');
      const modalSubtitle = document.getElementById('modal-subtitle');
      const modalStatus = document.getElementById('modal-status');
      const modalSelectedTable = document.getElementById('modal-selected-table');
      const openBookingButton = document.getElementById('open-booking-button');
      const openNowButton = document.getElementById('open-now-button');
      const openNowTableInput = document.getElementById('open-now-table');
      const sidebarSubtitle = document.getElementById('sidebar-subtitle');
      const sidebarStatus = document.getElementById('sidebar-status');
      const sidebarBookingsCount = document.getElementById('sidebar-bookings-count');
      const sidebarBookingList = document.getElementById('sidebar-booking-list');

      function renderSidebar(table, status, label, seats) {
        const bookings = tableBookings[table] || [];
        const seatWord = seats === '1' ? 'место' : seats <= '4' ? 'места' : 'мест';

        selectedTable = table;
        selectedStatus = status;
        selectedLabel = label;
        selectedSeats = seats;

        sidebarSubtitle.textContent = 'Стол ' + label + ', ' + seats + ' ' + seatWord;
        sidebarStatus.textContent = status === 'available' ? 'Свободно' : 'Занят';
        sidebarStatus.style.color = status === 'available' ? '#83e28d' : '#e25d69';
        sidebarBookingsCount.textContent = bookings.length + ' ' + (bookings.length === 1 ? 'бронь' : 'броней');
        openBookingButton.disabled = status !== 'available';
        openNowButton.disabled = status !== 'available';
        openNowTableInput.value = table;

        if (!bookings.length) {
          sidebarBookingList.innerHTML = '<div style="color: var(--muted);">Свободно для бронирования</div>';
          return;
        }

        sidebarBookingList.innerHTML = bookings.slice(0, 4).map(function(booking) {
          return '<div class="booking-item">'
            + '<strong>' + (booking.name || 'Гость') + '</strong>'
            + '<small>' + (booking.date || '') + ' ' + (booking.time || '') + ' · ' + (booking.guests || 0) + ' гостей</small>'
            + '<small>' + (booking.comment || 'Комментариев нет') + '</small>'
            + '</div>';
        }).join('');
      }

      function openBookingModal() {
        if (!selectedTable || selectedStatus !== 'available') return;
        var seatWord = selectedSeats === '1' ? 'место' : selectedSeats <= '4' ? 'места' : 'мест';
        modalSelectedTable.value = selectedTable;
        modalTitle.textContent = 'Стол ' + selectedLabel;
        modalSubtitle.textContent = 'Выбран стол ' + selectedLabel + ', на ' + selectedSeats + ' ' + seatWord;
        modalStatus.textContent = 'Свободно';
        modalStatus.classList.remove('reserved');
        modalStatus.classList.add('available');
        modal.classList.add('open');
      }

      cards.forEach(card => {
        card.addEventListener('click', function(event) {
          event.preventDefault();
          var table = card.dataset.table;
          var status = card.dataset.status;
          var seats = card.dataset.seats;
          var label = card.dataset.label;

          renderSidebar(table, status, label, seats);
        });
      });

      openBookingButton.addEventListener('click', openBookingModal);
      closeModal.addEventListener('click', function() { modal.classList.remove('open'); });
      modal.addEventListener('click', function(event) {
        if (event.target === modal) modal.classList.remove('open');
      });
    </script>

      let selectedTable = null;
      let selectedStatus = null;
      let selectedLabel = null;
      let selectedSeats = null;

      function renderSidebar(table, status, label, seats) {
        const bookings = tableBookings[table] || [];
        const seatWord = seats === '1' ? 'место' : seats <= '4' ? 'места' : 'мест';

        selectedTable = table;
        selectedStatus = status;
        selectedLabel = label;
        selectedSeats = seats;

        sidebarSubtitle.textContent = 'Стол ' + label + ', ' + seats + ' ' + seatWord;
        sidebarStatus.textContent = status === 'available' ? 'Свободно' : 'Занят';
        sidebarStatus.style.color = status === 'available' ? '#83e28d' : '#e25d69';
        sidebarBookingsCount.textContent = bookings.length + ' ' + (bookings.length === 1 ? 'бронь' : 'броней');
        openBookingButton.disabled = status !== 'available';
        openNowButton.disabled = status !== 'available';
        openNowTableInput.value = table;

        if (!bookings.length) {
          sidebarBookingList.innerHTML = '<div style="color: var(--muted);">Свободно для бронирования</div>';
          return;
        }

        sidebarBookingList.innerHTML = bookings.slice(0, 4).map(function(booking) {
          return '<div class="booking-item">'
            + '<strong>' + (booking.name || 'Гость') + '</strong>'
            + '<small>' + (booking.date || '') + ' ' + (booking.time || '') + ' · ' + (booking.guests || 0) + ' гостей</small>'
            + '<small>' + (booking.comment || 'Комментариев нет') + '</small>'
            + '</div>';
        }).join('');
      }

      function openBookingModal() {
        if (!selectedTable || selectedStatus !== 'available') return;
        const seatWord = selectedSeats === '1' ? 'место' : selectedSeats <= '4' ? 'места' : 'мест';
        modalSelectedTable.value = selectedTable;
        modalTitle.textContent = 'Стол ' + selectedLabel;
        modalSubtitle.textContent = 'Выбран стол ' + selectedLabel + ', на ' + selectedSeats + ' ' + seatWord;
        modalStatus.textContent = 'Свободно';
        modalStatus.classList.remove('reserved');
        modalStatus.classList.add('available');
        modal.classList.add('open');
      }

      cards.forEach(card => {
        card.addEventListener('click', event => {
          event.preventDefault();
          const table = card.dataset.table;
          const status = card.dataset.status;
          const seats = card.dataset.seats;
          const label = card.dataset.label;

          renderSidebar(table, status, label, seats);
        });
      });

      openBookingButton.addEventListener('click', openBookingModal);
      closeModal.addEventListener('click', () => modal.classList.remove('open'));
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.classList.remove('open');
      });
    </script>
  </body>
</html>`);
  });

  app.post('/booking', express.urlencoded({ extended: false }), async (req, res) => {
    const { name, phone, date, time, guests, comment, table } = req.body;

    try {
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

      if (table) {
        await db.updateTableStatus(table, 'reserved');
      }

      const bookingText = [
        `📅 Новая бронь с сайта #${bookingId}`,
        `👤 Имя: ${name || '—'}`,
        `📞 Телефон: ${phone || '—'}`,
        `📆 Дата: ${date || '—'}`,
        `🕒 Время: ${time || '—'}`,
        `👥 Гостей: ${guests || '—'}`,
        `🪑 Стол: ${table || 'не выбран'}`,
        `💬 Комментарий: ${comment || '—'}`
      ].join('\n');

      if (adminChatId) {
        await bot.telegram.sendMessage(adminChatId, bookingText);
      }

      res.type('html').send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Заявка принята</title>
    <style>body{font-family:Arial,sans-serif;background:#090909;color:#fff;padding:40px 20px;} .card{max-width:560px;margin:0 auto;background:#111;border-radius:20px;padding:28px;box-shadow:0 20px 45px rgba(0,0,0,.4);} h1{margin-top:0;color:#fff;} p{line-height:1.8;color:#bbb;} a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:14px;background:#fff;color:#111;text-decoration:none;}</style>
  </head>
  <body>
    <div class="card">
      <h1>Спасибо!</h1>
      <p>Ваша заявка на бронь принята. Мы подготовим место и подтвердим бронь в ближайшее время.</p>
      <a href="/booking">Вернуться к карте</a>
    </div>
  </body>
</html>`);
    } catch (error) {
      console.error('Booking form error:', error);
      res.status(500).send('Не удалось отправить заявку. Попробуйте позже.');
    }
  });

  app.post('/booking/open', express.urlencoded({ extended: false }), async (req, res) => {
    const { table } = req.body;

    try {
      const bookingId = await db.saveBooking({
        name: 'Гости на месте',
        phone: '—',
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toTimeString().slice(0, 5),
        guests: 0,
        comment: 'Открыт гостями на месте',
        table_code: table || null,
        status: 'walk-in'
      });

      if (table) {
        await db.updateTableStatus(table, 'reserved');
      }

      if (adminChatId) {
        await bot.telegram.sendMessage(adminChatId, `📌 Стол ${table} открыт гостями (#${bookingId})`);
      }

      res.redirect('/booking');
    } catch (error) {
      console.error('Open now booking error:', error);
      res.status(500).send('Не удалось открыть стол. Попробуйте позже.');
    }
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

  return app;
}

module.exports = setupWebhook;
