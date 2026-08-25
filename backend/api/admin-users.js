import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getAdminUserAchievements, ACHIEVEMENTS } from './achievements.js';

const PAGE_SIZE = 25;
const SEARCH_LIMIT = 100;
const RARITY_WEIGHT = { common: 1, rare: 4, epic: 12, legendary: 40, special: 100 };

export function requireAdmin(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (req.session.must_setup_2fa || req.session.user.must_setup_2fa || !req.session.totpOk) {
    res.status(403).json({
      error: 'Two-factor authentication required',
      code: req.session.must_setup_2fa || req.session.user.must_setup_2fa ? 'MUST_SETUP_2FA' : 'REQUIRES_2FA',
    });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email, totp_enabled FROM users WHERE id = ?').get(req.session.user.id);
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
  if ((level >= 1 || owner) && !row.totp_enabled) {
    res.status(403).json({ error: 'Set up two-factor authentication to continue', code: 'MUST_SETUP_2FA' });
    return null;
  }
  req.session.user.is_admin = Math.max(level, owner ? 3 : level);
  req.session.user.is_owner = owner;
  return { is_admin: req.session.user.is_admin };
}

export function getAdminUsersHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  const search = (req.query.search || '').trim();
  if (search) {
    const safe = search.toLowerCase().replace(/[%_\\]/g, '');
    const pattern = `%${safe}%`;
    const rows = db.prepare(`
      SELECT id, username, email, is_admin, banned, email_verified, created_at
      FROM users
      WHERE LOWER(COALESCE(username, '')) LIKE ? OR LOWER(email) LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(pattern, pattern, SEARCH_LIMIT);
    const users = rows.map((u) => ({
      id: u.id,
      username: u.username,
      is_admin: u.is_admin,
      banned: u.banned,
      email_verified: u.email_verified,
      created_at: u.created_at,
      is_owner: isOwnerEmail(u.email),
    }));
    return res.json({ users, search: true });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const { c: total } = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const rows = db.prepare(`
    SELECT id, username, email, is_admin, banned, email_verified, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(PAGE_SIZE, offset);

  const users = rows.map((u) => ({
    id: u.id,
    username: u.username,
    is_admin: u.is_admin,
    banned: u.banned,
    email_verified: u.email_verified,
    created_at: u.created_at,
    is_owner: isOwnerEmail(u.email),
  }));

  res.json({
    users,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  });
}

export function getAdminUserHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = String(req.params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const user = db.prepare(`
    SELECT id, email, avatar_url, is_admin, banned, email_verified, created_at
    FROM users WHERE id = ?
  `).get(id);

  if (!user) return res.status(404).json({ error: 'Not found' });
  let achievements = [];
  try {
    achievements = getAdminUserAchievements(user.id)?.achievements?.filter((a) => a.unlocked) || [];
  } catch {}
  res.json({
    user: {
      id: user.id,
      avatar_url: user.avatar_url,
      is_admin: user.is_admin,
      banned: user.banned,
      email_verified: user.email_verified,
      created_at: user.created_at,
      is_owner: isOwnerEmail(user.email),
      achievements,
    },
  });
}

const REVEAL_FIELDS = new Set(['username', 'email', 'ip', 'school', 'age', 'bio', 'id', 'settings']);
const SETTINGS_CAP = 65536;

export function getAdminUserRevealHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  const id = String(req.params.id || '');
  const field = String(req.query.field || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (!REVEAL_FIELDS.has(field)) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  const user = db.prepare(`
    SELECT id, email, username, bio, ip, school, age
    FROM users WHERE id = ?
  `).get(id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (field === 'settings') {
    const row = db.prepare('SELECT localstorage_data FROM user_settings WHERE user_id = ?').get(id);
    let raw = row?.localstorage_data;
    if (raw == null) return res.json({ field, value: '', truncated: false });
    if (typeof raw !== 'string') raw = String(raw);
    let truncated = false;
    if (raw.length > SETTINGS_CAP) {
      raw = raw.slice(0, SETTINGS_CAP);
      truncated = true;
    }
    let value = raw;
    try {
      const parsed = JSON.parse(raw);
      value = JSON.stringify(parsed, null, 2);
      if (value.length > SETTINGS_CAP) {
        value = value.slice(0, SETTINGS_CAP);
        truncated = true;
      }
    } catch {}
    return res.json({ field, value, truncated });
  }

  const map = {
    username: user.username == null ? '' : String(user.username),
    email: user.email == null ? '' : String(user.email),
    ip: user.ip == null ? '' : String(user.ip),
    school: user.school == null ? '' : String(user.school),
    age: user.age == null ? '' : String(user.age),
    bio: user.bio == null ? '' : String(user.bio),
    id: String(user.id),
  };
  return res.json({ field, value: map[field] ?? '' });
}

export function getAdminStaffHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  const rows = db.prepare(`
    SELECT id, username, email, is_admin, banned, email_verified, created_at
    FROM users
    WHERE is_admin >= 1
    ORDER BY is_admin DESC, created_at ASC
  `).all();

  const staff = rows.map((u) => ({
    id: u.id,
    username: u.username,
    is_admin: u.is_admin,
    banned: u.banned,
    email_verified: u.email_verified,
    created_at: u.created_at,
    is_owner: isOwnerEmail(u.email),
  }));

  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.user.id);
  res.json({
    staff,
    is_owner: isOwnerEmail(me?.email),
  });
}

export function getBadgeRarityLeaderboardHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  const rows = db.prepare(`
    SELECT ua.user_id, ua.achievement_id, u.username, u.email, u.avatar_url
    FROM user_achievements ua
    JOIN users u ON u.id = ua.user_id
  `).all();

  const map = new Map();
  for (const row of rows) {
    const ach = byId.get(row.achievement_id);
    if (!ach) continue;
    let entry = map.get(row.user_id);
    if (!entry) {
      entry = {
        userId: row.user_id,
        username: row.username,
        email: row.email,
        avatar_url: row.avatar_url,
        score: 0,
        badgeCount: 0,
        topRarityRank: -1,
        topRarity: 'common',
        badges: [],
      };
      map.set(row.user_id, entry);
    }
    const weight = RARITY_WEIGHT[ach.rarity] || 1;
    entry.score += weight;
    entry.badgeCount += 1;
    entry.badges.push({
      id: ach.id,
      name: ach.name,
      rarity: ach.rarity,
      color: ach.color,
      icon: ach.icon,
    });
    const rank = RARITY_WEIGHT[ach.rarity] || 0;
    if (rank > entry.topRarityRank) {
      entry.topRarityRank = rank;
      entry.topRarity = ach.rarity;
    }
  }

  const leaderboard = [...map.values()]
    .sort((a, b) => b.score - a.score || b.badgeCount - a.badgeCount)
    .slice(0, limit)
    .map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      username: e.username,
      avatar_url: e.avatar_url,
      score: e.score,
      badgeCount: e.badgeCount,
      topRarity: e.topRarity,
      badges: e.badges
        .sort((a, b) => (RARITY_WEIGHT[b.rarity] || 0) - (RARITY_WEIGHT[a.rarity] || 0))
        .slice(0, 6),
    }));

  res.json({ leaderboard });
}
