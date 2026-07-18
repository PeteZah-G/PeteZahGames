import { Router } from 'express';
import { randomBytes, createHmac } from 'crypto';
import rateLimit from 'express-rate-limit';
import { toIPv4, createToken, verifyToken, extractToken, systemState, TOKEN_SECRET, checkSystemPressure } from '../middleware/security.js';

const router = Router();

router.get(
  '/bot-challenge',
  rateLimit({ windowMs: 60000, max: 15, keyGenerator: req => toIPv4(null, req) }),
  (req, res) => {
    const ip = toIPv4(null, req);
    const lastSolve = systemState.lastPowSolve.get(ip);
    const recentlySolved = lastSolve && Date.now() - lastSolve < 3600000;
    const difficulty = recentlySolved ? 16 : systemState.currentPowDifficulty;
    res.json({ challenge: randomBytes(16).toString('hex'), difficulty });
  }
);

router.post('/bot-verify', (req, res) => {
  const { challenge, nonce, timing } = req.body || {};
  if (!challenge || nonce === undefined || !timing) return res.status(400).json({ error: 'Invalid proof' });

  const hash = createHmac('sha256', challenge).update(String(nonce)).digest('hex');
  const leading = hash.match(/^0+/)?.[0].length || 0;
  const required = Math.floor(systemState.currentPowDifficulty / 4);
  const timingOk = timing > 10 && timing < 60000;

  if (leading >= required && timingOk) {
    const ip = toIPv4(null, req);
    const fp = createHmac('sha256', TOKEN_SECRET).update(ip + (req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
    const token = createToken({ http: true, ws: true, fp });
    systemState.lastPowSolve.set(ip, Date.now());
    systemState.trustedClients.add(fp);
    res.cookie('bot_token', token, { maxAge: 3600000, httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' });
    return res.json({ success: true, token });
  }

  res.status(403).json({ error: 'Verification failed' });
});

export default router;