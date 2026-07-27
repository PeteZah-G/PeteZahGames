import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';
import { recordVmSession } from './achievements.js';

const STALE_MS = 45000;
const MAX_ACTIVE = 400;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ROWS = 20000;

const active = new Map();
let lastPrune = 0;

function requireUser(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return req.session.user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  const row = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(user.id);
  if (!row) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  const level = row.is_admin || 0;
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pruneActive(force = false) {
  const now = Date.now();
  if (!force && now - lastPrune < 10000) return;
  lastPrune = now;
  for (const [id, row] of active) {
    if (now - row.lastSeen > STALE_MS) {
      finalizeSession(id, row);
      active.delete(id);
    }
  }
  if (active.size <= MAX_ACTIVE) return;
  const sorted = [...active.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  const drop = active.size - MAX_ACTIVE;
  for (let i = 0; i < drop; i++) {
    const [id, row] = sorted[i];
    finalizeSession(id, row);
    active.delete(id);
  }
}

function finalizeSession(sessionId, row) {
  try {
    db.prepare(
      `UPDATE firefox_vm_sessions SET last_seen = ?, ended_at = COALESCE(ended_at, ?) WHERE id = ?`
    ).run(row.lastSeen, Date.now(), sessionId);
  } catch {}
}

function pruneHistory() {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  db.prepare('DELETE FROM firefox_vm_sessions WHERE started_at < ?').run(cutoff);
  const count = db.prepare('SELECT COUNT(*) AS c FROM firefox_vm_sessions').get().c;
  if (count > MAX_HISTORY_ROWS) {
    const overflow = count - MAX_HISTORY_ROWS;
    db.prepare(
      `DELETE FROM firefox_vm_sessions WHERE id IN (
         SELECT id FROM firefox_vm_sessions ORDER BY started_at ASC LIMIT ?
       )`
    ).run(overflow);
  }
}

export const firefoxVmLimiter = rateLimit({
  windowMs: 60000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.user?.id ? `u:${req.session.user.id}` : toIPv4(null, req)),
});

export function firefoxVmHeartbeatHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  pruneActive();

  let sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.slice(0, 36) : '';
  const now = Date.now();
  const username =
    typeof user.username === 'string' && user.username ? user.username.slice(0, 24) : '';

  if (sessionId && active.has(sessionId)) {
    const row = active.get(sessionId);
    if (row.userId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    row.lastSeen = now;
    row.username = username || row.username;
    if (now - (row.lastDbWrite || 0) > 25000) {
      db.prepare('UPDATE firefox_vm_sessions SET last_seen = ? WHERE id = ?').run(now, sessionId);
      row.lastDbWrite = now;
    }
    return res.json({ ok: true, sessionId, active: active.size });
  }

  if (sessionId) {
    const existing = db
      .prepare('SELECT id, user_id, started_at FROM firefox_vm_sessions WHERE id = ?')
      .get(sessionId);
    if (existing && existing.user_id === user.id) {
      active.set(sessionId, {
        userId: user.id,
        username,
        startedAt: existing.started_at || now,
        lastSeen: now,
        lastDbWrite: now,
      });
      db.prepare(
        'UPDATE firefox_vm_sessions SET last_seen = ?, ended_at = NULL WHERE id = ?'
      ).run(now, sessionId);
      return res.json({ ok: true, sessionId, active: active.size });
    }
  }

  sessionId = randomUUID();
  const day = dayKey(now);
  db.prepare(
    `INSERT INTO firefox_vm_sessions (id, user_id, username, day, started_at, last_seen, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(sessionId, user.id, username, day, now, now);

  active.set(sessionId, {
    userId: user.id,
    username,
    startedAt: now,
    lastSeen: now,
    lastDbWrite: now,
  });

  try {
    recordVmSession(user.id);
  } catch {}

  if (Math.random() < 0.02) pruneHistory();

  res.json({ ok: true, sessionId, active: active.size });
}

export function firefoxVmEndHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.slice(0, 36) : '';
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const live = active.get(sessionId);
  if (live) {
    if (live.userId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    finalizeSession(sessionId, live);
    active.delete(sessionId);
  } else {
    const row = db.prepare('SELECT user_id FROM firefox_vm_sessions WHERE id = ?').get(sessionId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
    db.prepare(
      'UPDATE firefox_vm_sessions SET ended_at = COALESCE(ended_at, ?), last_seen = ? WHERE id = ?'
    ).run(Date.now(), Date.now(), sessionId);
  }

  res.json({ ok: true });
}

export function getFirefoxVmLiveHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  pruneActive(true);
  const sessions = [...active.entries()]
    .map(([id, row]) => ({
      sessionId: id,
      userId: row.userId,
      username: row.username || null,
      startedAt: row.startedAt,
      lastSeen: row.lastSeen,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 200);

  res.json({ sessions, active: sessions.length, updatedAt: Date.now() });
}

export function getFirefoxVmHistoryHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  pruneHistory();

  const dayRaw = typeof req.query.day === 'string' ? req.query.day.trim() : dayKey();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : dayKey();
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40).toLowerCase() : '';
  const limit = Math.min(Number(req.query.limit) || 100, 200);

  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, user_id, username, day, started_at, last_seen, ended_at
         FROM firefox_vm_sessions
         WHERE day = ? AND (lower(username) LIKE ? OR lower(user_id) LIKE ? OR lower(id) LIKE ?)
         ORDER BY started_at DESC LIMIT ?`
      )
      .all(day, `%${q}%`, `%${q}%`, `%${q}%`, limit);
  } else {
    rows = db
      .prepare(
        `SELECT id, user_id, username, day, started_at, last_seen, ended_at
         FROM firefox_vm_sessions
         WHERE day = ?
         ORDER BY started_at DESC LIMIT ?`
      )
      .all(day, limit);
  }

  const total = db
    .prepare('SELECT COUNT(*) AS c FROM firefox_vm_sessions WHERE day = ?')
    .get(day).c;

  res.json({
    day,
    total,
    sessions: rows.map((r) => ({
      sessionId: r.id,
      userId: r.user_id,
      username: r.username || null,
      day: r.day,
      startedAt: r.started_at,
      lastSeen: r.last_seen,
      endedAt: r.ended_at || null,
      active: !r.ended_at && Date.now() - r.last_seen < STALE_MS,
    })),
  });
}
