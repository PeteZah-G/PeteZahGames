let shieldRef = null;

export function setShieldRef(shield) {
  shieldRef = shield || null;
}

export function getShield() {
  return shieldRef;
}
