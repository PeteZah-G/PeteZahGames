import db from '../db.js';
import { sanitizeUsername } from '../utils/sanitize.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getUserAchievementsPublic, evaluateAchievements, trackProfileView } from './achievements.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_COLS =
  'id, email, username, display_name, bio, avatar_url, status, location, website, profile_color, banner_url, favorite_music, showcase_badges, profile_public, show_activity, is_admin, email_verified, totp_enabled, school, age, created_at';

function parseFavoriteMusic(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 12)
      .map((t) => ({
        id: String(t.id || ''),
        title: String(t.title || '').slice(0, 120),
        artist: String(t.artist || '').slice(0, 120),
        artwork: typeof t.artwork === 'string' ? t.artwork.slice(0, 500) : null,
        duration: Number(t.duration) || 0,
        permalink_url: typeof t.permalink_url === 'string' ? t.permalink_url.slice(0, 500) : null,
      }))
      .filter((t) => t.id && t.title);
  } catch {
    return [];
  }
}

function parseShowcaseBadges(raw) {
  try {
    if (raw == null || raw === '') return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((id) => typeof id === 'string' && /^[a-z0-9_]{1,40}$/i.test(id))
      .slice(0, 12);
  } catch {
    return null;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    bio: row.bio || '',
    avatar_url: row.avatar_url || null,
    status: row.status || '',
    location: row.location || '',
    website: row.website || '',
    profile_color: row.profile_color || '#4d8dff',
    banner_url: row.banner_url || null,
    favorite_music: parseFavoriteMusic(row.favorite_music),
    showcase_badges: parseShowcaseBadges(row.showcase_badges),
    profile_public: row.profile_public !== 0,
    show_activity: row.show_activity !== 0,
    is_admin: row.is_admin || 0,
    created_at: row.created_at,
  };
}

export async function getMeHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare(`SELECT ${PROFILE_COLS} FROM users WHERE id = ?`).get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (isOwnerEmail(user.email) && user.is_admin < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(user.id);
    user.is_admin = 3;
  }

  const is_owner = isOwnerEmail(user.email);
  req.session.user.is_admin = user.is_admin;
  req.session.user.username = user.username;
  req.session.user.avatar_url = user.avatar_url;
  req.session.user.is_owner = is_owner;
  await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

  res.json({
    user: {
      ...user,
      favorite_music: parseFavoriteMusic(user.favorite_music),
      showcase_badges: parseShowcaseBadges(user.showcase_badges),
      profile_public: user.profile_public !== 0,
      show_activity: user.show_activity !== 0,
      email_verified: !!user.email_verified,
      totp_enabled: !!user.totp_enabled,
      is_owner,
    },
  });
}

export async function updateProfileHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });

  let {
    username,
    bio,
    display_name,
    status,
    location,
    website,
    profile_color,
    favorite_music,
    showcase_badges,
    profile_public,
    show_activity,
  } = req.body;

  const current = db.prepare(`SELECT ${PROFILE_COLS} FROM users WHERE id = ?`).get(req.session.user.id);
  if (!current) return res.status(404).json({ error: 'User not found' });

  let nextUsername = current.username;
  if (username !== undefined) {
    if (typeof username !== 'string') return res.status(400).json({ error: 'Invalid username' });
    const cleaned = sanitizeUsername(username);
    if (username.trim().length > 0) {
      if (!cleaned) return res.status(400).json({ error: 'Invalid username' });
      const taken = db
        .prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?')
        .get(cleaned, req.session.user.id);
      if (taken) return res.status(409).json({ error: 'Username taken' });
      nextUsername = cleaned;
    }
  }

  let nextBio = current.bio;
  if (bio !== undefined) {
    if (typeof bio !== 'string') return res.status(400).json({ error: 'Invalid bio' });
    if (bio.length > 280) return res.status(400).json({ error: 'Bio too long' });
    nextBio = bio.replace(/\0/g, '').trim().slice(0, 280);
  }

  let nextDisplay = current.display_name;
  if (display_name !== undefined) {
    if (typeof display_name !== 'string') return res.status(400).json({ error: 'Invalid display name' });
    nextDisplay = display_name.replace(/[<>"'&`]/g, '').trim().slice(0, 48) || null;
  }

  let nextStatus = current.status;
  if (status !== undefined) {
    if (typeof status !== 'string') return res.status(400).json({ error: 'Invalid status' });
    nextStatus = status.replace(/[<>"'&`]/g, '').trim().slice(0, 80) || null;
  }

  let nextLocation = current.location;
  if (location !== undefined) {
    if (typeof location !== 'string') return res.status(400).json({ error: 'Invalid location' });
    nextLocation = location.replace(/[<>"'&`]/g, '').trim().slice(0, 64) || null;
  }

  let nextWebsite = current.website;
  if (website !== undefined) {
    if (typeof website !== 'string') return res.status(400).json({ error: 'Invalid website' });
    let w = website.trim().slice(0, 200);
    if (w && !/^https?:\/\//i.test(w)) w = 'https://' + w;
    if (w && !/^https?:\/\/[\w.-]+/i.test(w)) return res.status(400).json({ error: 'Invalid website URL' });
    nextWebsite = w || null;
  }

  let nextColor = current.profile_color || '#4d8dff';
  if (profile_color !== undefined) {
    if (typeof profile_color !== 'string') return res.status(400).json({ error: 'Invalid color' });
    let c = profile_color.trim();
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
      c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return res.status(400).json({ error: 'Invalid color' });
    nextColor = c;
  }

  let nextFavorites = current.favorite_music ?? '[]';
  if (favorite_music !== undefined) {
    nextFavorites = JSON.stringify(parseFavoriteMusic(JSON.stringify(favorite_music)));
  }

  let nextShowcase = current.showcase_badges ?? null;
  if (showcase_badges !== undefined) {
    if (showcase_badges === null) {
      nextShowcase = null;
    } else {
      const cleaned = parseShowcaseBadges(JSON.stringify(showcase_badges));
      nextShowcase = cleaned == null ? '[]' : JSON.stringify(cleaned);
    }
  }

  const nextPublic =
    profile_public !== undefined ? (profile_public ? 1 : 0) : current.profile_public ?? 1;
  const nextActivity =
    show_activity !== undefined ? (show_activity ? 1 : 0) : current.show_activity ?? 1;

  const now = Date.now();
  db.prepare(
    `UPDATE users SET username = ?, bio = ?, display_name = ?, status = ?, location = ?, website = ?,
     profile_color = ?, favorite_music = ?, showcase_badges = ?, profile_public = ?, show_activity = ?, updated_at = ? WHERE id = ?`
  ).run(
    nextUsername ?? null,
    nextBio ?? null,
    nextDisplay ?? null,
    nextStatus ?? null,
    nextLocation ?? null,
    nextWebsite ?? null,
    nextColor,
    nextFavorites,
    nextShowcase,
    nextPublic,
    nextActivity,
    now,
    req.session.user.id
  );

  req.session.user.username = nextUsername;
  req.session.user.bio = nextBio;
  req.session.user.display_name = nextDisplay;
  req.session.user.avatar_url = current.avatar_url;
  await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

  const updated = db.prepare(`SELECT ${PROFILE_COLS} FROM users WHERE id = ?`).get(req.session.user.id);
  try {
    evaluateAchievements(req.session.user.id);
  } catch {}
  res.json({ message: 'Profile updated', user: { ...publicUser(updated), email: updated.email } });
}

export async function uploadAvatarHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Invalid file type' });

  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return res.status(400).json({ error: 'Unsupported format' });

  const uploadDir = path.join(__dirname, '../../uploads/avatars');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) {
      res.status(413).json({ error: 'File too large (max 5MB)' });
      return;
    }
    chunks.push(chunk);
  }

  fs.writeFileSync(filepath, Buffer.concat(chunks));

  const avatarUrl = `/uploads/avatars/${filename}`;
  db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(
    avatarUrl,
    Date.now(),
    req.session.user.id
  );
  req.session.user.avatar_url = avatarUrl;

  res.json({ avatar_url: avatarUrl });
}

export async function uploadBannerHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Invalid file type' });

  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return res.status(400).json({ error: 'Unsupported format' });

  const uploadDir = path.join(__dirname, '../../uploads/banners');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
      res.status(413).json({ error: 'File too large (max 8MB)' });
      return;
    }
    chunks.push(chunk);
  }

  fs.writeFileSync(filepath, Buffer.concat(chunks));

  const bannerUrl = `/uploads/banners/${filename}`;
  db.prepare('UPDATE users SET banner_url = ?, updated_at = ? WHERE id = ?').run(
    bannerUrl,
    Date.now(),
    req.session.user.id
  );

  res.json({ banner_url: bannerUrl });
}

export async function getPublicProfileHandler(req, res) {
  let handle = String(req.params.username || '').trim();
  if (handle.startsWith('@')) handle = handle.slice(1);
  handle = sanitizeUsername(handle);
  if (!handle) return res.status(400).json({ error: 'Invalid username' });

  const row = db
    .prepare(
      `SELECT id, username, display_name, bio, avatar_url, status, location, website, profile_color, banner_url,
       favorite_music, showcase_badges, profile_public, show_activity, is_admin, created_at
       FROM users WHERE lower(username) = lower(?)`
    )
    .get(handle);

  if (!row) return res.status(404).json({ error: 'User not found' });
  if (row.profile_public === 0) {
    const isSelf = req.session?.user?.id === row.id;
    if (!isSelf) return res.status(403).json({ error: 'Profile is private' });
  }

  let badges = [];
  try {
    badges = getUserAchievementsPublic(row.id, parseShowcaseBadges(row.showcase_badges));
  } catch {}

  try {
    trackProfileView(row.id, req.session?.user?.id || null);
  } catch {}

  res.json({ user: { ...publicUser(row), badges } });
}
