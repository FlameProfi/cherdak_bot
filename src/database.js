const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, 'loyalty.db');
const db = new sqlite3.Database(dbPath);
const TABLE_HOLD_MS = 2 * 60 * 60 * 1000;
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
      reserved_until TEXT
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
    if (cols.includes('reserved_until')) return callback && callback();
    db.run(`ALTER TABLE tables ADD COLUMN reserved_until TEXT;`, [], () => callback && callback());
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

// После сериализации сначала применим миграцию, затем инициализируем дефолты
ensureTableColumns(() => {
  ensureMenuColumns(() => {
    initializeDefaults();
  });
});

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

async function getAllTables() {
  await releaseExpiredTables();
  return await allAsync('SELECT * FROM tables ORDER BY code');
}

async function getTableByCode(code) {
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
  getAllTables,
  getTableByCode,
  updateTableStatus,
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
