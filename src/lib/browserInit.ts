import {
  PX,
  loadCtrlFactory,
  ctrlClassName,
  openMuxConnection,
  setMuxTransport,
  defaultStreamUrl,
  defaultEdgeUrl,
  getMuxRoot,
} from "./px";

declare global {
  interface Window {
    __pz: any;
    __browserInitialized: boolean;
  }
}

function dbName() {
  return String.fromCharCode(36, 115, 99, 114, 97, 109, 106, 101, 116);
}

const STORES = [
  "config",
  "cookies",
  "redirectTrackers",
  "referrerPolicies",
  "publicSuffixList",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      req.onsuccess = finish;
      req.onerror = finish;
      req.onblocked = () => {};
      setTimeout(finish, 2500);
    } catch {
      resolve();
    }
  });
}

function openDbCheck(): Promise<{ broken: boolean; version: number }> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName());
      req.onerror = () => resolve({ broken: true, version: 0 });
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const broken = STORES.some((s) => !db.objectStoreNames.contains(s));
        const version = db.version;
        db.close();
        resolve({ broken, version });
      };
    } catch {
      resolve({ broken: true, version: 0 });
    }
  });
}

function createDbWithStores(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(dbName(), 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const ok = STORES.every((s) => db.objectStoreNames.contains(s));
        db.close();
        if (ok) resolve();
        else reject(new Error("stores still missing after create"));
      };
      req.onerror = () => reject(req.error || new Error("idb open failed"));
      req.onblocked = () => {};
    } catch (e) {
      reject(e);
    }
  });
}

async function repairPxStore() {
  for (let i = 0; i < 6; i++) {
    const { broken, version } = await openDbCheck();
    if (!broken && version === 1) return;
    await deleteDb(dbName());
    await sleep(250 + i * 100);
    try {
      await createDbWithStores();
    } catch {}
    await sleep(100);
  }
}

async function clearServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {}
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  await sleep(400);
}

async function registerSw() {
  const reg = await navigator.serviceWorker.register(PX.sw, {
    updateViaCache: "none",
    scope: "/",
  });
  try {
    await reg.update();
  } catch {}
  if (reg.installing) {
    await new Promise<void>((resolve) => {
      const w = reg.installing;
      if (!w) return resolve();
      w.addEventListener("statechange", () => {
        if (w.state === "activated" || w.state === "redundant") resolve();
      });
      setTimeout(resolve, 4000);
    });
  }
  try {
    await navigator.serviceWorker.ready;
  } catch {}
  await new Promise<void>((resolve) => {
    if (navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
      once: true,
    });
    setTimeout(resolve, 4000);
  });
  return reg;
}

async function setupMux() {
  await waitFor(() => !!getMuxRoot(), 5000);

  try {
    localStorage.setItem(muxPathKey(), PX.muxWorker);
  } catch {}

  const streamUrl = (window as any)._CONFIG?.wispurl || defaultStreamUrl();
  const edgeUrl = (window as any)._CONFIG?.bareurl || defaultEdgeUrl();
  const connection = openMuxConnection(PX.muxWorker);
  if (!connection) {
    throw new Error("mux connection unavailable");
  }

  const setT = String.fromCharCode(115, 101, 116, 84, 114, 97, 110, 115, 112, 111, 114, 116);
  let attempts = 0;
  while (attempts < 12) {
    try {
      await setMuxTransport(connection, PX.epoxyMod, streamUrl);
      return;
    } catch {
      try {
        await connection[setT](PX.mux + "index.mjs", [edgeUrl]);
        return;
      } catch {
        try {
          await setMuxTransport(connection, PX.curlMod, streamUrl);
          return;
        } catch {
          attempts++;
          if (attempts >= 12) {
            throw new Error("Failed to set any transport");
          }
          await sleep(150);
        }
      }
    }
  }
}

function muxPathKey() {
  return String.fromCharCode(
    98, 97, 114, 101, 45, 109, 117, 120, 45, 112, 97, 116, 104
  );
}

function cfgMsgType() {
  return String.fromCharCode(
    115, 99, 114, 97, 109, 106, 101, 116, 36, 116, 121, 112, 101
  );
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-px-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.pxSrc = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

let ensurePromise: Promise<void> | null = null;

export async function ensureProxyEngine(): Promise<void> {
  if ((window as any).__pz) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await loadScriptOnce(PX.mux + "index.js");
    await loadScriptOnce(PX.coreAll);
    await initBrowser();
    if (!(window as any).__pz) {
      throw new Error("engine unavailable");
    }
  })().catch((err) => {
    ensurePromise = null;
    window.__browserInitialized = false;
    throw err;
  });

  return ensurePromise;
}

export async function initBrowser() {
  if ((window as any).__pz) return;
  if (window.__browserInitialized) return;
  window.__browserInitialized = true;

  try {
    await waitFor(() => typeof loadCtrlFactory() === "function", 8000);
  } catch (err) {
    window.__browserInitialized = false;
    throw err;
  }

  try {
    localStorage.removeItem(muxPathKey());
  } catch {}

  const { broken, version } = await openDbCheck();
  if (broken || version !== 1) {
    await clearServiceWorkers();
    await repairPxStore();
  }

  try {
    await registerSw();
  } catch {}

  const factory = loadCtrlFactory();
  const loaded = factory();
  const Ctrl = loaded[ctrlClassName()];
  if (!Ctrl) {
    window.__browserInitialized = false;
    return;
  }

  let controller: any = null;
  let inited = false;

  for (let attempt = 0; attempt < 4 && !inited; attempt++) {
    try {
      if (attempt > 0) {
        await clearServiceWorkers();
        await repairPxStore();
        await registerSw();
      }
      controller = new Ctrl({
        prefix: PX.prefix,
        files: {
          wasm: PX.coreWasm,
          all: PX.coreAll,
          sync: PX.coreSync,
        },
      });
      await controller.init();
      inited = true;
    } catch {
      await sleep(200);
    }
  }

  if (!inited || !controller) {
    window.__browserInitialized = false;
    return;
  }

  try {
    await setupMux();
  } catch {
    window.__browserInitialized = false;
    return;
  }

  (window as any).__pz = controller;

  try {
    const msg: Record<string, string> = {};
    msg[cfgMsgType()] = "loadConfig";
    navigator.serviceWorker.controller?.postMessage(msg);
  } catch {}
}

function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (condition()) return resolve();
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`));
      }
    }, 50);
  });
}
