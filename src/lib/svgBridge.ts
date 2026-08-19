import {
  clearSessionToken,
  getSiteOrigin,
  isSvgShell,
  originWsHost,
  readGateToken,
  readLegalToken,
  readSessionToken,
  storeGateToken,
  storeLegalToken,
  storeSessionToken,
  svgDirPath,
  svgDirUrl,
} from "./siteOrigin";

const LOCAL = [
  "/q9vx",
  "/m4thx",
  "/e7px",
  "/l9cx",
  "/afsd123k2",
  "/1k123.js",
  "/assets/",
  "/vendor/",
  "/fonts/",
  "/font-obfuscation.js",
  "/plusjakartasans",
  "/logo.png",
  "/og-share.png",
  "/config.js",
  "/static/",
  "/pz-vanta.js",
  "/manifest.json",
  "/favicon.ico",
];

const REMOTE = [
  "/api/",
  "/cap/",
  "/storage/",
  "/uploads/",
  "/!!/",
  "/!cover!/",
  "/firefox-wasm",
  "/terms",
  "/tos",
  "/privacy",
  "/privacy-policy",
  "/dmca",
  "/copyright",
  "/verify",
  "/embed.html",
];

function starts(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(p));
}

function isRemoteAbs(url: string) {
  const origin = getSiteOrigin();
  if (!origin) return false;
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

function onSvgDir(path: string) {
  const dir = svgDirPath();
  if (!dir || dir === "/") return false;
  return path === dir.slice(0, -1) || path.startsWith(dir);
}

export function rewriteClientUrl(raw: string): string {
  if (!isSvgShell() || !raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("javascript:")) {
    return raw;
  }
  const origin = getSiteOrigin();
  let url = raw;
  if (url.startsWith("/") && !url.startsWith("//")) {
    const path = url.split("?")[0];
    if (starts(path, REMOTE) || path.startsWith("/api") || path.startsWith("/!!/") || path.startsWith("/!cover!/")) {
      return origin + url;
    }
    if (onSvgDir(path)) {
      return new URL(url, location.origin).href;
    }
    if (starts(path, LOCAL) || path.startsWith("/")) {
      return new URL(url.slice(1), svgDirUrl()).href;
    }
    return raw;
  }
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) {
      if (onSvgDir(u.pathname)) return u.href;
      const path = u.pathname + u.search + u.hash;
      return rewriteClientUrl(path.startsWith("/") ? path : `/${path}`);
    }
  } catch {}
  return raw;
}

function attachAuth(headers: Headers) {
  headers.set("X-PZ-Svg", "1");
  const g = readGateToken();
  const l = readLegalToken();
  const s = readSessionToken();
  if (g) headers.set("X-PZ-Gate", g);
  if (l) headers.set("X-PZ-Legal", l);
  if (s) headers.set("X-PZ-Session", s);
}

function captureAuth(res: Response) {
  const loc = res.url || "";
  if (loc.includes("/api/signout")) {
    clearSessionToken();
    return Promise.resolve();
  }
  if (!isRemoteAbs(loc) && !loc.includes("/cap/") && !loc.includes("/api/")) return Promise.resolve();
  return res
    .clone()
    .json()
    .then((d) => {
      if (d && typeof d === "object") {
        if (typeof d.gate === "string") storeGateToken(d.gate);
        if (typeof d.legal === "string") storeLegalToken(d.legal);
        if (typeof d.sid === "string") storeSessionToken(d.sid);
      }
    })
    .catch(() => {});
}

function rewriteWs(raw: string) {
  let url = String(raw || "");
  if (!url) return url;
  if (url.startsWith("/") && !url.startsWith("//")) {
    url = originWsHost() + url;
  } else {
    try {
      const u = new URL(url, location.href);
      if (u.origin === location.origin && u.pathname.startsWith("/api/")) {
        url = originWsHost() + u.pathname + u.search;
      }
    } catch {}
  }
  try {
    const u = new URL(url);
    const origin = getSiteOrigin();
    if (origin && u.host === new URL(origin).host) {
      const g = readGateToken();
      const l = readLegalToken();
      if (g) u.searchParams.set("g", g);
      if (l) u.searchParams.set("l", l);
      return u.toString();
    }
  } catch {}
  return url;
}

function patchAttr(proto: any, prop: string) {
  const desc = Object.getOwnPropertyDescriptor(proto, prop);
  if (!desc?.set || !desc.get) return;
  Object.defineProperty(proto, prop, {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return desc.get!.call(this);
    },
    set(value: string) {
      try {
        desc.set!.call(this, rewriteClientUrl(String(value ?? "")));
      } catch {
        desc.set!.call(this, value);
      }
    },
  });
}

export function installSvgBridge() {
  if (!isSvgShell()) return;
  if ((window as any).__pzSvgBridge) return;
  (window as any).__pzSvgBridge = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const nextUrl = rewriteClientUrl(raw);
    let nextInput: RequestInfo | URL = input;
    const nextInit: RequestInit = { ...(init || {}) };
    if (nextUrl !== raw) {
      if (typeof input === "string") nextInput = nextUrl;
      else if (input instanceof URL) nextInput = new URL(nextUrl);
      else nextInput = new Request(nextUrl, input);
    }
    const abs = typeof nextInput === "string" ? nextInput : nextInput instanceof URL ? nextInput.href : nextInput.url;
    if (isRemoteAbs(abs)) {
      nextInit.credentials = nextInit.credentials || "include";
      const headers = new Headers(
        nextInit.headers || (nextInput instanceof Request ? nextInput.headers : undefined),
      );
      attachAuth(headers);
      nextInit.headers = headers;
    }
    return origFetch(nextInput, nextInit).then(async (res) => {
      if (/\/api\/(signin|signout|me|auth|legal)\b/.test(abs)) {
        await captureAuth(res);
      } else {
        void captureAuth(res);
      }
      return res;
    });
  };

  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    const next = rewriteClientUrl(String(url));
    (this as any).__pzUrl = next;
    return XO.call(this, method, next, rest[0], rest[1], rest[2]);
  };
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args: any[]) {
    try {
      if (isRemoteAbs((this as any).__pzUrl || "")) {
        this.setRequestHeader("X-PZ-Svg", "1");
        const g = readGateToken();
        const l = readLegalToken();
        const s = readSessionToken();
        if (g) this.setRequestHeader("X-PZ-Gate", g);
        if (l) this.setRequestHeader("X-PZ-Legal", l);
        if (s) this.setRequestHeader("X-PZ-Session", s);
      }
    } catch {}
    return XS.apply(this, args as any);
  };

  const OrigWS = window.WebSocket;
  const WrappedWS = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
    const next = rewriteWs(String(url));
    return protocols !== undefined ? new OrigWS(next, protocols) : new OrigWS(next);
  } as unknown as typeof WebSocket;
  WrappedWS.prototype = OrigWS.prototype;
  Object.setPrototypeOf(WrappedWS, OrigWS);
  window.WebSocket = WrappedWS;

  patchAttr(HTMLImageElement.prototype, "src");
  patchAttr(HTMLIFrameElement.prototype, "src");
  patchAttr(HTMLScriptElement.prototype, "src");
  patchAttr(HTMLLinkElement.prototype, "href");
  patchAttr(HTMLSourceElement.prototype, "src");
  patchAttr(HTMLVideoElement.prototype, "src");
  patchAttr(HTMLAudioElement.prototype, "src");

  const origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if ((name === "src" || name === "href") && typeof value === "string") {
      return origSet.call(this, name, rewriteClientUrl(value));
    }
    return origSet.call(this, name, value);
  };
}

installSvgBridge();
