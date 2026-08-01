import db from '../db.js';
import rateLimit from 'express-rate-limit';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';
import { evaluateAchievements } from './achievements.js';
import { bumpUsage } from '../utils/usage-daily.js';

const MAX_LABEL = 120;
const MAX_ID = 200;
const PLAY_COOLDOWN_MS = 8000;
const recentPlays = new Map();

export const gamePlayLimiter = rateLimit({
  windowMs: 60000,
  max: 40,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many play events' },
});

export const achievementHeartbeatLimiter = rateLimit({
  windowMs: 60000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many heartbeats' },
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

export function sanitizeGameId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().slice(0, MAX_ID).toLowerCase();
  if (!id || !/^[a-z0-9._\-]+$/i.test(id)) return null;
  return id;
}

function sanitizeImageUrl(raw) {
  if (typeof raw !== 'string') return '';
  const url = raw.trim().slice(0, 400);
  if (!url) return '';
  if (url.startsWith('/storage/images/') && !url.includes('..') && !/[\s<>"'`]/.test(url)) {
    return url;
  }
  if (/^https:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return '';
      if (parsed.username || parsed.password) return '';
      return parsed.toString().slice(0, 400);
    } catch {
      return '';
    }
  }
  return '';
}

function playGateKey(req, gameId) {
  const who = req.session?.user?.id || toIPv4(null, req);
  return `${who}:${gameId}`;
}

function allowPlayEvent(req, gameId) {
  const key = playGateKey(req, gameId);
  const now = Date.now();
  const last = recentPlays.get(key) || 0;
  if (now - last < PLAY_COOLDOWN_MS) return false;
  recentPlays.set(key, now);
  if (recentPlays.size > 20000 || Math.random() < 0.02) {
    for (const [k, t] of recentPlays) {
      if (now - t > PLAY_COOLDOWN_MS * 4) recentPlays.delete(k);
    }
  }
  return true;
}

export function recordGamePlayHandler(req, res) {
  const gameId = sanitizeGameId(req.body?.gameId);
  if (!gameId) return res.status(400).json({ error: 'Invalid gameId' });
  if (!allowPlayEvent(req, gameId)) {
    return res.json({ ok: true, deduped: true });
  }
  const label =
    typeof req.body?.label === 'string'
      ? req.body.label.trim().slice(0, MAX_LABEL).replace(/[<>]/g, '')
      : gameId;
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);
  const now = Date.now();

  try {
    bumpUsage('games', 1);
  } catch {}

  db.prepare(
    `INSERT INTO game_plays (game_id, label, image_url, plays, last_played_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(game_id) DO UPDATE SET
       plays = plays + 1,
       last_played_at = excluded.last_played_at,
       label = COALESCE(NULLIF(excluded.label, ''), game_plays.label),
       image_url = CASE
         WHEN excluded.image_url IS NOT NULL AND excluded.image_url != '' THEN excluded.image_url
         ELSE game_plays.image_url
       END`
  ).run(gameId, label, imageUrl, now);

  const userId = req.session?.user?.id;
  if (userId) {
    const before = db
      .prepare('SELECT plays FROM user_game_plays WHERE user_id = ? AND game_id = ?')
      .get(userId, gameId);
    db.prepare(
      `INSERT INTO user_game_plays (user_id, game_id, plays, last_played_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id, game_id) DO UPDATE SET
         plays = plays + 1,
         last_played_at = excluded.last_played_at`
    ).run(userId, gameId, now);

    const uniqueBump = before ? 0 : 1;
    db.prepare(
      `INSERT INTO user_stats (user_id, time_ms, games_played, unique_games, vm_sessions, last_heartbeat, created_at, updated_at)
       VALUES (?, 0, 1, ?, 0, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         games_played = games_played + 1,
         unique_games = unique_games + ?,
         updated_at = excluded.updated_at`
    ).run(userId, uniqueBump, now, now, now, uniqueBump);

    try {
      evaluateAchievements(userId);
    } catch {}
  }

  res.json({ ok: true });
}

export function getGamePlaysMapHandler(_req, res) {
  const rows = db
    .prepare('SELECT game_id, plays FROM game_plays WHERE plays > 0 ORDER BY plays DESC LIMIT 5000')
    .all();
  const counts = {};
  for (const row of rows) counts[row.game_id] = row.plays;
  res.setHeader('Cache-Control', 'public, max-age=20');
  res.json({ counts });
}

export function getAdminGameStatsHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const q = typeof req.query?.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const top = db
    .prepare(
      `SELECT game_id as gameId, label, image_url as imageUrl, plays, last_played_at as lastPlayedAt
       FROM game_plays ORDER BY plays DESC, last_played_at DESC LIMIT 50`
    )
    .all();

  let search = null;
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    search = db
      .prepare(
        `SELECT game_id as gameId, label, image_url as imageUrl, plays, last_played_at as lastPlayedAt
         FROM game_plays
         WHERE label LIKE ? OR game_id LIKE ?
         ORDER BY plays DESC LIMIT 25`
      )
      .all(like, like);
  }

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(plays), 0) as totalPlays, COUNT(*) as trackedGames FROM game_plays`
    )
    .get();

  res.json({
    top,
    search,
    totals,
    updatedAt: Date.now(),
  });
}

const gameClients = new Map();
const GAME_STALE_MS = 30000;

export function reportGamePresence(clientId, payload) {
  if (!clientId || typeof clientId !== 'string') return;
  const id = clientId.slice(0, 36);
  const gameId =
    typeof payload?.gameId === 'string' ? sanitizeGameId(payload.gameId) : null;
  const label =
    typeof payload?.label === 'string'
      ? payload.label.trim().slice(0, MAX_LABEL).replace(/[<>]/g, '')
      : null;
  const surface = payload?.surface === 'list' || payload?.surface === 'viewer' ? payload.surface : null;
  if (!surface) return;
  gameClients.set(id, {
    surface,
    gameId,
    label,
    username:
      typeof payload?.username === 'string' ? payload.username.slice(0, 24) : null,
    t: Date.now(),
  });
  if (gameClients.size > 4000 || Math.random() < 0.05) {
    const now = Date.now();
    for (const [cid, entry] of gameClients) {
      if (now - entry.t > GAME_STALE_MS) gameClients.delete(cid);
    }
  }
}

export function clearGamePresence(clientId) {
  if (clientId) gameClients.delete(String(clientId).slice(0, 36));
}

export function getAdminGameLiveHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const now = Date.now();
  for (const [id, entry] of gameClients) {
    if (now - entry.t > GAME_STALE_MS) gameClients.delete(id);
  }

  const byGame = new Map();
  let onList = 0;
  let onViewer = 0;
  for (const entry of gameClients.values()) {
    if (entry.surface === 'list') onList += 1;
    if (entry.surface === 'viewer') onViewer += 1;
    const key = entry.gameId || entry.label || 'unknown';
    let row = byGame.get(key);
    if (!row) {
      row = {
        gameId: entry.gameId || null,
        label: entry.label || 'Unknown',
        viewers: 0,
        surface: entry.surface || 'viewer',
        username: null,
        updatedAt: 0,
      };
      byGame.set(key, row);
    }
    row.viewers += 1;
    if (entry.t > row.updatedAt) {
      row.updatedAt = entry.t;
      if (entry.username) row.username = entry.username;
      row.surface = entry.surface || row.surface;
      if (entry.label) row.label = entry.label;
    }
  }

  const active = [...byGame.values()].sort((a, b) => b.viewers - a.viewers).slice(0, 100);

  res.json({
    active,
    onList,
    onViewer,
    clients: gameClients.size,
    updatedAt: Date.now(),
  });
}
