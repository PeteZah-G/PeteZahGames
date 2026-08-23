const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Only honor client-supplied forwarding headers when the direct TCP peer is the
// local reverse proxy. Matches Express `trust proxy` = ['127.0.0.1','::1'] and
// wisp parse_real_ip_from. Without this, any client can spoof X-Forwarded-For /
// CF-Connecting-IP / X-Real-IP to evade IP bans, defeat IP rate limits, or pin
// their traffic onto a victim IP. If node is ever fronted directly by a remote
// CDN, add that edge's ranges here instead of trusting the header blindly.
export function peerIsTrusted(req) {
  const peer = req?.socket?.remoteAddress || req?.connection?.remoteAddress || '';
  return LOOPBACK_PEERS.has(peer);
}

export function toIPv4(ip, req = null) {
  if (req) {
    const peer = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (peerIsTrusted(req)) {
      const xff = req.headers['x-forwarded-for'];
      const cf = req.headers['cf-connecting-ip'];
      const real = req.headers['x-real-ip'];
      if (xff) ip = xff.split(',')[0].trim();
      else if (cf) ip = cf;
      else if (real) ip = real;
      else ip = peer;
    } else {
      ip = peer;
    }
  }
  if (!ip) return '127.0.0.1';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ? ip : '127.0.0.1';
}