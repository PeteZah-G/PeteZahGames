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

export function validateUsername(username) {
  if (typeof username !== 'string') return 'Username is required.';
  const cleaned = sanitizeUsername(username);
  if (!cleaned) return 'Username is required.';
  if (cleaned.length < 3) return 'Username must be at least 3 characters.';
  if (cleaned.length > 32) return 'Username is too long.';
  if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
    return 'Username can only use letters, numbers, and underscores.';
  }
  if (/^[0-9]+$/.test(cleaned)) return 'Username cannot be only numbers.';
  return null;
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
