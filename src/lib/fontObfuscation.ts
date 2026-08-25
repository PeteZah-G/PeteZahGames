import { revealCodes } from "./mask";

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

const KEY_PACK = [
  112, 119, 120, 113, 107, 113, 116, 121, 114, 101, 105, 100, 101, 121, 109, 109, 107, 102, 103, 123,
  111, 127, 112, 103, 107, 102, 112, 96, 114, 108, 116, 124, 107, 101, 118, 102, 118, 123, 127, 113,
  99, 106, 96, 120, 99, 100, 116, 98, 126, 121, 121, 113, 99, 106, 96, 122, 117, 122, 122, 119, 124,
  115, 113, 104, 98, 120, 119, 120, 120, 117, 126, 113, 101, 106, 119, 109, 103, 119, 102, 103, 107,
  99, 123, 118, 123, 121, 118, 127, 107, 112, 124, 120, 99, 115, 103, 104, 112, 119, 120, 125, 121,
  113, 105, 117, 101, 117, 116, 112, 114, 106, 120, 123, 97, 127, 112, 103, 107, 123, 122, 98, 126,
  115, 105, 121, 98, 101, 124, 119, 107, 97, 124, 103, 103, 106, 123, 123, 96, 113, 114, 104, 101,
  121, 119, 120, 120, 110, 105, 119, 123, 121, 116, 127, 126, 120, 114,
];

let needles: string[] | null = null;

function keywordNeedles(): string[] {
  if (!needles) needles = revealCodes(KEY_PACK).split("|");
  return needles;
}

export function shouldObfuscateDisplay(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!t) return false;
  return keywordNeedles().some((n) => t.includes(n));
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
