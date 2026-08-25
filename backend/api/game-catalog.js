import db from '../db.js';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';
import { sanitizeGameId } from './game-stats.js';

const MAX_LABEL = 120;
const MAX_URL = 800;
const MAX_IMAGE = 400;
const MAX_CATEGORIES = 8;
const MAX_GLOBAL_GAMES = 200;

export const adminGamesLimiter = rateLimit({
  windowMs: 60000,
  max: 40,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin game actions' },
});

function requireAdmin(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  if (!row) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = row.is_admin || 0;
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(req.session.user.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { id: req.session.user.id, is_admin: Math.max(level, owner ? 3 : level), is_owner: owner };
}

function sanitizeLabel(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_LABEL).replace(/[\u0000-\u001f<>]/g, '');
}

function sanitizeGameUrl(raw) {
  if (typeof raw !== 'string') return null;
  let url = raw.trim().slice(0, MAX_URL);
  if (!url) return null;
  if (
    (url.startsWith('/storage/') || url.startsWith('/!!/') || url.startsWith('/n/m/') || url.startsWith('/f/g/') || url.startsWith('/iframe.html')) &&
    !url.includes('..') &&
    !/[\s<>"'`]/.test(url)
  ) {
    return url;
  }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(host)) return null;
    if (host.endsWith('.local') || host.endsWith('.internal')) return null;
    return parsed.toString().slice(0, MAX_URL);
  } catch {
    return null;
  }
}

function sanitizeImageUrl(raw) {
  if (typeof raw !== 'string') return '';
  const url = raw.trim().slice(0, MAX_IMAGE);
  if (!url) return '';
  if (url.startsWith('data:image/')) {
    if (url.length > 120_000) return '';
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url)) return '';
    return url.slice(0, 120_000);
  }
  if ((url.startsWith('/storage/') || url.startsWith('/!!/') || url.startsWith('/n/m/') || url.startsWith('/f/g/') || url.startsWith('/f/c/')) && !url.includes('..') && !/[\s<>"'`]/.test(url)) {
    return url;
  }
  if (/^https:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return '';
      if (parsed.username || parsed.password) return '';
      return parsed.toString().slice(0, MAX_IMAGE);
    } catch {
      return '';
    }
  }
  return '';
}

function sanitizeCategories(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => typeof c === 'string')
    .map((c) => c.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_CATEGORIES);
}

export function ensureGameCatalogTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_exclusions (
      game_id TEXT PRIMARY KEY,
      label TEXT,
      image_url TEXT,
      excluded_at INTEGER NOT NULL,
      excluded_by TEXT
    );

    CREATE TABLE IF NOT EXISTS game_global_adds (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      categories TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS game_overrides (
      game_id TEXT PRIMARY KEY,
      label TEXT,
      url TEXT,
      image_url TEXT,
      categories TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_game_exclusions_at ON game_exclusions(excluded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_game_global_adds_at ON game_global_adds(created_at DESC);
  `);
}

ensureGameCatalogTables();

export function getGamesCatalogHandler(req, res) {
  try {
    const exclusions = db
      .prepare('SELECT game_id as gameId FROM game_exclusions')
      .all()
      .map((r) => r.gameId);
    const globals = db
      .prepare(
        `SELECT id, label, url, image_url as imageUrl, categories, created_at as createdAt
         FROM game_global_adds ORDER BY created_at DESC LIMIT ?`
      )
      .all(MAX_GLOBAL_GAMES)
      .map((g) => {
        let categories = [];
        try {
          categories = JSON.parse(g.categories || '[]');
        } catch {
          categories = [];
        }
        if (!Array.isArray(categories)) categories = [];
        return {
          id: g.id,
          label: g.label,
          url: g.url,
          imageUrl: g.imageUrl || '',
          categories,
          isCustom: false,
          isGlobal: true,
        };
      });
    const overrides = db
      .prepare(
        `SELECT game_id as gameId, label, url, image_url as imageUrl, categories
         FROM game_overrides`
      )
      .all()
      .map((g) => {
        let categories = [];
        try {
          categories = JSON.parse(g.categories || '[]');
        } catch {
          categories = [];
        }
        if (!Array.isArray(categories)) categories = [];
        return {
          gameId: g.gameId,
          label: g.label || '',
          url: g.url || '',
          imageUrl: g.imageUrl || '',
          categories,
        };
      });
    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.json({ exclusions, globals, overrides });
  } catch (e) {
    console.error('games catalog error', e);
    return res.status(500).json({ error: 'Failed to load catalog' });
  }
}

export function getAdminExcludedGamesHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db
    .prepare(
      `SELECT game_id as gameId, label, image_url as imageUrl, excluded_at as excludedAt, excluded_by as excludedBy
       FROM game_exclusions ORDER BY excluded_at DESC LIMIT 500`
    )
    .all();
  return res.json({ excluded: rows });
}

export function adminExcludeGameHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const gameId = sanitizeGameId(req.body?.gameId);
  if (!gameId) return res.status(400).json({ error: 'Invalid game id' });

  const label = sanitizeLabel(req.body?.label) || gameId;
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl || '');
  const now = Date.now();

  db.prepare(
    `INSERT INTO game_exclusions (game_id, label, image_url, excluded_at, excluded_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET
       label = excluded.label,
       image_url = COALESCE(NULLIF(excluded.image_url, ''), game_exclusions.image_url),
       excluded_at = excluded.excluded_at,
       excluded_by = excluded.excluded_by`
  ).run(gameId, label, imageUrl, now, admin.id);

  db.prepare('DELETE FROM game_global_adds WHERE id = ?').run(gameId);

  return res.json({ ok: true, gameId });
}

export function adminUnexcludeGameHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const gameId = sanitizeGameId(req.params?.gameId || req.body?.gameId);
  if (!gameId) return res.status(400).json({ error: 'Invalid game id' });

  db.prepare('DELETE FROM game_exclusions WHERE game_id = ?').run(gameId);
  return res.json({ ok: true, gameId });
}

export function adminAddGlobalGameHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const label = sanitizeLabel(req.body?.label);
  const url = sanitizeGameUrl(req.body?.url);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl || '');
  const categories = sanitizeCategories(req.body?.categories);

  if (!label) return res.status(400).json({ error: 'Title required' });
  if (!url) return res.status(400).json({ error: 'Invalid game URL' });
  if (!imageUrl) return res.status(400).json({ error: 'Image required' });

  const count = db.prepare('SELECT COUNT(*) as c FROM game_global_adds').get().c;
  if (count >= MAX_GLOBAL_GAMES) {
    return res.status(400).json({ error: 'Global game limit reached' });
  }

  const id = `global-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO game_global_adds (id, label, url, image_url, categories, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, label, url, imageUrl, JSON.stringify(categories), now, admin.id);

  return res.status(201).json({
    ok: true,
    game: {
      id,
      label,
      url,
      imageUrl,
      categories,
      isCustom: false,
      isGlobal: true,
    },
  });
}

export function adminRemoveGlobalGameHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const id = typeof req.params?.id === 'string' ? req.params.id.trim().slice(0, 80) : '';
  if (!id || !/^global-[a-z0-9]+$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const info = db.prepare('DELETE FROM game_global_adds WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true, id });
}

export function adminUpdateGameHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const id = typeof req.params?.id === 'string' ? req.params.id.trim().slice(0, 80) : '';
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const label = sanitizeLabel(req.body?.label);
  const url = sanitizeGameUrl(req.body?.url);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl || '');
  const categories = sanitizeCategories(req.body?.categories);

  if (!label) return res.status(400).json({ error: 'Title required' });
  if (!url) return res.status(400).json({ error: 'Invalid game URL' });
  if (!imageUrl) return res.status(400).json({ error: 'Image required' });

  const now = Date.now();
  if (/^global-[a-z0-9]+$/i.test(id)) {
    const info = db
      .prepare(
        `UPDATE game_global_adds SET label = ?, url = ?, image_url = ?, categories = ? WHERE id = ?`
      )
      .run(label, url, imageUrl, JSON.stringify(categories), id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    return res.json({
      ok: true,
      game: { id, label, url, imageUrl, categories, isCustom: false, isGlobal: true },
    });
  }

  db.prepare(
    `INSERT INTO game_overrides (game_id, label, url, image_url, categories, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET
       label = excluded.label,
       url = excluded.url,
       image_url = excluded.image_url,
       categories = excluded.categories,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).run(id, label, url, imageUrl, JSON.stringify(categories), now, admin.id);

  return res.json({
    ok: true,
    game: { id, label, url, imageUrl, categories, isCustom: false, isGlobal: false },
  });
}
