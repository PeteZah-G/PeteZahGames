const ORIGIN_KEY = "__PZ_ORIGIN__";
const GATE_KEY = "pz_gate";
const LEGAL_KEY = "pz_legal";
const SESSION_KEY = "pz_sid";

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

export function getSiteOrigin(): string {
  try {
    const raw = (window as any)[ORIGIN_KEY];
    if (typeof raw === "string" && /^https:\/\/[a-z0-9.-]+/i.test(raw)) {
      return trimSlash(raw);
    }
  } catch {}
  return "";
}

export function isSvgShell(): boolean {
  return !!getSiteOrigin();
}

export function svgDirUrl(): string {
  try {
    return new URL(".", window.location.href).href;
  } catch {
    return window.location.href;
  }
}

export function svgDirPath(): string {
  try {
    const p = new URL(".", window.location.href).pathname;
    return p.endsWith("/") ? p : `${p}/`;
  } catch {
    return "/";
  }
}

export function readGateToken(): string {
  try {
    return localStorage.getItem(GATE_KEY) || "";
  } catch {
    return "";
  }
}

export function readLegalToken(): string {
  try {
    return localStorage.getItem(LEGAL_KEY) || "";
  } catch {
    return "";
  }
}

export function storeGateToken(value: string) {
  if (!value || typeof value !== "string" || value.length > 512) return;
  try {
    localStorage.setItem(GATE_KEY, value);
  } catch {}
}

export function storeLegalToken(value: string) {
  if (!value || typeof value !== "string" || value.length > 512) return;
  try {
    localStorage.setItem(LEGAL_KEY, value);
  } catch {}
}

export function readSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function storeSessionToken(value: string) {
  if (!value || typeof value !== "string" || !value.startsWith("s:") || value.length > 512) return;
  try {
    localStorage.setItem(SESSION_KEY, value);
  } catch {}
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function originWsHost(): string {
  const origin = getSiteOrigin();
  if (origin) {
    const u = new URL(origin);
    return `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
  }
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
}

export function originHttpHost(): string {
  return getSiteOrigin() || `${location.protocol}//${location.host}`;
}
