function revealCodes(codes) {
  let out = "";
  for (let i = 0; i < codes.length; i++) {
    out += String.fromCharCode(codes[i] ^ 23 ^ (i & 3));
  }
  return out;
}

const KEYWORDS = revealCodes([
  112, 119, 120, 113, 107, 113, 116, 121, 114, 101, 105, 100, 101, 121, 109, 109, 107, 102, 103, 123,
  111, 127, 112, 103, 107, 102, 112, 96, 114, 108, 116, 124, 107, 101, 118, 102, 118, 123, 127, 113,
  99, 106, 96, 120, 99, 100, 116, 98, 126, 121, 121, 113, 99, 106, 96, 122, 117, 122, 122, 119, 124,
  115, 113, 104, 98, 120, 119, 120, 120, 117, 126, 113, 101, 106, 119, 109, 103, 119, 102, 103, 107,
  99, 123, 118, 123, 121, 118, 127, 107, 112, 124, 120, 99, 115, 103, 104, 112, 119, 120, 125, 121,
  113, 105, 117, 101, 117, 116, 112, 114,
]).split("|");

const EXCLUDE =
  "script,style,noscript,code,pre,svg,svg *,textarea,option,iframe,canvas,title,head,head *,meta,link,[data-no-obfuscate],.no-obfuscate,[data-lucide],.lucide,.lucide-icon";

let maps = null;
let reverse = null;
let ready = false;

function shouldObfuscateText(text) {
  if (!text || !text.trim()) return false;
  if (/[\uE000-\uF8FF]/.test(text)) return false;
  const lower = text.toLowerCase();
  return KEYWORDS.some((k) => lower.includes(k));
}

function encode(text) {
  if (!maps || !text) return text;
  let out = "";
  for (const ch of text) out += maps[ch] || ch;
  return out;
}

function decode(text) {
  if (!reverse || !text) return text;
  let out = "";
  for (const ch of text) out += reverse[ch] || ch;
  return out;
}

function excluded(el) {
  if (!el || el.nodeType !== 1) return true;
  const tag = el.tagName;
  if (tag === "TITLE" || tag === "HEAD" || tag === "META" || tag === "LINK") return true;
  try {
    if (el.matches?.(EXCLUDE)) return true;
    if (el.closest?.(EXCLUDE)) return true;
    if (el.closest?.("head")) return true;
  } catch {
    return true;
  }
  if (el.tagName === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "password" || type === "hidden" || type === "email" || type === "url") return true;
    if (el.hasAttribute("data-no-obfuscate")) return true;
    if (el.classList?.contains("pz-url-input")) return true;
  }
  return false;
}

function mark(el) {
  if (!el || excluded(el)) return;
  el.classList.add("ob-p");
  try {
    el.style.setProperty("font-family", "plusjakartasans-obf, sans-serif", "important");
    el.style.setProperty("font-synthesis", "none", "important");
    el.style.setProperty("font-variant-ligatures", "none", "important");
  } catch {}
}

function processTextNode(node) {
  const parent = node.parentElement;
  if (!parent || excluded(parent)) return;
  if (parent.closest?.("head") || parent.tagName === "TITLE") return;
  const text = node.nodeValue;
  if (!text || !shouldObfuscateText(text)) return;
  const next = encode(text);
  if (next !== text) {
    node.nodeValue = next;
    mark(parent);
  } else if (/[\uE000-\uF8FF]/.test(text)) {
    mark(parent);
  }
}

function processElement(root) {
  if (!ready || !root) return;
  if (root.nodeType === 3) {
    processTextNode(root);
    return;
  }
  if (root.nodeType !== 1 || excluded(root)) return;
  if (root.tagName === "TITLE" || root.closest?.("head")) return;

  if (root.childNodes.length === 1 && root.childNodes[0].nodeType === 3) {
    processTextNode(root.childNodes[0]);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || excluded(p) || p.tagName === "TITLE" || p.closest?.("head")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(processTextNode);
  }

  ["placeholder", "alt"].forEach((attr) => {
    if (excluded(root)) return;
    if (root.tagName === "INPUT" && root.classList?.contains("pz-url-input")) return;
    const val = root.getAttribute?.(attr);
    if (!val || !shouldObfuscateText(val)) return;
    const enc = encode(val);
    if (enc !== val) {
      root.setAttribute(attr, enc);
      mark(root);
    }
  });
}

function sweep() {
  if (!ready || !document.body) return;
  processElement(document.body);
  document.body.classList.add("font-obfuscation-ready");
}

function setupClipboard() {
  document.addEventListener("copy", (e) => {
    if (!ready) return;
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const plain = decode(sel.toString());
      e.preventDefault();
      e.clipboardData?.setData("text/plain", plain);
    } catch {}
  });
}

async function boot() {
  try {
    const [m, r] = await Promise.all([
      fetch("/plusjakartasans-obf-mappings.json").then((x) => x.json()),
      fetch("/plusjakartasans-obf-reverse-mappings.json").then((x) => x.json()),
    ]);
    maps = m;
    reverse = r;
    ready = true;
  } catch {
    return;
  }

  if (document.fonts?.load) {
    try {
      await Promise.all([
        document.fonts.load("400 16px plusjakartasans-obf"),
        document.fonts.load("600 16px plusjakartasans-obf"),
        document.fonts.load("800 16px plusjakartasans-obf"),
      ]);
    } catch {}
  }

  setupClipboard();
  sweep();
  setTimeout(sweep, 250);
  setTimeout(sweep, 1000);

  if (typeof MutationObserver !== "undefined") {
    const mo = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.type === "characterData" && mut.target?.parentElement) {
          const p = mut.target.parentElement;
          if (p.tagName === "TITLE" || p.closest?.("head")) continue;
          processTextNode(mut.target);
        }
        mut.addedNodes?.forEach((node) => {
          if (node.nodeType === 1 && (node.tagName === "TITLE" || node.closest?.("head"))) return;
          if (node.nodeType === 1 || node.nodeType === 3) processElement(node);
        });
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  window.fontObfuscation = {
    encode,
    decode,
    sweep,
    isReady: () => ready,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    boot();
  });
} else {
  boot();
}
