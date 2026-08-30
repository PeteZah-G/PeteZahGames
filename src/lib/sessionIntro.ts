const KEY = "pz-browse-intro";

export function introPending(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}
