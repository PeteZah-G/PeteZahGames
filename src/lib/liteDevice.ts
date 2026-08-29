export function isLiteDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/CrOS/.test(navigator.userAgent)) return true;
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) return true;
  } catch {}
  try {
    const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof dm === "number" && dm > 0 && dm <= 4) return true;
  } catch {}
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {}
  return false;
}

export function lowPowerBackdrop(): boolean {
  try {
    if (localStorage.getItem("lowPowerBg") === "true") return true;
    if (localStorage.getItem("lowPowerBg") === "false") return false;
  } catch {}
  return isLiteDevice();
}

export function extensionPollMs(): number {
  return isLiteDevice() ? 6000 : 2500;
}

export function presenceIntervalMs(): number {
  return isLiteDevice() ? 45000 : 12000;
}

export function mutePollMs(): number {
  return isLiteDevice() ? 2000 : 700;
}
