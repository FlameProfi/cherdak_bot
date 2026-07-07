const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { hashPassword, verifyPassword } = require('./auth');

const dbDir = path.resolve(__dirname, '../../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, 'loyalty.db');
const db = new sqlite3.Database(dbPath);
const TABLE_HOLD_MS = 2 * 60 * 60 * 1000;
const BOOKING_LOCK_LEAD_MS = 60 * 60 * 1000;
// const TABLE_HOLD_MS = 60;


function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function parseBookingDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  const normalizedTime = String(timeValue).slice(0, 5);
  const [hours, minutes] = normalizedTime.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  if (String(dateValue).includes('-')) {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  if (String(dateValue).includes('.')) {
    const [day, month, year] = String(dateValue).split('.').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  return null;
}

function getBookingWindow(booking) {
  const start = parseBookingDateTime(booking.date, booking.time);
  if (!start) return null;

  const startMs = start.getTime();
  return {
    startMs,
    lockAtMs: startMs - BOOKING_LOCK_LEAD_MS,
    endMs: startMs + TABLE_HOLD_MS
  };
}

function isBookingManagedStatus(status) {
  return ['pending', 'confirmed', 'walk-in'].includes(status);
}

function windowsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function initializeDefaults() {
  const defaultTables = [
    { code: 'P1', label: 'P1', seats: 3, status: 'available' },
    { code: 'P2', label: 'P2', seats: 4, status: 'available' },
    { code: 'P3', label: 'P3', seats: 6, status: 'reserved' },
    { code: 'P4', label: 'P4', seats: 4, status: 'available' },
    { code: 'P5', label: 'P5', seats: 6, status: 'available' },
    { code: 'L1', label: 'L1', seats: 2, status: 'available' },
    { code: 'L2', label: 'L2', seats: 2, status: 'available' },
    { code: 'L3', label: 'L3', seats: 4, status: 'available' },
    { code: 'L4', label: 'L4', seats: 4, status: 'available' },
    { code: 'L5', label: 'L5', seats: 4, status: 'available' }
  ];

  const defaultMenuItems = [
    { name: 'Кофе «Чердак»', price: 420, description: 'Темный эспрессо с нотками карамели, подаётся с нежной пенкой.', photo: null, category: 'Напитки' },
    { name: 'Матча латте', price: 490, description: 'Зелёный чай с молочной текстурой и лёгкой сладостью.', photo: null, category: 'Напитки' },
    { name: 'Тост с авокадо', price: 590, description: 'Хрустящий хлеб с кремовым авокадо, яйцом пашот и сёмгой.', photo: null, category: 'Закуски' },
    { name: 'Стейк из лосося', price: 1490, description: 'Лосось на гриле с соусом из зелени и лимонным маслом.', photo: null, category: 'Основные' }
  ];

  for (const table of defaultTables) {
    db.run(`INSERT OR IGNORE INTO tables (code, label, seats, status) VALUES (?, ?, ?, ?)`, [table.code, table.label, table.seats, table.status]);
  }

  const defaultAdminUsername = process.env.ADMIN_USERNAME || 'owner';
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'cherdak123';
  const defaultAdminRole = process.env.ADMIN_ROLE || 'owner';
  const defaultAdminName = process.env.ADMIN_DISPLAY_NAME || 'Основатель';
  const defaultAdminPasswordHash = hashPassword(defaultAdminPassword);

  db.serialize(() => {
    db.run(
      `INSERT OR IGNORE INTO admin_accounts (username, password_hash, role, display_name, telegram_id)
        VALUES (?, ?, ?, ?, ?)`,
      [
        defaultAdminUsername,
        defaultAdminPasswordHash,
        defaultAdminRole,
        defaultAdminName,
        process.env.ADMIN_TG_ID || null
      ]
    );

    db.get(
      `SELECT id, password_hash, telegram_id FROM admin_accounts WHERE username = ?`,
      [defaultAdminUsername],
      (err, row) => {
        if (err || !row) return;

        if (!row.password_hash || !String(row.password_hash).includes(':')) {
          db.run(
            `UPDATE admin_accounts
              SET password_hash = ?, role = COALESCE(role, ?), display_name = COALESCE(display_name, ?), telegram_id = COALESCE(telegram_id, ?)
              WHERE id = ?`,
            [defaultAdminPasswordHash, defaultAdminRole, defaultAdminName, process.env.ADMIN_TG_ID || null, row.id]
          );
        } else if (!row.telegram_id && process.env.ADMIN_TG_ID) {
          db.run(`UPDATE admin_accounts SET telegram_id = ? WHERE id = ?`, [process.env.ADMIN_TG_ID, row.id]);
        }
      }
    );
  });

  // Проверим, какие колонки доступны в таблице menu_items и вставим соответствующие поля
  db.all(`PRAGMA table_info(menu_items);`, [], (err, cols) => {
    const colNames = (cols || []).map(c => c.name);
    const usePhoto = colNames.includes('photo');
    const useCategory = colNames.includes('category');

    for (const item of defaultMenuItems) {
      const fields = ['name', 'price', 'description'];
      const placeholders = ['?', '?', '?'];
      const params = [item.name, item.price, item.description];
      if (usePhoto) {
        fields.push('photo'); placeholders.push('?'); params.push(item.photo);
      }
      if (useCategory) {
        fields.push('category'); placeholders.push('?'); params.push(item.category);
      }
      const sql = `INSERT OR IGNORE INTO menu_items (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
      db.run(sql, params);
    }
  });
}

// Инициализация схемы

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      fusion_client_id INTEGER,
      phone TEXT,
      full_name TEXT,
      total_spent REAL DEFAULT 0,
      current_level TEXT DEFAULT 'Новичок',
      referred_by INTEGER,
      is_ref_rewarded INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER,
      name TEXT,
      phone TEXT,
      date TEXT,
      time TEXT,
      guests INTEGER,
      table_code TEXT,
      comment TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      code TEXT PRIMARY KEY,
      label TEXT,
      seats INTEGER,
      status TEXT DEFAULT 'available',
      reserved_until TEXT,
      photo TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      price REAL,
      description TEXT,
      photo TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'host',
      display_name TEXT,
      telegram_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // После очереди создания таблиц ставим пустой запрос с колбэком,
  // чтобы гарантированно выполнить миграцию колонок и инициализацию дефолтов
  db.run('SELECT 1', [], () => {
    ensureTableColumns(() => {
      ensureMenuColumns(() => {
        initializeDefaults();
      });
    });
  });
});

function ensureTableColumns(callback) {
  db.all(`PRAGMA table_info(tables);`, [], (err, rows) => {
    if (err || !rows) return callback && callback();
    const cols = rows.map(r => r.name);
    const tasks = [];
    if (!cols.includes('reserved_until')) {
      tasks.push(cb => db.run(`ALTER TABLE tables ADD COLUMN reserved_until TEXT;`, [], cb));
    }
    if (!cols.includes('photo')) {
      tasks.push(cb => db.run(`ALTER TABLE tables ADD COLUMN photo TEXT;`, [], cb));
    }
    if (!tasks.length) return callback && callback();
    let i = 0;
    const next = (er) => {
      if (er) return callback && callback();
      if (i >= tasks.length) return callback && callback();
      tasks[i++](next);
    };
    next();
  });
}

function ensureTableColumnsAsync() {
  return new Promise(resolve => ensureTableColumns(resolve));
}

// Миграция: добавляем колонки photo и category, если их нет (для существующих БД)
function ensureMenuColumns(callback) {
  db.all(`PRAGMA table_info(menu_items);`, [], (err, rows) => {
    if (err || !rows) return callback && callback();
    const cols = rows.map(r => r.name);
    const tasks = [];
    if (!cols.includes('photo')) {
      tasks.push(cb => db.run(`ALTER TABLE menu_items ADD COLUMN photo TEXT;`, cb));
    }
    if (!cols.includes('category')) {
      tasks.push(cb => db.run(`ALTER TABLE menu_items ADD COLUMN category TEXT;`, cb));
    }
    if (!tasks.length) return callback && callback();
    // Выполняем задачи по очереди
    let i = 0;
    const next = (er) => { if (er) return callback && callback(); if (i >= tasks.length) return callback && callback(); tasks[i++](next); };
    next();
  });
}

function ensureAdminAccountColumns(callback) {
  db.all(`PRAGMA table_info(admin_accounts);`, [], (err, rows) => {
    if (err || !rows) return callback && callback();
    const cols = rows.map(r => r.name);
    if (cols.includes('telegram_id')) return callback && callback();
    db.run(`ALTER TABLE admin_accounts ADD COLUMN telegram_id INTEGER;`, [], () => callback && callback());
  });
}

// Присвоить фото и категории существующим позициям, если они пусты
function applyDefaultPhotosAndCategories() {
  const mapping = [
    { name: 'Кофе «Чердак»', photo: 'https://picsum.photos/seed/coffee/800/600', category: 'Напитки' },
    { name: 'Матча латте', photo: 'https://picsum.photos/seed/matcha/800/600', category: 'Напитки' },
    { name: 'Тост с авокадо', photo: 'https://picsum.photos/seed/avocado/800/600', category: 'Закуски' },
    { name: 'Стейк из лосося', photo: 'https://picsum.photos/seed/salmon/800/600', category: 'Основные' }
  ];

  mapping.forEach(m => {
    db.run(`UPDATE menu_items SET photo = COALESCE(photo, ?), category = COALESCE(category, ?) WHERE name = ?`, [m.photo, m.category, m.name]);
  });
}

// Выполняем после инициализации
applyDefaultPhotosAndCategories();

let usersCache = [];

function refreshCache() {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (!err && rows) {
      usersCache = rows;
    }
  });
}

refreshCache();

function getUserByTgId(tgId) {
  return usersCache.find(u => u.telegram_id === Number(tgId)) || null;
}

function getUserByFusionId(fusionId) {
  return usersCache.find(u => u.fusion_client_id === Number(fusionId)) || null;
}

function saveUser(user) {
  const {
    telegram_id,
    fusion_client_id,
    phone,
    full_name,
    total_spent,
    current_level,
    referred_by = null,
    is_ref_rewarded = 0
  } = user;

  db.serialize(() => {
    db.run(`
      INSERT INTO users (telegram_id, fusion_client_id, phone, full_name, total_spent, current_level, referred_by, is_ref_rewarded, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        fusion_client_id = excluded.fusion_client_id,
        phone = excluded.phone,
        full_name = excluded.full_name,
        total_spent = excluded.total_spent,
        current_level = excluded.current_level,
        referred_by = excluded.referred_by,
        is_ref_rewarded = excluded.is_ref_rewarded,
        last_updated = CURRENT_TIMESTAMP
    `, [telegram_id, fusion_client_id, phone, full_name, total_spent, current_level, referred_by, is_ref_rewarded], () => {
      refreshCache();
    });
  });
}

function getAllUsers() {
  return usersCache;
}

async function getAdminAccounts() {
  return await allAsync(
    'SELECT id, username, role, display_name, telegram_id, created_at FROM admin_accounts ORDER BY created_at ASC'
  );
}

async function getAdminAccountByUsername(username) {
  return await getAsync('SELECT * FROM admin_accounts WHERE username = ?', [username]);
}

async function getAdminAccountById(id) {
  return await getAsync(
    'SELECT id, username, role, display_name, telegram_id, created_at FROM admin_accounts WHERE id = ?',
    [id]
  );
}

async function getAdminAccountByTelegramId(telegramId) {
  return await getAsync(
    'SELECT id, username, role, display_name, telegram_id, created_at FROM admin_accounts WHERE telegram_id = ?',
    [telegramId]
  );
}

async function createAdminAccount({ username, password, role, display_name, telegram_id = null }) {
  const result = await runAsync(
    `INSERT INTO admin_accounts (username, password_hash, role, display_name, telegram_id)
      VALUES (?, ?, ?, ?, ?)`,
    [username, hashPassword(password), role, display_name || null, telegram_id]
  );

  return getAdminAccountById(result.lastID);
}

async function updateAdminAccount(id, fields) {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(fields, 'username')) {
    updates.push('username = ?');
    params.push(fields.username);
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'role')) {
    updates.push('role = ?');
    params.push(fields.role);
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'display_name')) {
    updates.push('display_name = ?');
    params.push(fields.display_name);
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'telegram_id')) {
    updates.push('telegram_id = ?');
    params.push(fields.telegram_id);
  }

  if (fields.password) {
    updates.push('password_hash = ?');
    params.push(hashPassword(fields.password));
  }

  if (!updates.length) return getAdminAccountById(id);

  params.push(id);
  await runAsync(`UPDATE admin_accounts SET ${updates.join(', ')} WHERE id = ?`, params);
  return getAdminAccountById(id);
}

async function authenticateAdmin(username, password) {
  const account = await getAdminAccountByUsername(username);
  if (!account) return null;
  if (!verifyPassword(password, account.password_hash)) return null;
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    display_name: account.display_name,
    telegram_id: account.telegram_id,
    created_at: account.created_at
  };
}

async function getAllTables() {
  await syncManagedTableReservations();
  await releaseExpiredTables();
  return await allAsync('SELECT * FROM tables ORDER BY code');
}

async function getTableByCode(code) {
  await syncManagedTableReservations();
  await releaseExpiredTables();
  return await getAsync('SELECT * FROM tables WHERE code = ?', [code]);
}

async function updateTableStatus(code, status, options = {}) {
  const reservedUntil = status === 'reserved'
    ? options.reservedUntil || new Date(Date.now() + TABLE_HOLD_MS).toISOString()
    : null;
  await runAsync('UPDATE tables SET status = ?, reserved_until = ? WHERE code = ?', [status, reservedUntil, code]);
  return getTableByCode(code);
}

async function updateTableDetails(code, payload = {}) {
  const fields = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const reservedUntil = payload.status === 'reserved'
      ? payload.reservedUntil || new Date(Date.now() + TABLE_HOLD_MS).toISOString()
      : null;
    fields.push('status = ?', 'reserved_until = ?');
    params.push(payload.status, reservedUntil);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'photo')) {
    fields.push('photo = ?');
    params.push(payload.photo || null);
  }

  if (!fields.length) {
    return getTableByCode(code);
  }

  params.push(code);
  await runAsync(`UPDATE tables SET ${fields.join(', ')} WHERE code = ?`, params);
  return getTableByCode(code);
}

async function findConflictingBooking(tableCode, date, time, excludeBookingId = null) {
  const requestedWindow = getBookingWindow({ date, time });
  if (!requestedWindow) return null;

  const table = await getAsync('SELECT * FROM tables WHERE code = ?', [tableCode]);
  if (
    table &&
    table.status === 'reserved' &&
    table.reserved_until &&
    windowsOverlap(requestedWindow.startMs, requestedWindow.endMs, Date.now(), new Date(table.reserved_until).getTime())
  ) {
    return {
      id: 0,
      table_code: tableCode,
      date,
      time,
      status: 'reserved'
    };
  }

  const bookings = await allAsync(
    `SELECT * FROM bookings
      WHERE table_code = ?
        AND status IN ('pending', 'confirmed', 'walk-in')
        ${excludeBookingId ? 'AND id != ?' : ''}
      ORDER BY created_at DESC`,
    excludeBookingId ? [tableCode, excludeBookingId] : [tableCode]
  );

  return (
    bookings.find((booking) => {
      const bookingWindow = getBookingWindow(booking);
      if (!bookingWindow) return false;
      return windowsOverlap(
        requestedWindow.startMs,
        requestedWindow.endMs,
        bookingWindow.startMs,
        bookingWindow.endMs
      );
    }) || null
  );
}

async function syncManagedTableReservations() {
  const now = Date.now();
  const [tables, bookings] = await Promise.all([
    allAsync('SELECT * FROM tables ORDER BY code'),
    allAsync(`SELECT * FROM bookings WHERE table_code IS NOT NULL AND status IN ('pending', 'confirmed', 'walk-in')`)
  ]);

  for (const table of tables) {
    const tableBookings = bookings
      .filter((booking) => booking.table_code === table.code && isBookingManagedStatus(booking.status))
      .map((booking) => ({ booking, window: getBookingWindow(booking) }))
      .filter((entry) => entry.window);

    const activeBooking = tableBookings.find(({ window }) => (
      now >= window.lockAtMs && now < window.endMs
    ));

    if (activeBooking) {
      const desiredUntil = new Date(activeBooking.window.endMs).toISOString();
      if (table.status !== 'reserved' || table.reserved_until !== desiredUntil) {
        await runAsync(
          'UPDATE tables SET status = ?, reserved_until = ? WHERE code = ?',
          ['reserved', desiredUntil, table.code]
        );
        table.status = 'reserved';
        table.reserved_until = desiredUntil;
      }
      continue;
    }

    const futureBooking = tableBookings
      .filter(({ window }) => now < window.lockAtMs)
      .sort((left, right) => left.window.startMs - right.window.startMs)[0];

    if (
      futureBooking &&
      table.status === 'reserved' &&
      table.reserved_until &&
      new Date(table.reserved_until).getTime() > now
    ) {
      await runAsync(
        'UPDATE tables SET status = ?, reserved_until = ? WHERE code = ?',
        ['available', null, table.code]
      );
      table.status = 'available';
      table.reserved_until = null;
      continue;
    }

    if (table.status === 'reserved' && (!table.reserved_until || new Date(table.reserved_until).getTime() <= now)) {
      await runAsync(
        'UPDATE tables SET status = ?, reserved_until = ? WHERE code = ?',
        ['available', null, table.code]
      );
      table.status = 'available';
      table.reserved_until = null;
    }
  }
}

async function releaseExpiredTables() {
  await ensureReservedTablesHaveExpiry();

  const sql = `UPDATE tables
    SET status = 'available', reserved_until = NULL
    WHERE status = 'reserved'
      AND reserved_until IS NOT NULL
      AND datetime(reserved_until) <= datetime('now')`;

  try {
    await runAsync(sql);
  } catch (err) {
    if (err && err.code === 'SQLITE_ERROR' && /reserved_until/.test(err.message || '')) {
      await ensureTableColumnsAsync();
      await runAsync(sql);
      return;
    }
    throw err;
  }
}

async function ensureReservedTablesHaveExpiry() {
  const reservedUntil = new Date(Date.now() + TABLE_HOLD_MS).toISOString();

  try {
    await runAsync(
      `UPDATE tables
        SET reserved_until = ?
        WHERE status = 'reserved'
          AND reserved_until IS NULL`,
      [reservedUntil]
    );
  } catch (err) {
    if (err && err.code === 'SQLITE_ERROR' && /reserved_until/.test(err.message || '')) {
      await ensureTableColumnsAsync();
      await runAsync(
        `UPDATE tables
          SET reserved_until = ?
          WHERE status = 'reserved'
            AND reserved_until IS NULL`,
        [reservedUntil]
      );
      return;
    }
    throw err;
  }
}

async function getMenuItems() {
  return await allAsync('SELECT * FROM menu_items ORDER BY created_at ASC');
}

async function addMenuItem(name, price, description, photo = null, category = null) {
  const result = await runAsync('INSERT INTO menu_items (name, price, description, photo, category) VALUES (?, ?, ?, ?, ?)', [name, price, description, photo, category]);
  return result.lastID;
}

async function removeMenuItem(id) {
  await runAsync('DELETE FROM menu_items WHERE id = ?', [id]);
}

async function getAllBookings() {
  return await allAsync('SELECT * FROM bookings ORDER BY created_at DESC');
}

async function getBookingsByStatus(status) {
  return await allAsync('SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC', [status]);
}

async function getBookingsByTable(tableCode) {
  return await allAsync('SELECT * FROM bookings WHERE table_code = ? ORDER BY date ASC, time ASC', [tableCode]);
}

async function getBookingById(id) {
  return await getAsync('SELECT * FROM bookings WHERE id = ?', [id]);
}

async function saveBooking(booking) {
  const result = await runAsync(
    `INSERT INTO bookings (telegram_id, name, phone, date, time, guests, table_code, comment, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [booking.telegram_id || null, booking.name || null, booking.phone || null, booking.date || null, booking.time || null, booking.guests || null, booking.table_code || null, booking.comment || null, booking.status || 'pending']
  );
  return result.lastID;
}

async function updateBooking(id, fields) {
  const updates = [];
  const params = [];
  for (const [key, value] of Object.entries(fields)) {
    updates.push(`${key} = ?`);
    params.push(value);
  }
  if (!updates.length) return null;
  params.push(id);
  await runAsync(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`, params);
  return getBookingById(id);
}

setInterval(() => {
  releaseExpiredTables().catch(err => {
    console.error('Release expired tables error:', err);
  });
}, 60 * 1000).unref();

releaseExpiredTables().catch(err => {
  console.error('Initial release expired tables error:', err);
});

module.exports = {
  getUserByTgId,
  getUserByFusionId,
  saveUser,
  getAllUsers,
  getAdminAccounts,
  getAdminAccountByTelegramId,
  getAdminAccountByUsername,
  createAdminAccount,
  updateAdminAccount,
  authenticateAdmin,
  getAllTables,
  getTableByCode,
  updateTableStatus,
  updateTableDetails,
  findConflictingBooking,
  syncManagedTableReservations,
  releaseExpiredTables,
  getMenuItems,
  addMenuItem,
  removeMenuItem,
  getAllBookings,
  getBookingsByStatus,
  getBookingById,
  saveBooking,
  updateBooking
};
