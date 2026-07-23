import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

export const BLOCKERS = [
  'securly',
  'lightspeed',
  'goguardian',
  'palo_alto',
  'contentkeeper',
  'fortiguard',
  'blocksi',
  'linewize',
  'cisco_talos',
  'aristotle',
  'lanschool',
  'deledao',
];

const WEEKLY_LIMIT = 2;
const MAX_LINK_LEN = 512;
const LINK_HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

function totpKey() {
  return createHash('sha256')
    .update(String(process.env.SESSION_SECRET || process.env.TOKEN_SECRET || 'petezah-totp'))
    .digest();
}

function encryptSecret(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

function decryptSecret(stored) {
  if (!stored) return null;
  if (!String(stored).startsWith('v1:')) return String(stored);
  const parts = String(stored).split(':');
  if (parts.length !== 4) return null;
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', totpKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const linksClaimLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many link requests. Try again later.' }),
});

export const linksTotpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many 2FA attempts. Try again later.' }),
});

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
  if ((row.is_admin || 0) < 1 && !isOwnerEmail(row.email)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

export function weekStartMs(ts = Date.now()) {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff);
  return monday;
}

function storagePath() {
  const raw = process.env.LINKBOT_STORAGE_PATH || '/home/ubuntu/PeteZah/LinkBot/manual_link_storage.json';
  return path.resolve(raw);
}

function normalizeHost(value) {
  if (typeof value !== 'string') return null;
  let host = value.trim().toLowerCase();
  host = host.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
  if (!host || host.length > MAX_LINK_LEN || !LINK_HOST_RE.test(host)) return null;
  return host;
}

function loadBlockerPool(blocker) {
  const filePath = storagePath();
  if (!fs.existsSync(filePath)) {
    const err = new Error('Link storage unavailable');
    err.code = 'STORAGE_MISSING';
    throw err;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    const err = new Error('Link storage unreadable');
    err.code = 'STORAGE_BAD';
    throw err;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('Link storage invalid');
    err.code = 'STORAGE_BAD';
    throw err;
  }
  const list = raw[blocker];
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const host = normalizeHost(item);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function makeTotp(secretBase32, email) {
  return new OTPAuth.TOTP({
    issuer: 'PeteZah',
    label: email || 'links',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

function verifyTotpCode(secretBase32, code, email) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  const totp = makeTotp(secretBase32, email);
  const delta = totp.validate({ token: code.trim(), window: 1 });
  return delta !== null;
}

function getAuthUserRow(userId) {
  return db
    .prepare(
      `SELECT id, email, email_verified, password_hash, totp_secret, totp_enabled, totp_pending_secret
       FROM users WHERE id = ?`
    )
    .get(userId);
}

export async function getLinksStatusHandler(req, res) {
  const sessionUser = requireUser(req, res);
  if (!sessionUser) return;

  try {
    const user = getAuthUserRow(sessionUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const weekStart = weekStartMs();
    const claims = db
      .prepare(
        `SELECT id, blocker, link, claimed_at FROM link_claims
         WHERE user_id = ? AND week_start = ?
         ORDER BY claimed_at DESC`
      )
      .all(user.id, weekStart);

    let availableBlockers = [];
    try {
      const filePath = storagePath();
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (raw && typeof raw === 'object') {
          availableBlockers = BLOCKERS.filter((b) => Array.isArray(raw[b]) && raw[b].length > 0);
        }
      }
    } catch {
      availableBlockers = [];
    }

    return res.json({
      emailVerified: !!user.email_verified,
      totpEnabled: !!user.totp_enabled,
      weeklyLimit: WEEKLY_LIMIT,
      remaining: Math.max(0, WEEKLY_LIMIT - claims.length),
      weekStart,
      weekEndsAt: weekStart + 7 * 24 * 60 * 60 * 1000,
      claims: claims.map((c) => ({
        id: c.id,
        blocker: c.blocker,
        link: c.link,
        claimedAt: c.claimed_at,
      })),
      blockers: BLOCKERS,
      availableBlockers,
    });
  } catch (err) {
    console.error('links status error:', err);
    return res.status(500).json({ error: 'Failed to load link status' });
  }
}

export async function setupLinksTotpHandler(req, res) {
  const sessionUser = requireUser(req, res);
  if (!sessionUser) return;

  try {
    const user = getAuthUserRow(sessionUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Verify your email before enabling 2FA.' });
    }
    if (user.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled.' });
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const base32 = secret.base32;
    db.prepare('UPDATE users SET totp_pending_secret = ?, updated_at = ? WHERE id = ?').run(
      encryptSecret(base32),
      Date.now(),
      user.id
    );

    const totp = makeTotp(base32, user.email);
    const otpauth = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 200 });

    return res.json({
      secret: base32,
      otpauth,
      qrDataUrl,
    });
  } catch (err) {
    console.error('totp setup error:', err);
    return res.status(500).json({ error: 'Failed to start 2FA setup' });
  }
}

export async function enableLinksTotpHandler(req, res) {
  const sessionUser = requireUser(req, res);
  if (!sessionUser) return;

  try {
    const user = getAuthUserRow(sessionUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Verify your email before enabling 2FA.' });
    }
    if (user.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled.' });
    }
    if (!user.totp_pending_secret) {
      return res.status(400).json({ error: 'Start 2FA setup first.' });
    }

    const pendingPlain = decryptSecret(user.totp_pending_secret);
    if (!pendingPlain) {
      return res.status(400).json({ error: 'Start 2FA setup first.' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!verifyTotpCode(pendingPlain, code, user.email)) {
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    db.prepare(
      `UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_pending_secret = NULL, updated_at = ? WHERE id = ?`
    ).run(encryptSecret(pendingPlain), Date.now(), user.id);

    return res.json({ ok: true, totpEnabled: true });
  } catch (err) {
    console.error('totp enable error:', err);
    return res.status(500).json({ error: 'Failed to enable 2FA' });
  }
}

export async function disableLinksTotpHandler(req, res) {
  const sessionUser = requireUser(req, res);
  if (!sessionUser) return;

  try {
    const user = getAuthUserRow(sessionUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: '2FA is not enabled.' });
    }

    const secretPlain = decryptSecret(user.totp_secret);
    if (!secretPlain) {
      return res.status(400).json({ error: '2FA is misconfigured. Contact support.' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 256) {
      return res.status(400).json({ error: 'Password is required to disable 2FA.' });
    }
    if (!verifyTotpCode(secretPlain, code, user.email)) {
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid password.' });

    db.prepare(
      `UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_pending_secret = NULL, updated_at = ? WHERE id = ?`
    ).run(Date.now(), user.id);

    return res.json({ ok: true, totpEnabled: false });
  } catch (err) {
    console.error('totp disable error:', err);
    return res.status(500).json({ error: 'Failed to disable 2FA' });
  }
}

export async function claimLinkHandler(req, res) {
  const sessionUser = requireUser(req, res);
  if (!sessionUser) return;

  try {
    const user = getAuthUserRow(sessionUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Verify your email before requesting links.' });
    }

    if (user.totp_enabled) {
      const secretPlain = decryptSecret(user.totp_secret);
      if (!secretPlain) {
        return res.status(403).json({ error: '2FA is misconfigured. Disable and re-enable it.' });
      }
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!verifyTotpCode(secretPlain, code, user.email)) {
        return res.status(401).json({ error: 'Invalid authenticator code.' });
      }
    }

    const blocker = typeof req.body?.blocker === 'string' ? req.body.blocker.trim().toLowerCase() : '';
    if (!BLOCKERS.includes(blocker)) {
      return res.status(400).json({ error: 'Invalid blocker.' });
    }

    const weekStart = weekStartMs();
    const claimedCount = db
      .prepare('SELECT COUNT(*) AS c FROM link_claims WHERE user_id = ? AND week_start = ?')
      .get(user.id, weekStart).c;

    if (claimedCount >= WEEKLY_LIMIT) {
      return res.status(429).json({
        error: `Weekly limit reached (${WEEKLY_LIMIT} links). New links unlock next week.`,
        remaining: 0,
      });
    }

    let pool;
    try {
      pool = loadBlockerPool(blocker);
    } catch (err) {
      if (err.code === 'STORAGE_MISSING' || err.code === 'STORAGE_BAD') {
        return res.status(503).json({ error: 'Links are temporarily unavailable.' });
      }
      throw err;
    }

    if (pool.length === 0) {
      return res.status(404).json({ error: 'No links available for that blocker right now.' });
    }

    const usedByUser = new Set(
      db
        .prepare('SELECT link FROM link_claims WHERE user_id = ?')
        .all(user.id)
        .map((r) => r.link)
    );

    const weekCounts = db
      .prepare('SELECT link, COUNT(*) AS c FROM link_claims WHERE week_start = ? GROUP BY link')
      .all(weekStart);
    const countMap = new Map(weekCounts.map((r) => [r.link, r.c]));

    const candidates = pool
      .filter((link) => !usedByUser.has(link))
      .sort((a, b) => (countMap.get(a) || 0) - (countMap.get(b) || 0));

    const pickFrom = candidates.length > 0 ? candidates : pool;
    const chosen = pickFrom[0];
    if (!chosen) {
      return res.status(404).json({ error: 'No links available for that blocker right now.' });
    }

    const id = randomUUID();
    const now = Date.now();
    const insert = db.transaction(() => {
      const again = db
        .prepare('SELECT COUNT(*) AS c FROM link_claims WHERE user_id = ? AND week_start = ?')
        .get(user.id, weekStart).c;
      if (again >= WEEKLY_LIMIT) {
        const err = new Error('limit');
        err.code = 'LIMIT';
        throw err;
      }
      db.prepare(
        `INSERT INTO link_claims (id, user_id, blocker, link, claimed_at, week_start)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, user.id, blocker, chosen, now, weekStart);
    });

    try {
      insert();
    } catch (err) {
      if (err.code === 'LIMIT') {
        return res.status(429).json({
          error: `Weekly limit reached (${WEEKLY_LIMIT} links). New links unlock next week.`,
          remaining: 0,
        });
      }
      throw err;
    }

    const remaining = Math.max(0, WEEKLY_LIMIT - (claimedCount + 1));
    return res.json({
      claim: { id, blocker, link: chosen, claimedAt: now },
      remaining,
      weeklyLimit: WEEKLY_LIMIT,
    });
  } catch (err) {
    console.error('claim link error:', err);
    return res.status(500).json({ error: 'Failed to claim link' });
  }
}

export async function getAdminLinkStatsHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const now = Date.now();
    const dayStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate()
    );
    const weekStart = weekStartMs(now);
    const prevWeekStart = weekStart - 7 * 24 * 60 * 60 * 1000;

    const total = db.prepare('SELECT COUNT(*) AS c FROM link_claims').get().c;
    const dayTotal = db.prepare('SELECT COUNT(*) AS c FROM link_claims WHERE claimed_at >= ?').get(dayStart).c;
    const weekTotal = db.prepare('SELECT COUNT(*) AS c FROM link_claims WHERE claimed_at >= ?').get(weekStart).c;
    const prevWeekTotal = db
      .prepare('SELECT COUNT(*) AS c FROM link_claims WHERE claimed_at >= ? AND claimed_at < ?')
      .get(prevWeekStart, weekStart).c;

    const uniqueUsersAll = db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM link_claims').get().c;
    const uniqueUsersWeek = db
      .prepare('SELECT COUNT(DISTINCT user_id) AS c FROM link_claims WHERE claimed_at >= ?')
      .get(weekStart).c;
    const uniqueUsersDay = db
      .prepare('SELECT COUNT(DISTINCT user_id) AS c FROM link_claims WHERE claimed_at >= ?')
      .get(dayStart).c;

    const perBlockerWeek = db
      .prepare(
        `SELECT blocker, COUNT(*) AS c FROM link_claims WHERE claimed_at >= ? GROUP BY blocker ORDER BY c DESC`
      )
      .all(weekStart);
    const perBlockerDay = db
      .prepare(
        `SELECT blocker, COUNT(*) AS c FROM link_claims WHERE claimed_at >= ? GROUP BY blocker ORDER BY c DESC`
      )
      .all(dayStart);
    const perBlockerAll = db
      .prepare(`SELECT blocker, COUNT(*) AS c FROM link_claims GROUP BY blocker ORDER BY c DESC`)
      .all();

    const topUsersWeek = db
      .prepare(
        `SELECT lc.user_id AS userId, u.username AS username, u.email AS email, COUNT(*) AS c
         FROM link_claims lc
         LEFT JOIN users u ON u.id = lc.user_id
         WHERE lc.claimed_at >= ?
         GROUP BY lc.user_id
         ORDER BY c DESC
         LIMIT 15`
      )
      .all(weekStart)
      .map((r) => ({
        userId: r.userId,
        username: r.username || null,
        email: r.email ? r.email.replace(/(^.).*(@.*$)/, '$1***$2') : null,
        count: r.c,
      }));

    const recent = db
      .prepare(
        `SELECT lc.id, lc.blocker, lc.link, lc.claimed_at AS claimedAt, lc.user_id AS userId,
                u.username AS username
         FROM link_claims lc
         LEFT JOIN users u ON u.id = lc.user_id
         ORDER BY lc.claimed_at DESC
         LIMIT 40`
      )
      .all()
      .map((r) => ({
        id: r.id,
        blocker: r.blocker,
        link: r.link,
        claimedAt: r.claimedAt,
        userId: r.userId,
        username: r.username || null,
      }));

    let poolSizes = {};
    try {
      const filePath = storagePath();
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const b of BLOCKERS) {
          poolSizes[b] = Array.isArray(raw?.[b]) ? raw[b].length : 0;
        }
      }
    } catch {
      poolSizes = {};
    }

    const usersAtLimit = db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
           SELECT user_id FROM link_claims WHERE week_start = ? GROUP BY user_id HAVING COUNT(*) >= ?
         )`
      )
      .get(weekStart, WEEKLY_LIMIT).c;

    const emptyBlockers = () => Object.fromEntries(BLOCKERS.map((b) => [b, 0]));
    const weekMap = emptyBlockers();
    for (const r of perBlockerWeek) weekMap[r.blocker] = r.c;
    const dayMap = emptyBlockers();
    for (const r of perBlockerDay) dayMap[r.blocker] = r.c;
    const allMap = emptyBlockers();
    for (const r of perBlockerAll) allMap[r.blocker] = r.c;

    return res.json({
      totals: {
        allTime: total,
        today: dayTotal,
        thisWeek: weekTotal,
        lastWeek: prevWeekTotal,
      },
      uniqueUsers: {
        allTime: uniqueUsersAll,
        thisWeek: uniqueUsersWeek,
        today: uniqueUsersDay,
      },
      perBlocker: {
        week: weekMap,
        day: dayMap,
        allTime: allMap,
      },
      topUsersWeek,
      recent,
      poolSizes,
      weeklyLimit: WEEKLY_LIMIT,
      usersAtWeeklyLimit: usersAtLimit,
      weekStart,
      dayStart,
      generatedAt: now,
    });
  } catch (err) {
    console.error('admin link stats error:', err);
    return res.status(500).json({ error: 'Failed to load link stats' });
  }
}
