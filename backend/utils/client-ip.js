export function getClientIP(req) {
  // cf-connecting-ip comes from cloudflare's edge, a client can't forge it.
  // x-forwarded-for can be set by anyone hitting the origin directly, only
  // fall back to it if there's no cf header to trust instead.
  let ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    null;
  if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip && typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip || null;
}
