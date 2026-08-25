export const MOCHI_PUB = "/f/g/";

function ensureDirSlash(abs: string): string {
  const q = abs.indexOf("?");
  const path = q === -1 ? abs : abs.slice(0, q);
  const query = q === -1 ? "" : abs.slice(q);
  if (path.endsWith("/")) return abs;
  const last = path.split("/").pop() || "";
  if (last.includes(".")) return abs;
  return path + "/" + query;
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
  if (rest.startsWith("hs/") || rest.startsWith("ht/")) return u;
  if (rest.startsWith("https://")) {
    return MOCHI_PUB + "hs/" + ensureDirSlash(rest.slice(8));
  }
  if (rest.startsWith("http://")) {
    return MOCHI_PUB + "ht/" + ensureDirSlash(rest.slice(7));
  }
  return u;
}
