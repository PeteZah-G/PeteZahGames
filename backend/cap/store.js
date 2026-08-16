import { createHash, createHmac, timingSafeEqual } from 'crypto';
import db from '../db.js';
import { crossSiteCookieFlags } from '../middleware/http-security.js';

const GATE_COOKIE = 'pz_gate';
const GATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCOPE = 'gate';

let lastCleanup = 0;

export function getCapSecret() {
  const s = process.env.CAP_SECRET || process.env.TOKEN_SECRET || '';
  if (!s || s.length < 16) {
    throw new Error('CAP_SECRET must be set (32+ hex chars)');
  }
  return s;
}

export function cleanupCapStore(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanup < 120000) return;
  lastCleanup = now;
  db.prepare('DELETE FROM cap_nonces WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM cap_tokens WHERE expires_at < ?').run(now);
}

export async function consumeCapNonce(sigHex, ttlMs) {
  cleanupCapStore();
  const expiresAt = Date.now() + Math.max(ttlMs, 1000);
  try {
    db.prepare('INSERT INTO cap_nonces (sig, expires_at) VALUES (?, ?)').run(sigHex, expiresAt);
    return true;
  } catch {
    return false;
  }
}

export function storeCapToken(tokenKey, expires) {
  cleanupCapStore();
  db.prepare('INSERT OR REPLACE INTO cap_tokens (token_key, expires_at) VALUES (?, ?)').run(
    tokenKey,
    expires
  );
}

export function consumeCapToken(token) {
  if (!token || typeof token !== 'string' || token.length > 512) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [id, verToken] = parts;
  if (!id || !verToken) return false;
  const tokenKey = `${id}:${createHash('sha256').update(verToken).digest('hex')}`;
  const row = db.prepare('SELECT expires_at FROM cap_tokens WHERE token_key = ?').get(tokenKey);
  if (!row) return false;
  db.prepare('DELETE FROM cap_tokens WHERE token_key = ?').run(tokenKey);
  if (Number(row.expires_at) < Date.now()) return false;
  return true;
}

export function mintGateCookieValue() {
  const exp = Date.now() + GATE_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ exp, v: 1 })).toString('base64url');
  const sig = createHmac('sha256', getCapSecret()).update(`gate:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyGateCookieValue(value) {
  if (!value || typeof value !== 'string' || value.length > 512) return false;
  const i = value.lastIndexOf('.');
  if (i <= 0) return false;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = createHmac('sha256', getCapSecret()).update(`gate:${payload}`).digest('base64url');
  try {
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.exp || typeof data.exp !== 'number') return false;
    if (data.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function readGateCookie(req) {
  const raw = req.cookies?.[GATE_COOKIE];
  if (raw) return raw;
  const header = req.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/(?:^|;\s*)pz_gate=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function headerToken(req, name) {
  const h = req.headers?.[name];
  if (typeof h === 'string') return h;
  if (Array.isArray(h) && typeof h[0] === 'string') return h[0];
  return null;
}

export function hasValidGate(req) {
  if (verifyGateCookieValue(readGateCookie(req))) return true;
  return verifyGateCookieValue(headerToken(req, 'x-pz-gate'));
}

export function setGateCookie(res, req) {
  const value = mintGateCookieValue();
  res.cookie(GATE_COOKIE, value, {
    ...crossSiteCookieFlags(req),
    maxAge: GATE_TTL_MS,
  });
  return value;
}

export function capScope() {
  return SCOPE;
}

export { GATE_COOKIE, GATE_TTL_MS };
