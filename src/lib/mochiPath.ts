const KEY = "q7Zx!9pL";

export const MOCHI_PUB = "/f/g/";

function encodeMochiUrl(url: string): string {
  const e = encodeURIComponent(url);
  let x = "";
  for (let i = 0; i < e.length; i++) {
    x += String.fromCharCode(e.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  }
  return btoa(x).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  if (rest.startsWith("http://") || rest.startsWith("https://")) {
    const target = rest.replace(/\/+$/, "");
    return MOCHI_PUB + encodeMochiUrl(target) + "/";
  }
  return u;
}
