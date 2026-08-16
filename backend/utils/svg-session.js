import { createRequire } from 'module';
import { isJsdelivrOrigin } from '../middleware/http-security.js';

const require = createRequire(import.meta.url);
const signature = require('cookie-signature');

const COOKIE = 'pz.sid';

function secret() {
  return process.env.SESSION_SECRET || '';
}

export function signSessionCookie(sessionID) {
  const s = secret();
  if (!s || !sessionID || typeof sessionID !== 'string') return '';
  try {
    return `s:${signature.sign(sessionID, s)}`;
  } catch {
    return '';
  }
}

export function injectSvgSessionCookie(req, _res, next) {
  const raw = req.get('X-PZ-Session');
  if (!raw || typeof raw !== 'string') return next();
  const token = raw.trim();
  if (!token.startsWith('s:') || token.length < 12 || token.length > 512) return next();
  const s = secret();
  if (!s) return next();
  try {
    if (signature.unsign(token.slice(2), s) === false) return next();
  } catch {
    return next();
  }
  const encoded = encodeURIComponent(token);
  const rest = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${COOKIE}=`));
  req.headers.cookie = [`${COOKIE}=${encoded}`, ...rest].join('; ');
  next();
}

export function attachSvgSessionSid() {
  return (req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body) => {
      const path = String(req.path || '');
      const svg =
        isJsdelivrOrigin(req.headers.origin) || String(req.get('X-PZ-Svg') || '') === '1';
      if (
        svg &&
        req.sessionID &&
        !path.startsWith('/api/signout') &&
        body &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        typeof body.sid !== 'string'
      ) {
        const sid = signSessionCookie(req.sessionID);
        if (sid) body = { ...body, sid };
      }
      return orig(body);
    };
    next();
  };
}
