import { originHttpHost, originWsHost, svgDirPath } from "./siteOrigin";

function dir() {
  try {
    if (typeof window === "undefined" || !(window as any).__PZ_ORIGIN__) return "/";
    return svgDirPath();
  } catch {
    return "/";
  }
}

export const PX = {
  get prefix() {
    return dir() + "afsd123k2/";
  },
  get core() {
    return dir() + "q9vx/";
  },
  get mux() {
    return dir() + "m4thx/";
  },
  get epoxy() {
    return dir() + "e7px/";
  },
  get curl() {
    return dir() + "l9cx/";
  },
  stream: "/wisp/",
  edge: "/api/edge/",
  get sw() {
    return dir() + "1k123.js";
  },
  get coreAll() {
    return dir() + "q9vx/sj.all.js";
  },
  get coreSync() {
    return dir() + "q9vx/sj.sync.js";
  },
  get coreWasm() {
    return dir() + "q9vx/sj.wasm.wasm";
  },
  get muxWorker() {
    return dir() + "m4thx/worker.js";
  },
  get epoxyMod() {
    return dir() + "e7px/index.mjs";
  },
  get curlMod() {
    return dir() + "l9cx/index.mjs";
  },
};

function fromCodes(codes: number[]): string {
  return codes.map((c) => String.fromCharCode(c)).join("");
}

const N = {
  loadCtrl: fromCodes([36, 115, 99, 114, 97, 109, 106, 101, 116, 76, 111, 97, 100, 67, 111, 110, 116, 114, 111, 108, 108, 101, 114]),
  ctrl: fromCodes([83, 99, 114, 97, 109, 106, 101, 116, 67, 111, 110, 116, 114, 111, 108, 108, 101, 114]),
  encode: fromCodes([101, 110, 99, 111, 100, 101, 85, 114, 108]),
  frame: fromCodes([99, 114, 101, 97, 116, 101, 70, 114, 97, 109, 101]),
  mux: fromCodes([66, 97, 114, 101, 77, 117, 120]),
  muxConn: fromCodes([66, 97, 114, 101, 77, 117, 120, 67, 111, 110, 110, 101, 99, 116, 105, 111, 110]),
  setTransport: fromCodes([115, 101, 116, 84, 114, 97, 110, 115, 112, 111, 114, 116]),
  streamKey: fromCodes([119, 105, 115, 112]),
};

export function getPx(): any {
  return (window as any).__pz;
}

export function pxEncode(url: string): string {
  const c = getPx();
  if (!c) return url;
  try {
    return c[N.encode](url);
  } catch {
    return url;
  }
}

const DECODE = fromCodes([100, 101, 99, 111, 100, 101, 85, 114, 108]);

export function pxDecode(url: string): string {
  const c = getPx();
  if (!c || typeof c[DECODE] !== "function") return url;
  try {
    return c[DECODE](url);
  } catch {
    return url;
  }
}

export function pxCreateFrame(): any {
  const c = getPx();
  if (!c) return null;
  return c[N.frame]();
}

export function pxReady(): boolean {
  return !!getPx();
}

export async function waitPx(timeoutMs = 8000): Promise<boolean> {
  if (getPx()) return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (getPx()) {
        clearInterval(t);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        resolve(false);
      }
    }, 50);
  });
}

export function loadCtrlFactory(): any {
  return (window as any)[N.loadCtrl];
}

export function ctrlClassName(): string {
  return N.ctrl;
}

export function getMuxRoot(): any {
  return (window as any)[N.mux];
}

export function openMuxConnection(workerPath: string): any {
  const root = getMuxRoot();
  if (!root) return null;
  return new root[N.muxConn](workerPath);
}

export async function setMuxTransport(conn: any, modPath: string, streamUrl: string): Promise<void> {
  if (!conn) return;
  const opts: Record<string, string> = {};
  opts[N.streamKey] = streamUrl;
  await conn[N.setTransport](modPath, [opts]);
}

export function defaultStreamUrl(): string {
  return originWsHost() + PX.stream;
}

export function defaultEdgeUrl(): string {
  return originHttpHost() + PX.edge;
}
