import { playLoaderNetworkAds, scrubAdsterraLoadingArtifacts } from "@/components/ads/Adsterra";

const CONTAINER_ID = "pz-adcash-root";
const VAST_ZONE = "11946186";
const VAST_HOSTS = [
  "https://youradexchange.com/video/select.php",
  "https://www.youradexchange.com/video/select.php",
];
const AUTOTAG_ZONE = "tppnjjrirm";
const AUTOTAG_HOST_ID = "pz-ac-autotag-host";
const AUTOTAG_BLEED_RE =
  /acscdn\.com|adbpage\.com|adcash|youradexchange|pz-media-kit|aclib|tppnjjrirm/i;
const CONTENT_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const AD_MIN_MS = 30000;
const AD_MAX_MS = 60000;
const FILL_WAIT_MS = 12000;
const VAST_RETRIES = 2;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 2;
const PLAYS_KEY = "pz-video-ad-ok";
const PLAYER_W = 640;
const PLAYER_H = 360;

declare global {
  interface Window {
    videojs?: any;
    google?: any;
    aclib?: any;
  }
}

let playerAssets: Promise<void> | null = null;
let playGen = 0;
let activePlayer: any = null;
let activeContext: "game" | "app" | "vm" = "game";
let activeAdsManager: any = null;
let activeAdsLoader: any = null;
let autotagLive = false;

function readPlays(): number[] {
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.map(Number).filter((t) => Number.isFinite(t) && now - t < WINDOW_MS);
  } catch {
    return [];
  }
}

function clientCanPlay() {
  return readPlays().length < MAX_PER_WINDOW;
}

function recordPlay() {
  try {
    const next = [...readPlays(), Date.now()].slice(-8);
    localStorage.setItem(PLAYS_KEY, JSON.stringify(next));
  } catch {}
}

function markShown() {
  recordPlay();
  fetch("/api/ads/shown", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: activeContext }),
  }).catch(() => {});
}

function pickDurationMs() {
  return AD_MIN_MS + Math.floor(Math.random() * (AD_MAX_MS - AD_MIN_MS + 1));
}

function buildVastUrl(host: string) {
  const u = new URL(host);
  u.searchParams.set("r", VAST_ZONE);
  u.searchParams.set("cb", String(Date.now()));
  u.searchParams.set("correlator", String(Math.floor(Math.random() * 1e12)));
  try {
    u.searchParams.set("url", location.href.slice(0, 500));
    u.searchParams.set("pageurl", location.href.slice(0, 500));
    u.searchParams.set("referrer", (document.referrer || location.origin).slice(0, 500));
  } catch {}
  return u.toString();
}

function loadCss(href: string) {
  if (document.querySelector(`link[data-pz-ad="${href}"]`)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.pzAd = href;
    l.onload = () => resolve();
    l.onerror = () => resolve();
    document.head.appendChild(l);
  });
}

function loadScript(src: string, id?: string) {
  const existing = id
    ? (document.getElementById(id) as HTMLScriptElement | null)
    : (document.querySelector(`script[data-pz-ad="${src}"]`) as HTMLScriptElement | null);
  if (existing) {
    if (existing.dataset.pzAdLoaded === "1") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const ok = () => resolve();
      const bad = () => reject(new Error(src));
      existing.addEventListener("load", ok, { once: true });
      existing.addEventListener("error", bad, { once: true });
      window.setTimeout(() => (existing.dataset.pzAdLoaded === "1" ? ok() : bad()), 5000);
    });
  }
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    if (id) s.id = id;
    s.dataset.pzAd = src;
    s.onload = () => {
      s.dataset.pzAdLoaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(src));
    document.head.appendChild(s);
  });
}

function destroyAutotagBehindAd() {
  autotagLive = false;
  try {
    const host = document.getElementById(AUTOTAG_HOST_ID);
    if (host) {
      const frame = host.querySelector("iframe");
      if (frame) {
        try {
          (frame as HTMLIFrameElement).srcdoc = "<!DOCTYPE html><html><body></body></html>";
          (frame as HTMLIFrameElement).src = "about:blank";
        } catch {}
      }
      host.remove();
    }
  } catch {}

  try {
    for (const el of Array.from(document.body.children)) {
      if (el.id === "root" || el.id === "app" || el.id === CONTAINER_ID) continue;
      if (el.id === AUTOTAG_HOST_ID) {
        try {
          el.remove();
        } catch {}
        continue;
      }
      const tag = el.tagName;
      if (tag === "SCRIPT") {
        const src = (el as HTMLScriptElement).src || "";
        if (AUTOTAG_BLEED_RE.test(src) && !src.includes("ima3") && !src.includes("video")) {
          try {
            el.remove();
          } catch {}
        }
        continue;
      }
      if (tag !== "IFRAME" && tag !== "DIV" && tag !== "INS" && tag !== "SECTION") continue;
      const html = (el as HTMLElement).outerHTML?.slice(0, 2500) || "";
      const src = tag === "IFRAME" ? (el as HTMLIFrameElement).src || "" : "";
      if (!AUTOTAG_BLEED_RE.test(html) && !AUTOTAG_BLEED_RE.test(src)) continue;
      try {
        const style = window.getComputedStyle(el);
        const fixed =
          style.position === "fixed" ||
          style.position === "sticky" ||
          el.parentElement === document.body;
        if (fixed) el.remove();
      } catch {
        try {
          el.remove();
        } catch {}
      }
    }
  } catch {}
}

function startAutotagBehindAd() {
  if (autotagLive) return;
  destroyAutotagBehindAd();
  autotagLive = true;

  const vendor = `${location.origin}/vendor/pz-media-kit.js`;
  const remote = "https://acscdn.com/script/aclib.js";
  const zone = AUTOTAG_ZONE;

  const host = document.createElement("div");
  host.id = AUTOTAG_HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483645;pointer-events:none;overflow:hidden;background:transparent;";

  const frame = document.createElement("iframe");
  frame.title = "Advertisement";
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-popups allow-popups-to-escape-sandbox"
  );
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:auto;background:transparent;";
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}</style></head><body>
<script>
(function(){
  var zone=${JSON.stringify(zone)};
  var sources=${JSON.stringify([vendor, remote])};
  var i=0;
  function run(){
    var lib=window.aclib;
    if(!lib)return false;
    var names=["runAutoTag","runVideoSlider","runInterstitial","runPop"];
    for(var n=0;n<names.length;n++){
      var fn=lib[names[n]];
      if(typeof fn!=="function")continue;
      try{fn.call(lib,{zoneId:zone});return true;}catch(e){}
      try{fn({zoneId:zone});return true;}catch(e){}
    }
    try{
      for(var k in lib){
        if(!/auto|video|tag|slider|interstitial/i.test(k))continue;
        if(typeof lib[k]!=="function")continue;
        try{lib[k].call(lib,{zoneId:zone});return true;}catch(e){}
        try{lib[k]({zoneId:zone});return true;}catch(e){}
      }
    }catch(e){}
    return false;
  }
  function next(){
    if(run())return;
    if(i>=sources.length)return;
    var s=document.createElement("script");
    s.src=sources[i++];
    s.onload=function(){ if(!run()) setTimeout(next,40); };
    s.onerror=function(){ next(); };
    document.head.appendChild(s);
  }
  next();
})();
<\/script>
</body></html>`;

  host.appendChild(frame);
  document.body.appendChild(host);
}

function loadPlayerStack(): Promise<void> {
  if (window.google?.ima) return Promise.resolve();
  if (playerAssets) return playerAssets;
  playerAssets = (async () => {
    await Promise.all([
      loadCss("https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video-js.min.css"),
      loadCss("https://cdn.jsdelivr.net/npm/videojs-contrib-ads@7.5.2/dist/videojs.ads.min.css"),
      loadCss("https://cdn.jsdelivr.net/npm/videojs-ima@2.3.0/dist/videojs.ima.min.css"),
    ]);
    await loadScript("https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video.min.js");
    await loadScript("https://imasdk.googleapis.com/js/sdkloader/ima3.js");
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/videojs-contrib-ads@7.5.2/dist/videojs.ads.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/videojs-ima@2.3.0/dist/videojs.ima.min.js");
    } catch {}
    if (!window.google?.ima) throw new Error("ima");
  })().catch((e) => {
    playerAssets = null;
    throw e;
  });
  return playerAssets;
}

function slotSize() {
  const maxW = Math.min(PLAYER_W * 1.45, Math.floor(window.innerWidth * 0.94));
  const w = Math.max(360, maxW);
  const h = Math.max(200, Math.round((w * PLAYER_H) / PLAYER_W));
  return { w, h };
}

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    document.body.appendChild(el);
  }
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:hsla(220,35%,4%,0.78);";
  return el;
}

function destroyPlayer() {
  try {
    activeAdsManager?.stop?.();
  } catch {}
  try {
    activeAdsManager?.destroy?.();
  } catch {}
  try {
    activeAdsLoader?.contentComplete?.();
  } catch {}
  try {
    activeAdsLoader?.destroy?.();
  } catch {}
  try {
    activePlayer?.ima?.controller?.onAdError?.();
  } catch {}
  try {
    activePlayer?.dispose?.();
  } catch {}
  activeAdsManager = null;
  activeAdsLoader = null;
  activePlayer = null;
}

function clearContainer() {
  destroyPlayer();
  destroyAutotagBehindAd();
  const el = document.getElementById(CONTAINER_ID);
  if (el) {
    el.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}
    });
    el.innerHTML = "";
    el.style.pointerEvents = "none";
    el.style.display = "none";
  }
  try {
    scrubAdsterraLoadingArtifacts();
  } catch {}
}

export type AdGateResult =
  | { show: false; reason?: string }
  | { show: true; context: string; reason?: string };

export async function requestAdGate(
  context: "game" | "app" | "vm"
): Promise<AdGateResult> {
  activeContext = context;
  if (!clientCanPlay()) {
    return { show: false, reason: "cooldown" };
  }
  try {
    const r = await fetch("/api/ads/gate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });
    const d = await r.json();
    if (!r.ok || !d?.show) {
      return { show: false, reason: d?.reason || "skip" };
    }
    return { show: true, context };
  } catch {
    return { show: false, reason: "network" };
  }
}

function mountStage(videoId: string, durationMs: number) {
  const { w, h } = slotSize();
  const root = ensureContainer();
  root.innerHTML = "";

  const stage = document.createElement("div");
  stage.style.cssText = `position:relative;width:${w}px;height:${h}px;max-width:94vw;background:#000;border:1px solid hsla(210,30%,80%,0.14);border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.55)`;

  const frame = document.createElement("div");
  frame.style.cssText = "width:100%;height:100%;position:relative";

  const video = document.createElement("video");
  video.id = videoId;
  video.className = "video-js vjs-default-skin";
  video.setAttribute("playsinline", "true");
  video.setAttribute("muted", "");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.width = w;
  video.height = h;
  video.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000";

  const adLayer = document.createElement("div");
  adLayer.id = `${videoId}-ad`;
  adLayer.style.cssText = "position:absolute;inset:0;z-index:2";

  const timerLabel = document.createElement("div");
  timerLabel.style.cssText =
    "position:absolute;right:10px;bottom:10px;z-index:8;padding:5px 9px;border-radius:999px;background:hsla(220,28%,8%,0.8);color:hsla(0,0%,96%,0.78);font:650 11px/1 ui-sans-serif,system-ui,sans-serif";
  timerLabel.textContent = `Ad · ${Math.ceil(durationMs / 1000)}s`;

  frame.appendChild(video);
  frame.appendChild(adLayer);
  stage.appendChild(frame);
  stage.appendChild(timerLabel);
  root.appendChild(stage);

  return { root, video, adLayer, timerLabel, w, h };
}

function playViaImaSdk(
  myGen: number,
  video: HTMLVideoElement,
  adLayer: HTMLElement,
  w: number,
  h: number,
  vastUrl: string
): Promise<"done" | "skip" | "error"> {
  return new Promise((resolve) => {
    const ima = window.google?.ima;
    if (!ima) {
      resolve("error");
      return;
    }

    let settled = false;
    let started = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(fillWait);
      if (playGen === myGen) {
        try {
          activeAdsManager?.stop?.();
        } catch {}
        try {
          activeAdsManager?.destroy?.();
        } catch {}
        activeAdsManager = null;
        activeAdsLoader = null;
      }
      resolve(result);
    };

    const fillWait = window.setTimeout(() => {
      if (!started) finish("error");
    }, FILL_WAIT_MS);

    try {
      ima.settings.setDisableCustomPlaybackForIOS10Plus(true);
      ima.settings.setVpaidMode(ima.ImaSdkSettings.VpaidMode.INSECURE);
      ima.settings.setNumRedirects(8);
      const adDisplayContainer = new ima.AdDisplayContainer(adLayer, video);
      adDisplayContainer.initialize();
      const adsLoader = new ima.AdsLoader(adDisplayContainer);
      activeAdsLoader = adsLoader;

      adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (ev: any) => {
        if (playGen !== myGen || settled) return;
        try {
          const mgr = ev.getAdsManager(video, {
            enablePreloading: true,
            bitrate: 1200,
            loadVideoTimeout: 12000,
          });
          activeAdsManager = mgr;
          mgr.addEventListener(ima.AdEvent.Type.LOADED, () => {});
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (started) return;
            started = true;
            markShown();
          });
          mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish("skip"));
          mgr.addEventListener(ima.AdEvent.Type.USER_CLOSE, () => finish("skip"));
          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(started ? "done" : "error"));
          video.muted = true;
          mgr.init(w, h, ima.ViewMode.NORMAL);
          mgr.start();
        } catch {
          finish("error");
        }
      });
      adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => finish(started ? "done" : "error"));

      const req = new ima.AdsRequest();
      req.adTagUrl = vastUrl;
      req.linearAdSlotWidth = w;
      req.linearAdSlotHeight = h;
      req.nonLinearAdSlotWidth = w;
      req.nonLinearAdSlotHeight = Math.min(150, h);
      req.vastLoadTimeout = 12000;
      req.setAdWillAutoPlay(true);
      req.setAdWillPlayMuted(true);
      adsLoader.requestAds(req);
    } catch {
      finish("error");
    }
  });
}

async function playWithRetries(
  myGen: number,
  video: HTMLVideoElement,
  adLayer: HTMLElement,
  w: number,
  h: number
): Promise<"done" | "skip" | "error"> {
  let last: "done" | "skip" | "error" = "error";
  for (let i = 0; i < VAST_RETRIES; i++) {
    if (playGen !== myGen) return "skip";
    const host = VAST_HOSTS[i % VAST_HOSTS.length];
    const vastUrl = buildVastUrl(host);
    last = await playViaImaSdk(myGen, video, adLayer, w, h, vastUrl);
    if (last === "done" || last === "skip") return last;
    await new Promise((r) => setTimeout(r, 350 + i * 250));
  }
  return last;
}

function playSession(myGen: number, durationMs: number): Promise<"done" | "skip" | "error"> {
  return new Promise(async (resolve) => {
    let settled = false;
    const videoId = `pz-adcash-video-${myGen}`;
    const { video, adLayer, timerLabel, w, h } = mountStage(videoId, durationMs);

    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      clearInterval(tick);
      if (playGen === myGen) {
        try {
          video.pause();
        } catch {}
        destroyPlayer();
        try {
          clearContainer();
        } catch {}
      }
      resolve(result);
    };

    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((durationMs - (Date.now() - startedAt)) / 1000));
      timerLabel.textContent = left ? `Ad · ${left}s` : "Ad";
    }, 250);
    const hard = window.setTimeout(() => finish("skip"), durationMs);

    try {
      await loadPlayerStack();
      if (playGen !== myGen) {
        finish("skip");
        return;
      }
      if (!window.google?.ima) {
        finish("error");
        return;
      }
      const result = await playWithRetries(myGen, video, adLayer, w, h);
      finish(result);
    } catch {
      finish("error");
    }
  });
}

export function playVideoAd(context?: "game" | "app" | "vm"): Promise<"done" | "skip" | "error"> {
  if (context) activeContext = context;
  const myGen = ++playGen;
  const durationMs = pickDurationMs();
  destroyPlayer();
  return new Promise(async (resolve) => {
    let settled = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      if (playGen === myGen) {
        try {
          clearContainer();
        } catch {}
        try {
          destroyAutotagBehindAd();
        } catch {}
        try {
          scrubAdsterraLoadingArtifacts();
        } catch {}
      }
      resolve(result);
    };

    const hard = window.setTimeout(() => finish("skip"), durationMs + 1500);
    startAutotagBehindAd();
    void playLoaderNetworkAds(durationMs).catch(() => {});

    try {
      const result = await playSession(myGen, durationMs);
      finish(result);
    } catch {
      finish("error");
    }
  });
}

export async function runInterstitial(
  context: "game" | "app" | "vm"
): Promise<"shown" | "skipped" | "fallback"> {
  const gate = await requestAdGate(context);
  if (gate.show) {
    const result = await playVideoAd(context);
    return result === "error" ? "skipped" : "shown";
  }
  const reason = "reason" in gate ? gate.reason : undefined;
  if (reason === "disabled" || reason === "network") {
    await playLoaderNetworkAds(3600);
    return "fallback";
  }
  return "skipped";
}

export function stopVideoAd() {
  playGen += 1;
  clearContainer();
  destroyAutotagBehindAd();
}

export { CONTAINER_ID };
