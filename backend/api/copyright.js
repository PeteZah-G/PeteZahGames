import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { toIPv4 } from '../middleware/security.js';
import { getClientIP } from '../utils/client-ip.js';
import { sanitizeGameId } from './game-stats.js';
import { isOwnerEmail } from '../utils/auth-roles.js';

export const copyrightReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many reports. Try again later.' }),
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
  if ((row.is_admin || 0) < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return req.session.user;
}

export function ensureCopyrightTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS copyright_reports (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_url TEXT,
      title TEXT,
      contact_email TEXT,
      work TEXT,
      statement TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE INDEX IF NOT EXISTS idx_copyright_reports_created ON copyright_reports(created_at DESC);
  `);
}

ensureCopyrightTables();

export async function copyrightReportHandler(req, res) {
  const statement = typeof req.body?.statement === 'string' ? req.body.statement.trim().slice(0, 4000) : '';
  if (statement.length < 20) {
    return res.status(400).json({ error: 'Please describe the work and where it appears (at least 20 characters).' });
  }
  const contact = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  const targetType = typeof req.body?.targetType === 'string' ? req.body.targetType.trim().slice(0, 20) : 'game';
  const targetId = sanitizeGameId(req.body?.targetId) || '';
  const targetUrl = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 800) : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 160) : '';
  const work = typeof req.body?.work === 'string' ? req.body.work.trim().slice(0, 400) : '';
  const id = randomUUID();
  db.prepare(
    `INSERT INTO copyright_reports
      (id, target_type, target_id, target_url, title, contact_email, work, statement, created_at, ip, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
  ).run(
    id,
    targetType,
    targetId || null,
    targetUrl || null,
    title || null,
    contact || null,
    work || null,
    statement,
    Date.now(),
    getClientIP(req) || null,
  );
  return res.json({ ok: true, id, message: 'Report received. We review complete notices and disable access when required.' });
}

export function copyrightReportsAdminHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db
    .prepare(
      `SELECT id, target_type as targetType, target_id as targetId, target_url as targetUrl, title,
              contact_email as email, work, statement, created_at as createdAt, status
       FROM copyright_reports ORDER BY created_at DESC LIMIT 200`
    )
    .all();
  return res.json({ reports: rows });
}
