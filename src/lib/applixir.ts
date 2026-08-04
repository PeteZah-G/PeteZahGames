import { playAdsterraLoadingAd, scrubAdsterraLoadingArtifacts } from "@/components/ads/Adsterra";

const SDK_SRC = "https://cdn.applixir.com/applixir.app.v6.1.0.js";
const CONTAINER_ID = "pz-applixir-root";
const AD_TIMEOUT_MS = 28000;

type AdStatus = { type?: string; error?: string };

declare global {
  interface Window {
    initializeAndOpenPlayer?: (opts: Record<string, unknown>) => void;
  }
}

let sdkPromise: Promise<void> | null = null;

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;pointer-events:auto;";
    document.body.appendChild(el);
  }
  return el;
}

function clearContainer() {
  const el = document.getElementById(CONTAINER_ID);
  if (el) {
    el.innerHTML = "";
    el.style.pointerEvents = "none";
  }
  try {
    scrubAdsterraLoadingArtifacts();
  } catch {}
}

function loadSdk(): Promise<void> {
  if (typeof window.initializeAndOpenPlayer === "function") {
    return Promise.resolve();
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pz-ad="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("sdk")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.dataset.pzAd = "1";
    s.onload = () => resolve();
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export type AdGateResult =
  | { show: false; reason?: string }
  | { show: true; apiKey: string; context: string; reason?: string };

export async function requestAdGate(
  context: "game" | "app" | "vm"
): Promise<AdGateResult> {
  try {
    const r = await fetch("/api/ads/gate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });
    const d = await r.json();
    if (!r.ok || !d?.show || typeof d.apiKey !== "string") {
      return { show: false, reason: d?.reason || "skip" };
    }
    return { show: true, apiKey: d.apiKey, context };
  } catch {
    return { show: false, reason: "network" };
  }
}

export function playApplixirAd(apiKey: string, userId?: string): Promise<"done" | "skip" | "error"> {
  return new Promise(async (resolve) => {
    let settled = false;
    const finish = (result: "done" | "skip" | "error") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        clearContainer();
      } catch {}
      resolve(result);
    };

    const timer = window.setTimeout(() => finish("skip"), AD_TIMEOUT_MS);

    try {
      await loadSdk();
    } catch {
      finish("error");
      return;
    }

    if (typeof window.initializeAndOpenPlayer !== "function") {
      finish("error");
      return;
    }

    ensureContainer();
    const root = document.getElementById(CONTAINER_ID);
    if (root) root.style.pointerEvents = "auto";

    try {
      window.initializeAndOpenPlayer({
        apiKey,
        injectionElementId: CONTAINER_ID,
        userId: userId || undefined,
        adStatusCallbackFn: (status: AdStatus | string) => {
          const type =
            typeof status === "string"
              ? status
              : status && typeof status === "object"
              ? status.type
              : "";
          if (type === "complete" || type === "ad-watched") {
            finish("done");
            return;
          }
          if (
            type === "skipped" ||
            type === "manuallyEnded" ||
            type === "consentDeclined" ||
            type === "allAdsCompleted" ||
            type === "ad-error" ||
            type === "no-ad"
          ) {
            finish("skip");
          }
        },
        adErrorCallbackFn: () => {
          finish("error");
        },
      });
    } catch {
      finish("error");
    }
  });
}

export async function runInterstitial(
  context: "game" | "app" | "vm",
  userId?: string
): Promise<"shown" | "skipped" | "fallback"> {
  const gate = await requestAdGate(context);
  if (gate.show) {
    const result = await playApplixirAd(gate.apiKey, userId);
    return result === "error" ? "skipped" : "shown";
  }
  const reason = "reason" in gate ? gate.reason : undefined;
  if (reason === "disabled" || reason === "network" || reason === "skip") {
    await playAdsterraLoadingAd(2600);
    return "fallback";
  }
  return "skipped";
}
