import bcrypt from 'bcrypt';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getClientIP } from '../utils/client-ip.js';
import { isIpBanned } from '../middleware/ip-ban.js';

const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase().slice(0, 254);
}

export async function signinHandler(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (password.length > 256) return res.status(400).json({ error: 'Invalid email or password' });

  const clientIp = getClientIP(req);
  if (clientIp && isIpBanned(clientIp)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const user = db.prepare(
      'SELECT id, email, password_hash, username, bio, avatar_url, email_verified, ip, is_admin, banned FROM users WHERE lower(email) = ?'
    ).get(email);

    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatch) {
      await new Promise(r => setTimeout(r, 80 + Math.floor(Math.random() * 120)));
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.banned) return res.status(403).json({ error: 'This account has been banned.' });

    const isOwner = isOwnerEmail(user.email);
    const effectiveAdmin = isOwner ? Math.max(user.is_admin || 0, 3) : (user.is_admin || 0);

    if (isOwner && (user.is_admin || 0) < 3) {
      db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(user.id);
    }

    if (clientIp) db.prepare('UPDATE users SET ip = ? WHERE id = ?').run(clientIp, user.id);

    const sessionUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatar_url,
      is_admin: effectiveAdmin,
      is_owner: isOwner,
    };

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.user = sessionUser;
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });

    res.status(200).json({ user: sessionUser, message: 'Signin successful' });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
