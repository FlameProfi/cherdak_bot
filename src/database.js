const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/loyalty.db');
const db = new Database(dbPath);

// Initialize schema (Добавили referred_by и is_ref_rewarded)
db.exec(`
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

// Миграция на случай, если таблица уже создана у вас на компьютере без этих колонок
try {
  db.exec(`ALTER TABLE users ADD COLUMN referred_by INTEGER`);
} catch (e) { /* Колонка уже существует */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN is_ref_rewarded INTEGER DEFAULT 0`);
} catch (e) { /* Колонка уже существует */ }


function getUserByTgId(tgId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
}

function getUserByFusionId(fusionId) {
  return db.prepare('SELECT * FROM users WHERE fusion_client_id = ?').get(fusionId);
}

function saveUser(user) {
  const { 
    telegram_id, 
    fusion_client_id, 
    phone, 
    full_name, 
    total_spent, 
    current_level,
    referred_by = null,      // значение по умолчанию, если поля нет
    is_ref_rewarded = 0      // значение по умолчанию, если поля нет
  } = user;

  return db.prepare(`
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
  `).run(telegram_id, fusion_client_id, phone, full_name, total_spent, current_level, referred_by, is_ref_rewarded);
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users').all();
}

module.exports = {
  getUserByTgId,
  getUserByFusionId,
  saveUser,
  getAllUsers
};