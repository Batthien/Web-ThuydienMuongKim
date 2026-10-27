const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const config = require('./config');
const seed = require('./seed');

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, 'site.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'company',
  title_vi TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '',
  excerpt_vi TEXT NOT NULL DEFAULT '', excerpt_en TEXT NOT NULL DEFAULT '',
  body_vi TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  title_vi TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  year INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_vi TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '',
  location_vi TEXT NOT NULL DEFAULT '', location_en TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  deadline TEXT NOT NULL DEFAULT '',
  summary_vi TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '',
  body_vi TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'contact',
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  attachment TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_cat ON documents(category, year DESC);
`);

// ---- Settings (cấu hình chỉnh được trong CMS) ----
const getSettingsStmt = db.prepare('SELECT key, value FROM settings');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
let settingsCache = null;

function getSettings() {
  if (!settingsCache) {
    settingsCache = { ...seed.settings };
    for (const row of getSettingsStmt.all()) settingsCache[row.key] = row.value;
  }
  return settingsCache;
}

function saveSettings(values) {
  db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(values)) setSettingStmt.run(k, String(v ?? ''));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  settingsCache = null;
}

// ---- Khởi tạo lần đầu ----
function bootstrap() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0) {
    let password = config.admin.password;
    if (!password) {
      password = crypto.randomBytes(9).toString('base64url');
      console.log('\n================ TÀI KHOẢN QUẢN TRỊ ================');
      console.log(`  Tên đăng nhập: ${config.admin.username}`);
      console.log(`  Mật khẩu:      ${password}`);
      console.log('  Hãy đăng nhập /admin và đổi mật khẩu ngay.');
      console.log('====================================================\n');
    }
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(config.admin.username, bcrypt.hashSync(password, 12));
  }

  const postCount = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
  if (postCount === 0) {
    const ins = db.prepare(`INSERT INTO posts
      (slug, category, title_vi, title_en, excerpt_vi, excerpt_en, body_vi, body_en, cover, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of seed.posts) {
      ins.run(p.slug, p.category, p.title_vi, p.title_en, p.excerpt_vi, p.excerpt_en, p.body_vi, p.body_en, p.cover, p.status || 'published', p.published_at);
    }
  }

  const jobCount = db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
  if (jobCount === 0) {
    const ins = db.prepare(`INSERT INTO jobs
      (slug, title_vi, title_en, location_vi, location_en, quantity, deadline, summary_vi, summary_en, body_vi, body_en, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`);
    for (const j of seed.jobs) {
      ins.run(j.slug, j.title_vi, j.title_en, j.location_vi, j.location_en, j.quantity, j.deadline, j.summary_vi, j.summary_en, j.body_vi, j.body_en);
    }
  }
}
bootstrap();

module.exports = { db, getSettings, saveSettings };
