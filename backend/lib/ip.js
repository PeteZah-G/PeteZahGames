export function toIPv4(ip, req = null) {
  if (req) {
    const xff = req.headers['x-forwarded-for'];
    const cf = req.headers['cf-connecting-ip'];
    const real = req.headers['x-real-ip'];
    if (xff) ip = xff.split(',')[0].trim();
    else if (cf) ip = cf;
    else if (real) ip = real;
    else ip = req.socket?.remoteAddress || req.connection?.remoteAddress;
  }
  if (!ip) return '127.0.0.1';
  if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ? ip : '127.0.0.1';
}