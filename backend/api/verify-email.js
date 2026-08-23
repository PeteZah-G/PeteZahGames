import { createHash, randomBytes } from 'crypto';
import db from '../db.js';
import { sendVerificationEmail } from '../utils/mail.js';
import { getClientIP } from '../utils/client-ip.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const resendCooldown = new Map();

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase().slice(0, 254);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function publicOrigin() {
  // accept a bare hostname too (the .env.example ships one), don't discard it
  const env = (process.env.PUBLIC_ORIGIN || '').trim();
  if (env) {
    const base = /^https?:\/\//i.test(env) ? env : `https://${env}`;
    return base.replace(/\/$/, '');
  }
  // never build the link from Host / X-Forwarded-Host, an attacker sets those
  // to point the emailed token at their own server. use the canonical origin.
  return 'https://petezahgames.com';
}

export function issueVerificationToken(userId) {
  const raw = randomBytes(32).toString('hex');
  const hashed = hashToken(raw);
  const expires = Date.now() + TOKEN_TTL_MS;
  db.prepare(
    'UPDATE users SET verification_token = ?, verification_expires = ?, updated_at = ? WHERE id = ?'
  ).run(hashed, expires, Date.now(), userId);
  return raw;
}

export async function sendUserVerificationEmail(req, userId, email) {
  const raw = issueVerificationToken(userId);
  const url = `${publicOrigin()}/api/verify-email?token=${encodeURIComponent(raw)}`;
  await sendVerificationEmail(email, url);
}

export async function verifyEmailHandler(req, res) {
  const raw = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  if (!raw || raw.length < 32 || raw.length > 128 || !/^[a-f0-9]+$/i.test(raw)) {
    return res.status(400).send(verifyPage(false, 'Invalid verification link.'));
  }

  try {
    const hashed = hashToken(raw);
    const user = db
      .prepare(
        'SELECT id, email_verified, verification_expires FROM users WHERE verification_token = ?'
      )
      .get(hashed);

    if (!user) {
      return res.status(400).send(verifyPage(false, 'This verification link is invalid or has already been used.'));
    }

    if (user.email_verified) {
      db.prepare(
        'UPDATE users SET verification_token = NULL, verification_expires = NULL WHERE id = ?'
      ).run(user.id);
      return res.redirect(302, '/?verified=1');
    }

    if (!user.verification_expires || user.verification_expires < Date.now()) {
      return res.status(400).send(verifyPage(false, 'This verification link has expired. Sign up again or request a new email.'));
    }

    db.prepare(
      `UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL, updated_at = ? WHERE id = ?`
    ).run(Date.now(), user.id);

    try {
      const { evaluateAchievements } = await import('./achievements.js');
      evaluateAchievements(user.id);
    } catch {}

    return res.redirect(302, '/?verified=1');
  } catch (err) {
    console.error('verify-email error:', err);
    return res.status(500).send(verifyPage(false, 'Something went wrong. Please try again.'));
  }
}

export async function resendVerificationHandler(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const ip = getClientIP(req) || 'unknown';
  const now = Date.now();
  const key = `${ip}:${email}`;
  const last = resendCooldown.get(key) || 0;
  if (now - last < 60000) {
    return res.status(429).json({ error: 'Please wait a minute before requesting another email.' });
  }
  resendCooldown.set(key, now);
  setTimeout(() => resendCooldown.delete(key), 120000);

  try {
    const user = db
      .prepare('SELECT id, email_verified FROM users WHERE lower(email) = ?')
      .get(email);

    if (user && !user.email_verified) {
      try {
        await sendUserVerificationEmail(req, user.id, email);
      } catch (err) {
        console.error('resend verification mail error:', err);
        return res.status(503).json({ error: 'Could not send verification email. Try again later.' });
      }
    }

    return res.json({
      message: 'If an unverified account exists for that email, a verification link has been sent.',
    });
  } catch (err) {
    console.error('resend-verification error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}

function verifyPage(ok, message) {
  const title = ok ? 'Email verified' : 'Verification failed';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0a1220;color:#e8f0fa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:28px;border-radius:14px;background:#121c2c;border:1px solid #243044}
a{color:#6db3ff}</style></head><body><div class="card"><h1 style="font-size:18px;margin:0 0 10px">${title}</h1>
<p style="margin:0 0 16px;color:#a8b8cc;font-size:14px;line-height:1.5">${message}</p>
<a href="/">Back to PeteZah</a></div></body></html>`;
}
