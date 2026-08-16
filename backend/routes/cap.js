import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generateChallenge, validateChallenge } from 'capjs-core';
import { toIPv4 } from '../middleware/security.js';
import {
  getCapSecret,
  consumeCapNonce,
  storeCapToken,
  setGateCookie,
  capScope,
  cleanupCapStore,
} from '../cap/store.js';

const router = Router();

const capLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => toIPv4(null, req),
});

router.post('/challenge', capLimiter, async (_req, res) => {
  try {
    cleanupCapStore();
    const ch = await generateChallenge(getCapSecret(), {
      scope: capScope(),
      challengeCount: 32,
      challengeDifficulty: 4,
      expiresMs: 300000,
      instrumentation: {
        blockAutomatedBrowsers: true,
        obfuscationLevel: 2,
      },
    });
    res.json(ch);
  } catch (e) {
    console.error('[cap] challenge', e.message);
    res.status(500).json({ error: 'Challenge unavailable' });
  }
});

router.post('/redeem', capLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await validateChallenge(
      getCapSecret(),
      {
        token: body.token,
        solutions: body.solutions,
        instr: body.instr,
        instr_blocked: body.instr_blocked,
        instr_timeout: body.instr_timeout,
      },
      {
        scope: capScope(),
        tokenTtlMs: 1200000,
        consumeNonce: consumeCapNonce,
      }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, reason: result.reason });
    }

    storeCapToken(result.tokenKey, result.expires);
    const gate = setGateCookie(res, req);
    res.json({ success: true, token: result.token, expires: result.expires, gate });
  } catch (e) {
    console.error('[cap] redeem', e.message);
    res.status(500).json({ success: false, reason: 'server_error' });
  }
});

export default router;
