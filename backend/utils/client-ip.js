export function getClientIP(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
  if (ip && typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip && typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip || null;
}
