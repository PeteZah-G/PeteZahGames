import db from '../db.js';
import { getClientIP } from '../utils/client-ip.js';

const WS_DENY = new Set();

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
  return !!db.prepare('SELECT 1 FROM banned_ips WHERE ip = ?').get(ip);
}

export function createIpBanMiddleware() {
  return (req, res, next) => {
    const ip = getClientIP(req);
    if (ip && isIpBanned(ip)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  };
}

export function banIp(ip, bannedBy = null) {
  if (!ip) return;
  db.prepare('INSERT OR REPLACE INTO banned_ips (ip, banned_at, banned_by) VALUES (?, ?, ?)').run(ip, Date.now(), bannedBy);
  denyWebsocketIp(ip);
}

export function unbanIp(ip) {
  if (!ip) return;
  db.prepare('DELETE FROM banned_ips WHERE ip = ?').run(ip);
  allowWebsocketIp(ip);
}
