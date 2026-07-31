import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import db from '../db.js';
import { toIPv4 } from '../middleware/security.js';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  makeTotp,
  normalizeTotpCode,
  verifyTotpCode,
} from '../utils/totp.js';
import {
  establishFullSession,
  isElevatedRole,
  loadAuthRow,
  maskEmail,
  sessionMustSetup2fa,
  sessionNeedsTotp,
} from '../utils/elevated-auth.js';

export const accountTotpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyGenerator: (req) =>
    req.session?.pending2fa?.userId ||
    req.session?.user?.id ||
    toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many 2FA attempts. Try again later.' }),
});

export function auth2faStatusHandler(req, res) {
  if (sessionNeedsTotp(req)) {
    const pending = req.session.pending2fa;
    return res.json({
      requires2fa: true,
      requires2faSetup: false,
      email: maskEmail(pending.email),
    });
  }
  if (sessionMustSetup2fa(req) && req.session?.user?.id) {
    return res.json({
      requires2fa: false,
      requires2faSetup: true,
      email: maskEmail(req.session.user.email),
      user: req.session.user,
    });
  }
  if (req.session?.user?.id) {
    return res.json({
      requires2fa: false,
      requires2faSetup: false,
      authenticated: true,
    });
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

export async function verifyLogin2faHandler(req, res) {
  const pending = req.session?.pending2fa;
  if (!pending?.userId) {
    return res.status(400).json({ error: 'No pending 2FA challenge. Sign in again.' });
  }
  if (Date.now() - (pending.createdAt || 0) > 15 * 60 * 1000) {
    delete req.session.pending2fa;
    return res.status(401).json({ error: '2FA challenge expired. Sign in again.', code: 'REQUIRES_SIGNIN' });
  }

  const code = normalizeTotpCode(req.body?.code);
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit authenticator code.' });
  }

  try {
    const row = loadAuthRow(pending.userId);
    if (!row || row.banned) {
      delete req.session.pending2fa;
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!row.totp_enabled || !row.totp_secret) {
      delete req.session.pending2fa;
      return res.status(400).json({
        error: '2FA is not configured on this account.',
        code: 'MUST_SETUP_2FA',
      });
    }

    const secretPlain = decryptTotpSecret(row.totp_secret);
    if (!secretPlain || !verifyTotpCode(secretPlain, code, row.email)) {
      await new Promise((r) => setTimeout(r, 120 + Math.floor(Math.random() * 180)));
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    const sessionUser = await establishFullSession(req, row);
    return res.json({ user: sessionUser, message: 'Signin successful' });
  } catch (err) {
    console.error('verify login 2fa error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function canEnrollRequired2fa(req) {
  if (!req.session?.user?.id) return false;
  if (sessionMustSetup2fa(req)) return true;
  const row = loadAuthRow(req.session.user.id);
  return !!(row && isElevatedRole(row.is_admin, row.email) && !row.totp_enabled);
}

export async function setupAccount2faHandler(req, res) {
  if (!canEnrollRequired2fa(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const row = loadAuthRow(req.session.user.id);
    if (!row || row.banned) return res.status(401).json({ error: 'Unauthorized' });
    if (!isElevatedRole(row.is_admin, row.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (row.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled. Sign in again.' });
    }

    req.session.must_setup_2fa = true;

    const secret = generateTotpSecret();
    const base32 = secret.base32;
    db.prepare('UPDATE users SET totp_pending_secret = ?, updated_at = ? WHERE id = ?').run(
      encryptTotpSecret(base32),
      Date.now(),
      row.id
    );

    const totp = makeTotp(base32, row.email);
    const otpauth = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });
    return res.json({ secret: base32, otpauth, qrDataUrl });
  } catch (err) {
    console.error('account 2fa setup error:', err);
    return res.status(500).json({ error: 'Could not start 2FA setup' });
  }
}

export async function enableAccount2faHandler(req, res) {
  if (!canEnrollRequired2fa(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const code = normalizeTotpCode(req.body?.code);
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit authenticator code.' });
  }

  try {
    const row = loadAuthRow(req.session.user.id);
    if (!row || row.banned) return res.status(401).json({ error: 'Unauthorized' });
    if (!isElevatedRole(row.is_admin, row.email)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (row.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled.' });
    }
    if (!row.totp_pending_secret) {
      return res.status(400).json({ error: 'Start 2FA setup first.' });
    }

    const pendingPlain = decryptTotpSecret(row.totp_pending_secret);
    if (!pendingPlain || !verifyTotpCode(pendingPlain, code, row.email)) {
      await new Promise((r) => setTimeout(r, 120 + Math.floor(Math.random() * 180)));
      return res.status(401).json({ error: 'Invalid authenticator code.' });
    }

    db.prepare(
      `UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_pending_secret = NULL, updated_at = ? WHERE id = ?`
    ).run(encryptTotpSecret(pendingPlain), Date.now(), row.id);

    const fresh = loadAuthRow(row.id);
    const sessionUser = await establishFullSession(req, fresh);
    return res.json({
      ok: true,
      totpEnabled: true,
      user: sessionUser,
      message: 'Two-factor authentication enabled.',
    });
  } catch (err) {
    console.error('account 2fa enable error:', err);
    return res.status(500).json({ error: 'Could not enable 2FA' });
  }
}
