import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'users.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT,
    bio TEXT,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  const tableInfo = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = tableInfo.map((col) => col.name);
  const hasExistingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count > 0;

  if (!columnNames.includes('email_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0');
    if (hasExistingUsers) db.exec('UPDATE users SET email_verified = 1');
  }
  if (!columnNames.includes('verification_token')) {
    db.exec('ALTER TABLE users ADD COLUMN verification_token TEXT');
  }
  if (!columnNames.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('school')) {
    db.exec('ALTER TABLE users ADD COLUMN school TEXT');
  }
  if (!columnNames.includes('age')) {
    db.exec('ALTER TABLE users ADD COLUMN age INTEGER');
  }
  if (!columnNames.includes('ip')) {
    db.exec('ALTER TABLE users ADD COLUMN ip TEXT');
  }
  if (!columnNames.includes('banned')) {
    db.exec('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('display_name')) {
    db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
  if (!columnNames.includes('status')) {
    db.exec('ALTER TABLE users ADD COLUMN status TEXT');
  }
  if (!columnNames.includes('location')) {
    db.exec('ALTER TABLE users ADD COLUMN location TEXT');
  }
  if (!columnNames.includes('website')) {
    db.exec('ALTER TABLE users ADD COLUMN website TEXT');
  }
  if (!columnNames.includes('profile_color')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_color TEXT DEFAULT '#4d8dff'");
  }
  if (!columnNames.includes('banner_url')) {
    db.exec('ALTER TABLE users ADD COLUMN banner_url TEXT');
  }
  if (!columnNames.includes('favorite_music')) {
    db.exec("ALTER TABLE users ADD COLUMN favorite_music TEXT DEFAULT '[]'");
  }
  if (!columnNames.includes('profile_public')) {
    db.exec('ALTER TABLE users ADD COLUMN profile_public INTEGER DEFAULT 1');
  }
  if (!columnNames.includes('show_activity')) {
    db.exec('ALTER TABLE users ADD COLUMN show_activity INTEGER DEFAULT 1');
  }
} catch (error) {
  console.error('Migration error:', error);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS changelog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    localstorage_data TEXT,
    theme TEXT DEFAULT 'dark',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(type, target_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    banned_at INTEGER NOT NULL,
    banned_by TEXT
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_ip ON users(ip);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
`);

export default db;