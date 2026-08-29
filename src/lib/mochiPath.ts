export const MOCHI_PUB = "/f/g/";

function withIndex(hostPath: string): string {
  const q = hostPath.indexOf("?");
  let path = q === -1 ? hostPath : hostPath.slice(0, q);
  const query = q === -1 ? "" : hostPath.slice(q);
  const last = path.split("/").filter(Boolean).pop() || "";
  if (/\.[a-z0-9]{1,8}$/i.test(last)) return hostPath;
  if (!path.endsWith("/")) path += "/";
  return path + "index.html" + query;
}

export function isMochiHref(raw: string): boolean {
  const u = String(raw || "");
  return u.includes("/f/g/") || u.includes("/n/m/") || u.includes("/!!/");
}

export function publicMochiHref(raw: string): string {
  let u = String(raw || "").trim();
  if (!u) return u;
  u = u.split("/!!/").join(MOCHI_PUB).split("/n/m/").join(MOCHI_PUB);
  if (!u.startsWith(MOCHI_PUB)) return u;
  const rest = u.slice(MOCHI_PUB.length);
  if (rest.startsWith("hs/")) return MOCHI_PUB + "hs/" + withIndex(rest.slice(3));
  if (rest.startsWith("ht/")) return MOCHI_PUB + "ht/" + withIndex(rest.slice(3));
  if (rest.startsWith("https://")) return MOCHI_PUB + "hs/" + withIndex(rest.slice(8));
  if (rest.startsWith("http://")) return MOCHI_PUB + "ht/" + withIndex(rest.slice(7));
  return u;
}

export type GameVia = "fg" | "ve";

export function normalizeGameVia(raw: unknown): GameVia {
  return raw === "fg" ? "fg" : "ve";
}

export function fgHrefFromRemote(raw: string): string {
  let u = String(raw || "").trim();
  if (!u) return u;
  if (isMochiHref(u)) return publicMochiHref(u);
  if (u.startsWith("/storage/") || u.startsWith("/iframe")) return u;
  try {
    if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return u;
    const tail = parsed.host + (parsed.pathname || "/") + parsed.search + parsed.hash;
    if (parsed.protocol === "http:") return publicMochiHref(MOCHI_PUB + "ht/" + tail);
    return publicMochiHref(MOCHI_PUB + "hs/" + tail);
  } catch {
    return u;
  }
}
