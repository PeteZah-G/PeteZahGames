import rateLimit from 'express-rate-limit';
import { getClientIP } from '../utils/client-ip.js';
import { toIPv4 } from '../middleware/security.js';

const COOLDOWN_MS = 5 * 60 * 1000;
const CONTEXTS = new Set(['game', 'app', 'vm']);
const lastShown = new Map();
const MAX_KEYS = 20000;

export const adsGateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ show: false, reason: 'rate_limit' }),
});

function prune() {
  if (lastShown.size < MAX_KEYS) return;
  const cutoff = Date.now() - COOLDOWN_MS * 2;
  for (const [k, ts] of lastShown) {
    if (ts < cutoff) lastShown.delete(k);
  }
  if (lastShown.size > MAX_KEYS) {
    const sorted = [...lastShown.entries()].sort((a, b) => a[1] - b[1]);
    const drop = lastShown.size - Math.floor(MAX_KEYS * 0.75);
    for (let i = 0; i < drop; i++) lastShown.delete(sorted[i][0]);
  }
}

function subjectKey(req) {
  if (req.session?.user?.id) return `u:${req.session.user.id}`;
  if (req.sessionID) return `s:${req.sessionID}`;
  const ip = getClientIP(req) || toIPv4(null, req) || 'anon';
  return `i:${ip}`;
}

function isApplixirEnabled() {
  const v = String(process.env.APPLIXIR_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export async function adsGateHandler(req, res) {
  if (!isApplixirEnabled()) {
    return res.json({ show: false, reason: 'disabled' });
  }

  const apiKey = typeof process.env.APPLIXIR_API_KEY === 'string'
    ? process.env.APPLIXIR_API_KEY.trim()
    : '';

  if (!apiKey || apiKey.length < 8) {
    return res.json({ show: false, reason: 'disabled' });
  }

  const context = typeof req.body?.context === 'string'
    ? req.body.context.trim().toLowerCase()
    : '';
  if (!CONTEXTS.has(context)) {
    return res.status(400).json({ show: false, reason: 'invalid_context' });
  }

  prune();
  const key = subjectKey(req);
  const now = Date.now();
  const prev = lastShown.get(key) || 0;
  const elapsed = now - prev;

  if (elapsed < COOLDOWN_MS) {
    return res.json({
      show: false,
      reason: 'cooldown',
      retryAfterMs: COOLDOWN_MS - elapsed,
      cooldownMs: COOLDOWN_MS,
    });
  }

  lastShown.set(key, now);

  return res.json({
    show: true,
    apiKey,
    context,
    cooldownMs: COOLDOWN_MS,
  });
}
