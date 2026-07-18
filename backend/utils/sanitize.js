export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUsername(username) {
  if (typeof username !== 'string') return '';
  return username
    .replace(/[<>"'&`\\/]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, 32);
}

export function safeAvatarUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  if (url.startsWith('/uploads/avatars/')) return url;
  return null;
}

export function displayUsername(username, email) {
  if (typeof username === 'string' && username.trim()) return username.trim();
  if (email && typeof email === 'string') {
    const at = email.indexOf('@');
    return at > 0 ? email.slice(0, at) : email;
  }
  return 'Anonymous';
}

export function sanitizeTextContent(content) {
  if (typeof content !== 'string') return '';
  return content.replace(/\x00/g, '').trim();
}
