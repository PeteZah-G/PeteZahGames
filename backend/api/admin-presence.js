import { randomUUID } from 'crypto';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';

const STALE_MS = 30000;
const MAX_CLIENTS = 4000;
const MAX_URLS_PER_CLIENT = 4;
const MAX_URL_LEN = 180;
const ADMIN_SITE_LIMIT = 250;

const clients = new Map();

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
  return { is_admin: Math.max(level, owner ? 3 : level), is_owner: owner };
}

function compactUrl(raw) {
  if (typeof raw !== 'string') return null;
  let u = raw.trim().slice(0, MAX_URL_LEN);
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    let out = parsed.toString();
    if (out.endsWith('/') && parsed.pathname === '/') out = out.slice(0, -1);
    return out.slice(0, MAX_URL_LEN);
  } catch {
    return u;
  }
}

function prunePresence() {
  const now = Date.now();
  for (const [id, entry] of clients) {
    if (now - entry.t > STALE_MS) clients.delete(id);
  }
  if (clients.size <= MAX_CLIENTS) return;
  const sorted = [...clients.entries()].sort((a, b) => a[1].t - b[1].t);
  const drop = clients.size - MAX_CLIENTS;
  for (let i = 0; i < drop; i++) clients.delete(sorted[i][0]);
}

export function reportPresenceHandler(req, res) {
  const urlsRaw = req.body?.urls;
  if (!Array.isArray(urlsRaw)) return res.status(400).json({ error: 'Invalid urls' });

  const urls = [];
  const seen = new Set();
  for (const item of urlsRaw) {
    if (urls.length >= MAX_URLS_PER_CLIENT) break;
    const c = compactUrl(item);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    urls.push(c);
  }

  let clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.slice(0, 36) : '';
  if (!clientId && req.sessionID) clientId = String(req.sessionID).slice(0, 36);
  if (!clientId) clientId = randomUUID().slice(0, 36);

  const user = req.session?.user;
  const uname =
    typeof user?.username === 'string' && user.username
      ? user.username.slice(0, 24)
      : '';

  clients.set(clientId, {
    u: urls,
    n: uname,
    t: Date.now(),
  });

  if (clients.size > MAX_CLIENTS || Math.random() < 0.05) prunePresence();

  res.json({ ok: true, clientId });
}

export function getLiveSitesHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  prunePresence();

  const agg = new Map();
  for (const entry of clients.values()) {
    for (const url of entry.u || []) {
      let row = agg.get(url);
      if (!row) {
        row = { url, viewers: 0, username: null, updatedAt: 0 };
        agg.set(url, row);
      }
      row.viewers += 1;
      if (entry.t > row.updatedAt) {
        row.updatedAt = entry.t;
        if (entry.n) row.username = entry.n;
      }
    }
  }

  const sites = [...agg.values()]
    .sort((a, b) => b.viewers - a.viewers || b.updatedAt - a.updatedAt)
    .slice(0, ADMIN_SITE_LIMIT);

  res.json({
    sites,
    clients: clients.size,
    unique: agg.size,
    updatedAt: Date.now(),
  });
}

export function listAnnouncementsHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db
    .prepare(
      `SELECT id, title, content, active, created_by, created_at, updated_at
       FROM announcements ORDER BY created_at DESC LIMIT 50`
    )
    .all();
  res.json({ announcements: rows });
}

export function getActiveAnnouncementHandler(req, res) {
  const row = db
    .prepare(
      `SELECT id, title, content, created_at FROM announcements
       WHERE active = 1 ORDER BY created_at DESC LIMIT 1`
    )
    .get();
  res.json({ announcement: row || null });
}

export function createAnnouncementHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO announcements (id, title, content, active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`
  ).run(id, title, content, req.session.user.id, now, now);

  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.status(201).json({ announcement: row });
}

export function setAnnouncementActiveHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const active = req.body?.active ? 1 : 0;
  const existing = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE announcements SET active = ?, updated_at = ? WHERE id = ?').run(
    active,
    Date.now(),
    id
  );
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  res.json({ announcement: row });
}
