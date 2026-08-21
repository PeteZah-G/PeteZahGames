import db from '../db.js';
import { getClientIP } from '../utils/client-ip.js';

const WS_DENY = new Set();
const banMemo = new Map();
const BAN_MEMO_MS = 8000;
const MEMO_CAP = 40000;

function trimMemo() {
  if (banMemo.size <= MEMO_CAP) return;
  let n = 0;
  const drop = (banMemo.size >> 1) | 0;
  for (const k of banMemo.keys()) {
    banMemo.delete(k);
    if (++n >= drop) break;
  }
}

export function denyWebsocketIp(ip) {
  if (ip) WS_DENY.add(ip);
}

export function allowWebsocketIp(ip) {
  if (ip) WS_DENY.delete(ip);
}

export function isWebsocketIpDenied(ip) {
  return !!(ip && WS_DENY.has(ip));
}

export function isIpBanned(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hit = banMemo.get(ip);
  if (hit && now - hit.t < BAN_MEMO_MS) return hit.v;
  const v = !!db.prepare('SELECT 1 FROM banned_ips WHERE ip = ?').get(ip);
  banMemo.set(ip, { v, t: now });
  trimMemo();
  return v;
}

export function createIpBanMiddleware() {
  return (req, res, next) => {
    const ip = getClientIP(req);
    if (ip && isIpBanned(ip)) {
      return res.status(403).json({ error: 'Access denied.  You have been banned for violating our terms of service, please do not enter the site again.' });
    }
    next();
  };
}

export function banIp(ip, bannedBy = null) {
  if (!ip) return;
  db.prepare('INSERT OR REPLACE INTO banned_ips (ip, banned_at, banned_by) VALUES (?, ?, ?)').run(ip, Date.now(), bannedBy);
  banMemo.set(ip, { v: true, t: Date.now() });
  denyWebsocketIp(ip);
}

export function unbanIp(ip) {
  if (!ip) return;
  db.prepare('DELETE FROM banned_ips WHERE ip = ?').run(ip);
  banMemo.set(ip, { v: false, t: Date.now() });
  allowWebsocketIp(ip);
}
