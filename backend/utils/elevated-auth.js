import db from '../db.js';
import { isOwnerEmail } from './auth-roles.js';

export function isElevatedRole(isAdmin, email) {
  if (isOwnerEmail(email)) return true;
  return (Number(isAdmin) || 0) >= 1;
}

export function loadAuthRow(userId) {
  return db
    .prepare(
      `SELECT id, email, username, bio, avatar_url, is_admin, banned, totp_secret, totp_enabled, totp_pending_secret
       FROM users WHERE id = ?`
    )
    .get(userId);
}

export function effectiveAdminLevel(row) {
  if (!row) return 0;
  if (isOwnerEmail(row.email)) return Math.max(row.is_admin || 0, 3);
  return row.is_admin || 0;
}

export function buildFullSessionUser(row) {
  const isOwner = isOwnerEmail(row.email);
  const isAdmin = effectiveAdminLevel(row);
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    bio: row.bio,
    avatar_url: row.avatar_url,
    is_admin: isAdmin,
    is_owner: isOwner,
  };
}

export function buildSetupSessionUser(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    bio: row.bio,
    avatar_url: row.avatar_url,
    is_admin: 0,
    is_owner: false,
    must_setup_2fa: true,
  };
}

export function sessionNeedsTotp(req) {
  return !!req.session?.pending2fa?.userId;
}

export function sessionMustSetup2fa(req) {
  return !!(req.session?.must_setup_2fa || req.session?.user?.must_setup_2fa);
}

export function sessionTotpSatisfied(req) {
  return !!req.session?.totpOk;
}

export async function establishFullSession(req, row) {
  const sessionUser = buildFullSessionUser(row);
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = sessionUser;
      req.session.totpOk = true;
      delete req.session.pending2fa;
      delete req.session.must_setup_2fa;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
  return sessionUser;
}

export async function establishSetupSession(req, row) {
  const sessionUser = buildSetupSessionUser(row);
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = sessionUser;
      req.session.must_setup_2fa = true;
      delete req.session.totpOk;
      delete req.session.pending2fa;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
  return sessionUser;
}

export async function establishPending2faSession(req, row) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.pending2fa = {
        userId: row.id,
        email: row.email,
        createdAt: Date.now(),
      };
      delete req.session.user;
      delete req.session.totpOk;
      delete req.session.must_setup_2fa;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/**
 * Ensure elevated accounts cannot use privileged APIs without 2FA.
 * Mutates session when migrating older privileged sessions.
 * @returns {{ ok: true } | { ok: false, status: number, body: object }}
 */
export function enforceElevatedSession(req) {
  const pending = req.session?.pending2fa;
  if (pending?.userId) {
    const age = Date.now() - (pending.createdAt || 0);
    if (age > 15 * 60 * 1000) {
      delete req.session.pending2fa;
      return {
        ok: false,
        status: 401,
        body: { error: '2FA challenge expired. Sign in again.', code: 'REQUIRES_SIGNIN' },
      };
    }
    return { ok: true, pending2fa: true };
  }

  const user = req.session?.user;
  if (!user?.id) return { ok: true };

  if (req.session.totpOk && !user.must_setup_2fa && !req.session.must_setup_2fa) {
    return { ok: true };
  }

  const row = loadAuthRow(user.id);
  if (!row || row.banned) {
    return { ok: false, status: 401, body: { error: 'Unauthorized', code: 'REQUIRES_SIGNIN' } };
  }

  if (!isElevatedRole(row.is_admin, row.email)) {
    req.session.totpOk = true;
    delete req.session.must_setup_2fa;
    if (user.must_setup_2fa) delete user.must_setup_2fa;
    return { ok: true };
  }

  if (row.totp_enabled) {
    if (req.session.totpOk) return { ok: true };
    req.session.pending2fa = {
      userId: row.id,
      email: row.email,
      createdAt: Date.now(),
    };
    delete req.session.user;
    delete req.session.totpOk;
    delete req.session.must_setup_2fa;
    return {
      ok: false,
      status: 401,
      body: {
        error: 'Two-factor authentication required',
        code: 'REQUIRES_2FA',
        email: maskEmail(row.email),
      },
    };
  }

  req.session.must_setup_2fa = true;
  req.session.user = buildSetupSessionUser(row);
  delete req.session.totpOk;
  return { ok: true, mustSetup2fa: true };
}

export function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '***';
  const name = s.slice(0, at);
  const domain = s.slice(at + 1);
  const shown = name.length <= 2 ? name[0] || '*' : `${name[0]}***${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

/** Paths allowed while must_setup_2fa or pending2fa. */
export function isAuth2faExemptPath(method, path) {
  const p = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(method || 'GET').toUpperCase();
  const allow = new Set([
    'POST /api/signin',
    'POST /api/signup',
    'POST /api/signout',
    'POST /api/auth/2fa/verify',
    'POST /api/auth/2fa/setup',
    'POST /api/auth/2fa/enable',
    'GET /api/auth/2fa/status',
    'GET /api/me',
  ]);
  return allow.has(`${m} ${p}`);
}
