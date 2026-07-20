import {
  toIPv4,
  systemState,
  checkCircuitBreaker,
  isTrustedRequest,
} from '../middleware/security.js';
import { isIpBanned, isWebsocketIpDenied } from '../middleware/ip-ban.js';
import db from '../db.js';

const banMemo = new Map();
const userBanMemo = new Map();
const BAN_MEMO_MS = 4000;
const USER_BAN_MEMO_MS = 10000;
const MEMO_CAP = 40000;

function trimMemo(map) {
  if (map.size <= MEMO_CAP) return;
  let n = 0;
  const drop = (map.size >> 1) | 0;
  for (const k of map.keys()) {
    map.delete(k);
    if (++n >= drop) break;
  }
}

function memoIpBanned(ip) {
  const now = Date.now();
  const hit = banMemo.get(ip);
  if (hit && now - hit.t < BAN_MEMO_MS) return hit.v;
  const v = isIpBanned(ip);
  banMemo.set(ip, { v, t: now });
  trimMemo(banMemo);
  return v;
}

function memoUserBanned(userId) {
  const now = Date.now();
  const hit = userBanMemo.get(userId);
  if (hit && now - hit.t < USER_BAN_MEMO_MS) return hit.v;
  const row = db.prepare('SELECT banned FROM users WHERE id = ?').get(userId);
  const v = !row || !!row.banned;
  userBanMemo.set(userId, { v, t: now });
  trimMemo(userBanMemo);
  return v;
}

function baseGate(req) {
  const ip = toIPv4(null, req);
  if (!ip || isWebsocketIpDenied(ip) || memoIpBanned(ip) || checkCircuitBreaker(ip, null)) {
    return 403;
  }
  if (systemState.state === 'ATTACK' && !isTrustedRequest(req)) {
    return 403;
  }
  return 0;
}

export function websocketNormalHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', '0');
  const code = baseGate(req);
  if (code) return res.status(code).end();
  return res.status(200).end();
}

export function websocketTorHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', '0');
  const code = baseGate(req);
  if (code) return res.status(code).end();
  const user = req.session?.user;
  if (!user?.id) return res.status(401).end();
  if (memoUserBanned(user.id)) return res.status(403).end();
  return res.status(200).end();
}
