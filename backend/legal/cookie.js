import { createHmac, timingSafeEqual } from 'crypto';
import { LEGAL_VERSION } from './version.js';
import { getCapSecret } from '../cap/store.js';

const LEGAL_COOKIE = 'pz_legal';
const LEGAL_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function mintLegalCookieValue(version = LEGAL_VERSION) {
  const exp = Date.now() + LEGAL_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp, v: version, a: 1 })).toString('base64url');
  const sig = createHmac('sha256', getCapSecret()).update(`legal:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyLegalCookieValue(value, expectedVersion = LEGAL_VERSION) {
  if (!value || typeof value !== 'string' || value.length > 512) return false;
  const i = value.lastIndexOf('.');
  if (i <= 0) return false;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = createHmac('sha256', getCapSecret()).update(`legal:${payload}`).digest('base64url');
  try {
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.exp || typeof data.exp !== 'number') return false;
    if (data.exp < Date.now()) return false;
    if (data.a !== 1) return false;
    if (data.v !== expectedVersion) return false;
    return true;
  } catch {
    return false;
  }
}

export function readLegalCookie(req) {
  const raw = req.cookies?.[LEGAL_COOKIE];
  if (raw) return raw;
  const header = req.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/(?:^|;\s*)pz_legal=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function hasValidLegal(req) {
  return verifyLegalCookieValue(readLegalCookie(req));
}

export function setLegalCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(LEGAL_COOKIE, mintLegalCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: LEGAL_TTL_MS,
    path: '/',
  });
}

export { LEGAL_COOKIE, LEGAL_TTL_MS };
