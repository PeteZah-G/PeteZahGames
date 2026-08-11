import { playLoaderNetworkAds, scrubAdsterraLoadingArtifacts } from "@/components/ads/Adsterra";

const CONTAINER_ID = "pz-adcash-root";
const ACLIB_SRC = "https://acscdn.com/script/aclib.js";
const AD_MAX_MS = 15000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 2;
const PLAYS_KEY = "pz-video-ad-at";

declare global {
  interface Window {
    aclib?: { runVideoTag?: (opts: Record<string, unknown>) => void };
  }
}

let aclibPromise: Promise<void> | null = null;

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

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    document.body.appendChild(el);
  }
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:hsla(220,35%,4%,0.72);";
  return el;
}

function clearContainer() {
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

function loadAclib(): Promise<void> {
  if (window.aclib) return Promise.resolve();
  if (aclibPromise) return aclibPromise;
  aclibPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-pz-aclib="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "aclib";
    s.src = ACLIB_SRC;
    s.async = true;
    s.dataset.pzAclib = "1";
    s.onload = () => resolve();
    s.onerror = () => {
      aclibPromise = null;
      resolve();
    };
    document.head.appendChild(s);
  });
  return aclibPromise;
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

function playMedia(
  mediaUrl: string,
  clickThrough: string
): Promise<"done" | "skip" | "error"> {
  return new Promise((resolve) => {
    let settled = false;
    const root = ensureContainer();
    root.innerHTML = "";

    const stage = document.createElement("div");
    stage.style.cssText =
      "position:relative;width:min(920px,94vw);max-height:82vh;background:#05080f;border:1px solid hsla(210,30%,80%,0.14);border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.55)";

    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.autoplay = true;
    video.muted = true;
    video.controls = false;
    video.preload = "auto";
    video.style.cssText = "display:block;width:100%;max-height:82vh;background:#000";
    video.src = mediaUrl;

    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Skip ad";
    skip.style.cssText =
      "position:absolute;top:10px;right:10px;z-index:2;border:1px solid hsla(210,30%,80%,0.22);background:hsla(220,28%,10%,0.88);color:hsla(0,0%,96%,0.95);border-radius:999px;padding:7px 12px;font:650 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer";

    const timerLabel = document.createElement("div");
    timerLabel.style.cssText =
      "position:absolute;left:10px;bottom:10px;z-index:2;padding:5px 9px;border-radius:999px;background:hsla(220,28%,8%,0.8);color:hsla(0,0%,96%,0.78);font:650 11px/1 ui-sans-serif,system-ui,sans-serif";

    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      clearInterval(tick);
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
      try {
        clearContainer();
      } catch {}
      resolve(result);
    };

    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((AD_MAX_MS - (Date.now() - started)) / 1000));
      timerLabel.textContent = left ? `Ad · ${left}s` : "Ad";
    }, 200);
    timerLabel.textContent = "Ad · 15s";

    const hard = window.setTimeout(() => finish("skip"), AD_MAX_MS);
    skip.addEventListener("click", () => finish("skip"));
    video.addEventListener("ended", () => finish("done"));
    video.addEventListener("error", () => finish("error"));
    if (clickThrough && /^https?:\/\//i.test(clickThrough)) {
      video.style.cursor = "pointer";
      video.addEventListener("click", () => {
        try {
          window.open(clickThrough, "_blank", "noopener,noreferrer");
        } catch {}
      });
    }

    stage.appendChild(video);
    stage.appendChild(skip);
    stage.appendChild(timerLabel);
    root.appendChild(stage);
    video.play().catch(() => {});
  });
}

export function playVideoAd(): Promise<"done" | "skip" | "error"> {
  return new Promise(async (resolve) => {
    let settled = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(hard);
      try {
        clearContainer();
      } catch {}
      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}
      resolve(result);
    };

    const hard = window.setTimeout(() => finish("skip"), AD_MAX_MS + 400);
    recordPlay();
    loadAclib().catch(() => {});
    void playLoaderNetworkAds(AD_MAX_MS).catch(() => {});

    try {
      const ac = new AbortController();
      const abortTimer = window.setTimeout(() => ac.abort(), 6000);
      try {
        const r = await fetch("/api/ads/vast", {
          credentials: "include",
          signal: ac.signal,
        });
        const d = r.ok ? await r.json() : null;
        const mediaUrl = typeof d?.mediaUrl === "string" ? d.mediaUrl : "";
        const clickThrough = typeof d?.clickThrough === "string" ? d.clickThrough : "";
        if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
          const result = await playMedia(mediaUrl, clickThrough);
          finish(result);
          return;
        }
      } finally {
        window.clearTimeout(abortTimer);
      }
    } catch {}

    finish("skip");
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
  clearContainer();
}

export { CONTAINER_ID };
