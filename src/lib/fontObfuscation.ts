export function obfuscateDisplayText(text: string, maps: Record<string, string> | null): string {
  if (!maps || !text) return text;
  let out = "";
  for (const ch of text) out += maps[ch] || ch;
  return out;
}

export function deobfuscateDisplayText(text: string, reverse: Record<string, string> | null): string {
  if (!reverse || !text) return text;
  let out = "";
  for (const ch of text) out += reverse[ch] || ch;
  return out;
}

const KEYWORD_RE =
  /games?|proxy|proxies|petezah|scramjet|ultraviolet|unblocked|unblocker|bypass|unblock|filter|gaming|arcade/i;

export function shouldObfuscateDisplay(text: string): boolean {
  return KEYWORD_RE.test(text || "");
}

let cachedMaps: Record<string, string> | null = null;
let cachedReverse: Record<string, string> | null = null;
let loadPromise: Promise<void> | null = null;

export function loadFontMaps(): Promise<void> {
  if (cachedMaps && cachedReverse) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    fetch("/plusjakartasans-obf-mappings.json").then((r) => r.json()),
    fetch("/plusjakartasans-obf-reverse-mappings.json").then((r) => r.json()),
  ])
    .then(([m, r]) => {
      cachedMaps = m;
      cachedReverse = r;
    })
    .catch(() => {});
  return loadPromise;
}

export function getFontMaps() {
  return { maps: cachedMaps, reverse: cachedReverse };
}

export function displayUrlForBar(url: string, focused: boolean): string {
  if (focused || !url) return url;
  if (!shouldObfuscateDisplay(url)) return url;
  if (!cachedMaps) return url;
  return obfuscateDisplayText(url, cachedMaps);
}
