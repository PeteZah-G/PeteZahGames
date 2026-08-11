import { playLoaderNetworkAds, scrubAdsterraLoadingArtifacts } from "@/components/ads/Adsterra";

const CONTAINER_ID = "pz-adcash-root";
const VAST_URL = "https://youradexchange.com/video/select.php?r=11946186";
const ACLIB_SRC = "https://acscdn.com/script/aclib.js";
const CONTENT_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const AD_MAX_MS = 15000;
const FILL_WAIT_MS = 8000;
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
let activeAdsManager: any = null;
let activeAdsLoader: any = null;

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
    body: "{}",
  }).catch(() => {});
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
    if ((id === "aclib" && window.aclib) || (!id && existing.dataset.pzAdLoaded === "1")) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", done, { once: true });
      window.setTimeout(done, 4000);
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

function loadAclib(): Promise<void> {
  if (window.aclib) return Promise.resolve();
  const existing = document.getElementById("aclib") as HTMLScriptElement | null;
  if (existing) {
    if (document.readyState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", done, { once: true });
      window.setTimeout(done, 1500);
    });
  }
  return loadScript(ACLIB_SRC, "aclib").catch(() => {});
}

function loadPlayerStack(): Promise<void> {
  if (window.google?.ima) return Promise.resolve();
  if (playerAssets) return playerAssets;
  playerAssets = (async () => {
    void loadAclib();
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
  const maxW = Math.min(PLAYER_W * 1.4, Math.floor(window.innerWidth * 0.92));
  const w = Math.max(320, maxW);
  const h = Math.max(180, Math.round((w * PLAYER_H) / PLAYER_W));
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

function mountStage(videoId: string) {
  const { w, h } = slotSize();
  const root = ensureContainer();
  root.innerHTML = "";

  const stage = document.createElement("div");
  stage.style.cssText = `position:relative;width:${w}px;height:${h}px;max-width:94vw;background:#000;border:1px solid hsla(210,30%,80%,0.14);border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.55)`;

  const frame = document.createElement("div");
  frame.style.cssText = `width:100%;height:100%;position:relative`;

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

  const skip = document.createElement("button");
  skip.type = "button";
  skip.textContent = "Skip ad";
  skip.style.cssText =
    "position:absolute;top:10px;right:10px;z-index:8;border:1px solid hsla(210,30%,80%,0.22);background:hsla(220,28%,10%,0.92);color:hsla(0,0%,96%,0.95);border-radius:999px;padding:7px 12px;font:650 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer";

  const timerLabel = document.createElement("div");
  timerLabel.style.cssText =
    "position:absolute;left:10px;bottom:10px;z-index:8;padding:5px 9px;border-radius:999px;background:hsla(220,28%,8%,0.8);color:hsla(0,0%,96%,0.78);font:650 11px/1 ui-sans-serif,system-ui,sans-serif";
  timerLabel.textContent = "Ad · 15s";

  frame.appendChild(video);
  frame.appendChild(adLayer);
  stage.appendChild(frame);
  stage.appendChild(skip);
  stage.appendChild(timerLabel);
  root.appendChild(stage);

  return { root, video, adLayer, skip, timerLabel, w, h };
}

function playViaImaSdk(
  myGen: number,
  video: HTMLVideoElement,
  adLayer: HTMLElement,
  w: number,
  h: number
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

    try {
      ima.settings.setDisableCustomPlaybackForIOS10Plus(true);
      ima.settings.setVpaidMode(ima.ImaSdkSettings.VpaidMode.ENABLED);
      const adDisplayContainer = new ima.AdDisplayContainer(adLayer, video);
      adDisplayContainer.initialize();
      const adsLoader = new ima.AdsLoader(adDisplayContainer);
      activeAdsLoader = adsLoader;

      adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (ev: any) => {
        if (playGen !== myGen || settled) return;
        try {
          const mgr = ev.getAdsManager(video);
          activeAdsManager = mgr;
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (started) return;
            started = true;
            markShown();
          });
          mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish("done"));
          mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish("skip"));
          mgr.addEventListener(ima.AdEvent.Type.CLICK, () => {});
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
      req.adTagUrl = VAST_URL;
      req.linearAdSlotWidth = w;
      req.linearAdSlotHeight = h;
      req.nonLinearAdSlotWidth = w;
      req.nonLinearAdSlotHeight = Math.min(150, h);
      req.setAdWillAutoPlay(true);
      req.setAdWillPlayMuted(true);
      adsLoader.requestAds(req);

      window.setTimeout(() => {
        if (!started) finish("skip");
      }, FILL_WAIT_MS);
    } catch {
      finish("error");
    }
  });
}

function playViaVideoJs(
  myGen: number,
  videoId: string,
  w: number,
  h: number
): Promise<"done" | "skip" | "error"> {
  return new Promise((resolve) => {
    const vjs = window.videojs;
    if (!vjs) {
      resolve("error");
      return;
    }

    let settled = false;
    let started = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const existing = vjs.getPlayer?.(videoId);
      if (existing) {
        try {
          existing.dispose();
        } catch {}
      }
      const player = vjs(videoId, {
        controls: false,
        muted: true,
        autoplay: true,
        preload: "auto",
        width: w,
        height: h,
        inactivityTimeout: 0,
        sources: [{ src: CONTENT_URL, type: "video/mp4" }],
      });
      activePlayer = player;
      player.muted(true);
      player.ready(() => {
        if (playGen !== myGen || settled) return;
        if (typeof player.ima !== "function") {
          finish("error");
          return;
        }
        player.ima({
          id: videoId,
          adTagUrl: VAST_URL,
          disableCustomPlaybackForIOS10Plus: true,
          preventLateAdStart: false,
          showControlsForJSAds: false,
          adsRenderingSettings: { enablePreloading: true },
        });
        const onStart = () => {
          if (started) return;
          started = true;
          markShown();
        };
        player.on("ads-ad-started", onStart);
        player.on("adsready", () => {
          try {
            const ima = window.google?.ima;
            player.ima.addEventListener?.(ima?.AdEvent?.Type?.STARTED, onStart);
            player.ima.addEventListener?.(ima?.AdEvent?.Type?.COMPLETE, () => finish("done"));
            player.ima.addEventListener?.(ima?.AdEvent?.Type?.ALL_ADS_COMPLETED, () => finish("done"));
            player.ima.addEventListener?.(ima?.AdEvent?.Type?.SKIPPED, () => finish("skip"));
          } catch {}
        });
        player.on("ads-manager", (evt: any) => {
          try {
            const mgr = evt?.adsManager;
            const ima = window.google?.ima;
            if (!mgr || !ima) return;
            activeAdsManager = mgr;
            mgr.addEventListener(ima.AdEvent.Type.STARTED, onStart);
            mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => finish("done"));
            mgr.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => finish("done"));
            mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => finish("skip"));
          } catch {}
        });
        player.on("adserror", () => finish(started ? "done" : "error"));
        player.on("adend", () => {
          if (started) finish("done");
        });
        try {
          player.ima.initializeAdDisplayContainer();
        } catch {}
        try {
          player.ima.requestAds();
        } catch {}
        player.play()?.catch?.(() => {});
        window.setTimeout(() => {
          if (!started) finish("skip");
        }, FILL_WAIT_MS);
      });
    } catch {
      finish("error");
    }
  });
}

function playSession(myGen: number): Promise<"done" | "skip" | "error"> {
  return new Promise(async (resolve) => {
    let settled = false;
    const videoId = `pz-adcash-video-${myGen}`;
    const { video, adLayer, skip, timerLabel, w, h } = mountStage(videoId);

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
      const left = Math.max(0, Math.ceil((AD_MAX_MS - (Date.now() - startedAt)) / 1000));
      timerLabel.textContent = left ? `Ad · ${left}s` : "Ad";
    }, 200);
    const hard = window.setTimeout(() => finish("skip"), AD_MAX_MS);
    skip.addEventListener("click", () => finish("skip"));

    try {
      await loadPlayerStack();
      if (playGen !== myGen) {
        finish("skip");
        return;
      }
      let result: "done" | "skip" | "error" = "error";
      if (window.google?.ima) {
        result = await playViaImaSdk(myGen, video, adLayer, w, h);
      } else if (window.videojs?.getPlugin?.("ima")) {
        result = await playViaVideoJs(myGen, videoId, w, h);
      }
      finish(result);
    } catch {
      finish("error");
    }
  });
}

export function playVideoAd(): Promise<"done" | "skip" | "error"> {
  const myGen = ++playGen;
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
          scrubAdsterraLoadingArtifacts();
        } catch {}
      }
      resolve(result);
    };

    const hard = window.setTimeout(() => finish("skip"), AD_MAX_MS + 1200);
    void playLoaderNetworkAds(AD_MAX_MS).catch(() => {});
    void loadAclib();

    try {
      const result = await playSession(myGen);
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
    const result = await playVideoAd();
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
}

export { CONTAINER_ID };

if (typeof window !== "undefined") {
  void loadAclib();
}
