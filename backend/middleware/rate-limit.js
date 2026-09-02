import rateLimit from 'express-rate-limit';
import { toIPv4, extractToken, verifyToken, updateIPReputation } from './security.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 20,
  keyGenerator: req => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -5);
    res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  }
});

export const signinLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 10,
  keyGenerator: req => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -10);
    res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  },
});

export const signupLimiter = rateLimit({
  windowMs: 3600000,
  max: 3,
  keyGenerator: req => toIPv4(null, req),
  message: 'Too many accounts created from this IP.'
});

export const pfpLimiter = rateLimit({
  windowMs: 3600000,
  max: 5,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  message: 'Too many profile picture uploads.'
});

export const securityActionLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 8,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -8);
    res.status(429).json({ error: 'Too many security actions. Try again later.' });
  },
});

export const adminOverviewLimiter = rateLimit({
  windowMs: 60000,
  max: 40,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many overview requests' },
});

export const localStorageLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  message: 'Too many saves, slow down.'
});

export const aiConversationsLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  keyGenerator: (req) => (req.session?.user?.id ? `u:${req.session.user.id}` : toIPv4(null, req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI chat requests. Slow down.' },
});

export const musicStreamLimiter = rateLimit({
  windowMs: 60_000,
  max: 2400,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Stream limit reached' },
});

export const musicBrowseLimiter = rateLimit({
  windowMs: 60_000,
  max: 140,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many music browse requests' },
});

export const musicSearchLimiter = rateLimit({
  windowMs: 60_000,
  max: 56,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many music searches. Slow down.' },
});

export const musicPlayLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many play requests. Slow down.' },
});

export function createApiLimiter(shield) {
  return rateLimit({
    windowMs: 60000,
    max: req => {
      if (req.session?.user?.id) return 2000;
      if (req._pzTokOk === undefined) {
        const token = extractToken(req);
        req._pzTokOk = !!(token && verifyToken(token, req));
        req._pzTok = token || null;
      }
      if (req._pzTokOk) return 1000;
      return 320;
    },
    keyGenerator: req => {
      if (req.session?.user?.id) return `user:${req.session.user.id}`;
      if (req._pzTokOk === undefined) {
        const token = extractToken(req);
        req._pzTokOk = !!(token && verifyToken(token, req));
        req._pzTok = token || null;
      }
      if (req._pzTokOk && req._pzTok) return `token:${req._pzTok.slice(0, 16)}`;
      return toIPv4(null, req);
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      updateIPReputation(toIPv4(null, req), -3);
      shield.incrementBlocked(toIPv4(null, req), 'rate_limit');
      res.status(429).json({ error: 'Too many requests' });
    }
  });
}

export function createAiLimiter(shield) {
  return rateLimit({
    windowMs: 60000,
    max: req => req.session?.user?.id ? 60 : 20,
    keyGenerator: req => req.session?.user?.id ? `user:${req.session.user.id}` : toIPv4(null, req),
    handler: (req, res) => {
      updateIPReputation(toIPv4(null, req), -3);
      shield.incrementBlocked(toIPv4(null, req), 'ai_rate_limit');
      res.status(429).json({ error: 'Too many AI requests' });
    }
  });
}