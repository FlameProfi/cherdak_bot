const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, 'loyalty.db');
const db = new sqlite3.Database(dbPath);

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
    { code: 'L1', label: 'L1', seats: 2, status: 'available' }
  ];

  const defaultMenuItems = [
    { name: 'Кофе «Чердак»', price: 420, description: 'Темный эспрессо с нотками карамели, подаётся с нежной пенкой.' },
    { name: 'Матча латте', price: 490, description: 'Зелёный чай с молочной текстурой и лёгкой сладостью.' },
    { name: 'Тост с авокадо', price: 590, description: 'Хрустящий хлеб с кремовым авокадо, яйцом пашот и сёмгой.' },
    { name: 'Стейк из лосося', price: 1490, description: 'Лосось на гриле с соусом из зелени и лимонным маслом.' }
  ];

  for (const table of defaultTables) {
    db.run(`INSERT OR IGNORE INTO tables (code, label, seats, status) VALUES (?, ?, ?, ?)`, [table.code, table.label, table.seats, table.status]);
  }

  for (const item of defaultMenuItems) {
    db.run(`INSERT OR IGNORE INTO menu_items (name, price, description) VALUES (?, ?, ?)`, [item.name, item.price, item.description]);
  }
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
      status TEXT DEFAULT 'available'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      price REAL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  initializeDefaults();
});

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
  return await allAsync('SELECT * FROM tables ORDER BY code');
}

async function getTableByCode(code) {
  return await getAsync('SELECT * FROM tables WHERE code = ?', [code]);
}

async function updateTableStatus(code, status) {
  await runAsync('UPDATE tables SET status = ? WHERE code = ?', [status, code]);
  return getTableByCode(code);
}

async function getMenuItems() {
  return await allAsync('SELECT * FROM menu_items ORDER BY created_at ASC');
}

async function addMenuItem(name, price, description) {
  const result = await runAsync('INSERT INTO menu_items (name, price, description) VALUES (?, ?, ?)', [name, price, description]);
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

module.exports = {
  getUserByTgId,
  getUserByFusionId,
  saveUser,
  getAllUsers,
  getAllTables,
  getTableByCode,
  updateTableStatus,
  getMenuItems,
  addMenuItem,
  removeMenuItem,
  getAllBookings,
  getBookingsByStatus,
  getBookingById,
  saveBooking,
  updateBooking
};
