import { peerIsTrusted } from '../lib/ip.js';

export function getClientIP(req) {
  const peer = req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  let ip = peer;
  // Trust forwarding headers only from the local reverse proxy, otherwise any
  // client can set X-Forwarded-For to spoof its IP (ban evasion, rate-limit
  // bypass, framing a victim IP).
  if (peerIsTrusted(req)) {
    const xff = req.headers['x-forwarded-for'];
    if (xff && typeof xff === 'string') ip = xff.split(',')[0].trim();
  }
  if (ip && typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip || null;
}
