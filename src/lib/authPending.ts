export type PendingAuth = {
  type: "tor" | "movies" | "feedback" | "firefox" | "vm";
};

const KEY = "pz-pending-auth";

export function setPendingAuth(action: PendingAuth) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(action));
  } catch {}
}

export function consumePendingAuth(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed?.type === "tor" ||
      parsed?.type === "movies" ||
      parsed?.type === "feedback" ||
      parsed?.type === "firefox" ||
      parsed?.type === "vm"
    ) {
      return parsed;
    }
  } catch {}
  return null;
}
