import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import fetch from 'node-fetch';
import { blockIPKernel } from '../security/xdp-integration.js';

export let TOKEN_SECRET = process.env.TOKEN_SECRET || '';
const TOKEN_VALIDITY = 3600000;
const BASE_POW_DIFFICULTY = 16;
const MAX_POW_DIFFICULTY = 22;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
const MAX_HEADER_SIZE = 16384;
const CPU_THRESHOLD = 75;

export const systemState = {
  state: 'NORMAL',
  cpuHigh: false,
  activeConnections: 0,
  totalWS: 0,
  totalRequests: 0,
  lastCheck: Date.now(),
  currentPowDifficulty: BASE_POW_DIFFICULTY,
  lastDifficultyAdjust: Date.now(),
  trustedClients: new Set(),
  lastPowSolve: new Map(),
  requestRatePerMinute: 0
};

const ipReputation = new Map();
const circuitBreakers = new Map();
const requestFingerprints = new Map();
const botVerificationCache = new Map();
const requestRateTracker = { requests: [] };

export function toIPv4(ip, req = null) {
  if (req) {
    const xff = req.headers['x-forwarded-for'];
    const cf = req.headers['cf-connecting-ip'];
    const real = req.headers['x-real-ip'];
    if (xff) ip = xff.split(',')[0].trim();
    else if (cf) ip = cf;
    else if (real) ip = real;
    else if (req.socket?.remoteAddress) ip = req.socket.remoteAddress;
  }
  if (!ip) return '127.0.0.1';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ? ip : '127.0.0.1';
}

export function createToken(features = { http: true, ws: true }) {
  const now = Date.now();
  const payload = JSON.stringify({ iat: now, exp: now + TOKEN_VALIDITY, features });
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyToken(token, req) {
  if (!token || typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    if (parts[0].length > 512 || parts[1].length > 128) return null;
    const payload = Buffer.from(parts[0], 'base64url').toString('utf8');
    if (payload.length > 1024) return null;
    const expected = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
    if (parts[1].length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
    const data = JSON.parse(payload);
    if (!data.iat || !data.exp) return null;
    if (data.exp < Date.now()) return null;
    if (data.iat > Date.now() + 1000) return null;
    if (data.exp - data.iat > TOKEN_VALIDITY + 1000) return null;
    if (req && data.fp) {
      const ip = toIPv4(null, req);
      const ua = req.headers['user-agent'] || '';
      const fp = createHmac('sha256', TOKEN_SECRET).update(ip + ua).digest('hex').slice(0, 16);
      if (data.fp.length !== fp.length) return null;
      if (!timingSafeEqual(Buffer.from(data.fp), Buffer.from(fp))) return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const match = req.headers.cookie?.match(/bot_token=([^;]+)/);
  return match ? match[1] : null;
}

export function createFingerprint(req) {
  const ip = toIPv4(null, req);
  const data = [ip, req.headers['user-agent'] || '', req.headers['accept'] || '', req.headers['accept-language'] || '', req.headers['accept-encoding'] || ''].join(':');
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

export function updateIPReputation(ip, score) {
  const current = ipReputation.get(ip) || { score: 0, lastSeen: 0, violations: [] };
  current.score += score;
  current.lastSeen = Date.now();
  if (score < 0) {
    current.violations.push({ time: Date.now(), score });
    if (current.violations.length > 50) current.violations.shift();
  }
  ipReputation.set(ip, current);
  if (current.score < -100) {
    circuitBreakers.set(ip, { open: true, until: Date.now() + 3600000, violations: current.violations.length });
  }
}

export function checkCircuitBreaker(ip, shield) {
  const breaker = circuitBreakers.get(ip);
  if (!breaker) return false;
  if (breaker.open && Date.now() > breaker.until) {
    circuitBreakers.delete(ip);
    return false;
  }
  if (breaker.open && !breaker.xdpBlocked && breaker.violations > 100 && systemState.state === 'ATTACK' && !systemState.cpuHigh) {
    breaker.xdpBlocked = true;
    blockIPKernel(ip, shield).then(ok => {
      if (ok) shield?.sendLog(`🛡️ **XDP ENGAGED**: ${ip}`, null);
    }).catch(console.error);
  }
  return breaker.open;
}

export function isTrustedRequest(req) {
  const token = extractToken(req);
  const tokenData = verifyToken(token, req);
  const fp = createFingerprint(req);
  return !!(tokenData?.features?.http || req.session?.user || systemState.trustedClients.has(fp));
}

export function isTrustedWS(req) {
  const token = extractToken(req);
  const tokenData = verifyToken(token, req);
  const fp = createFingerprint(req);
  return !!(tokenData?.features?.ws || systemState.trustedClients.has(fp));
}

const KNOWN_BOTS = {
  googlebot: ['.googlebot.com.', '.google.com.'],
  bingbot: ['.search.msn.com.'],
  duckduckbot: ['.duckduckgo.com.'],
  slurp: ['.crawl.yahoo.net.'],
  baiduspider: ['.crawl.baidu.com.', '.crawl.baidu.jp.'],
  yandexbot: ['.yandex.com.', '.yandex.ru.', '.yandex.net.'],
  facebookexternalhit: ['.facebook.com.', '.fbsv.net.'],
  twitterbot: ['.twitter.com.'],
  discordbot: ['.discord.com.'],
  telegrambot: ['.telegram.org.'],
  whatsapp: ['.facebook.com.', '.whatsapp.net.'],
  linkedinbot: ['.linkedin.com.'],
  slackbot: ['.slack.com.'],
  'archive.org_bot': ['.archive.org.'],
  ia_archiver: ['.archive.org.'],
  semrushbot: ['.semrush.com.'],
  ahrefsbot: ['.ahrefs.com.'],
  mj12bot: ['.mj12bot.com.'],
  dotbot: ['.opensiteexplorer.org.', '.moz.com.']
};

export async function verifyLegitimateBot(ua, ip) {
  const cacheKey = `${ip}:${ua}`;
  const cached = botVerificationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000) return cached.isLegit;

  let isLegit = false;
  let expectedDomains = [];
  for (const [name, domains] of Object.entries(KNOWN_BOTS)) {
    if (new RegExp(name, 'i').test(ua)) { expectedDomains = domains; break; }
  }
  if (expectedDomains.length === 0) {
    botVerificationCache.set(cacheKey, { isLegit: false, timestamp: Date.now() });
    return false;
  }
  try {
    const res = await fetch(`https://dns.google/resolve?name=${ip.split('.').reverse().join('.')}.in-addr.arpa&type=PTR`, { timeout: 2000 });
    const data = await res.json();
    const ptr = data.Answer?.find(a => a.type === 12)?.data;
    if (ptr) isLegit = expectedDomains.some(d => ptr.includes(d));
  } catch { isLegit = false; }

  botVerificationCache.set(cacheKey, { isLegit, timestamp: Date.now() });
  return isLegit;
}

export function checkSystemPressure(shield) {
  const now = Date.now();
  if (now - systemState.lastCheck < 1000) return systemState.cpuHigh;
  systemState.lastCheck = now;

  requestRateTracker.requests.push(now);
  requestRateTracker.requests = requestRateTracker.requests.filter(t => now - t < 60000);
  systemState.requestRatePerMinute = requestRateTracker.requests.length;

  const cpuUsage = shield.getCpuUsage();
  const blockRate = shield.getRecentBlockRate();
  const blockRatio = systemState.totalRequests > 0 ? blockRate / systemState.totalRequests : 0;

  if (cpuUsage > 36 && blockRatio > 0.3 && systemState.state !== 'ATTACK') systemState.state = 'ATTACK';
  else if (cpuUsage > 33 && blockRatio <= 0.3 && systemState.state === 'NORMAL') systemState.state = 'BUSY';
  else if (cpuUsage <= 33 && systemState.state !== 'NORMAL') systemState.state = 'NORMAL';

  systemState.cpuHigh = cpuUsage > CPU_THRESHOLD || systemState.activeConnections > 25000;
  systemState.totalRequests = 0;
  return systemState.cpuHigh;
}

export function adjustPowDifficulty(shield) {
  const now = Date.now();
  if (now - systemState.lastDifficultyAdjust < 10000) return;
  systemState.lastDifficultyAdjust = now;

  const { uniqueIps } = shield.getChallengeSpike();
  const blockRate = shield.getRecentBlockRate();
  const isAttack = systemState.state === 'ATTACK';

  let target = BASE_POW_DIFFICULTY;
  if (isAttack && uniqueIps > 100) target = MAX_POW_DIFFICULTY;
  else if (isAttack) target = 20;
  else if (uniqueIps > 200 && blockRate > 20) target = 18;

  target = Math.min(Math.max(target, BASE_POW_DIFFICULTY), MAX_POW_DIFFICULTY);
  if (target > systemState.currentPowDifficulty) systemState.currentPowDifficulty = target;
  else if (target < systemState.currentPowDifficulty) systemState.currentPowDifficulty = Math.max(systemState.currentPowDifficulty - 1, BASE_POW_DIFFICULTY);
}

const BOT_PATTERNS = [/googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i, /yandexbot/i, /facebookexternalhit/i, /twitterbot/i, /discordbot/i, /telegrambot/i, /whatsapp/i, /linkedinbot/i, /slackbot/i, /archive\.org_bot/i, /ia_archiver/i, /semrushbot/i, /ahrefsbot/i, /mj12bot/i, /dotbot/i];

const OPEN_PATHS = new Set(['/api/signin', '/api/signup', '/api/bot-challenge', '/api/bot-verify', '/api/verify-email', '/api/verify-email/resend', '/api/me', '/api/signout', '/api/comments', '/api/likes', '/api/changelog', '/api/presence', '/api/announcements/active', '/api/websocket/normal', '/api/websocket/normal/', '/api/websocket/tor', '/api/websocket/tor/']);

function needsToken(reqPath) {
  if (OPEN_PATHS.has(reqPath)) return false;
  if (reqPath.startsWith('/api/generate')) return false;
  if (reqPath.startsWith('/api/admin')) return false;
  if (reqPath.startsWith('/api/comment')) return false;
  if (reqPath.startsWith('/api/likes')) return false;
  if (reqPath.startsWith('/api/feedback')) return false;
  if (reqPath.startsWith('/api/changelog')) return false;
  if (reqPath.startsWith('/api/settings')) return false;
  if (reqPath.startsWith('/api/me')) return false;
  if (reqPath.startsWith('/api/websocket/')) return false;
  return false;
}

export function createGateMiddleware(shield) {
  return async (req, res, next) => {
    systemState.totalRequests++;
    const ip = toIPv4(null, req);
    const ua = req.headers['user-agent'] || '';

    if (checkCircuitBreaker(ip, shield)) {
      shield.incrementBlocked(ip, 'circuit_open');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const botMatch = BOT_PATTERNS.find(p => p.test(ua));
    if (botMatch) {
      const verified = await verifyLegitimateBot(ua, ip);
      if (!verified) { shield.incrementBlocked(ip, 'fake_bot'); return res.status(403).json({ error: 'Forbidden' }); }
      return next();
    }

    if (systemState.state === 'ATTACK' && !isTrustedRequest(req)) {
      shield.incrementBlocked(ip, 'attack_block');
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }

    next();
  };
}

export function createMemoryProtection(shield) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > MAX_REQUEST_SIZE) {
      updateIPReputation(toIPv4(null, req), -10);
      shield.incrementBlocked(toIPv4(null, req), 'payload_oversized');
      return res.status(413).json({ error: 'Request too large' });
    }
    const totalHeaderSize = Object.entries(req.headers).reduce((sum, [k, v]) => sum + k.length + (Array.isArray(v) ? v.join('').length : String(v).length), 0);
    if (totalHeaderSize > MAX_HEADER_SIZE) {
      updateIPReputation(toIPv4(null, req), -15);
      shield.incrementBlocked(toIPv4(null, req), 'header_oversized');
      return res.status(431).json({ error: 'Headers too large' });
    }
    const ua = req.headers['user-agent'];
    if (!ua || (typeof ua === 'string' && ua.length < 8)) {
      updateIPReputation(toIPv4(null, req), -2);
    }
    next();
  };
}

export function cleanupSecurityMaps() {
  const now = Date.now();
  for (const [k, v] of requestFingerprints.entries()) { if (now - v.lastSeen > 300000) requestFingerprints.delete(k); }
  for (const [ip, rep] of ipReputation.entries()) { if (now - rep.lastSeen > 3600000) ipReputation.delete(ip); }
  for (const [ip, b] of circuitBreakers.entries()) { if (b.open && now > b.until) circuitBreakers.delete(ip); }
  for (const [k, v] of botVerificationCache.entries()) { if (now - v.timestamp > 3600000) botVerificationCache.delete(k); }
  if (systemState.trustedClients.size > 10000) systemState.trustedClients.clear();
  for (const [ip, t] of systemState.lastPowSolve.entries()) { if (now - t > 86400000) systemState.lastPowSolve.delete(ip); }
}