export function getOwnerEmail() {
  return (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
}

export function isOwnerEmail(email) {
  const owner = getOwnerEmail();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}

export function roleLabel(isAdmin, isOwner = false) {
  if (isOwner) return 'Owner';
  if (isAdmin >= 3) return 'Admin';
  if (isAdmin >= 2) return 'Staff';
  if (isAdmin >= 1) return 'Mod';
  return 'User';
}
