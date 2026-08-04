import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

const KEY_728 = "5aed292251276d82b269fc3b8ecc354d";
const KEY_320 = "fee48967b89db2d0bd32a6c670ffa744";
const NATIVE_ID = "1f9ef1ea03eb9743ae2feb0b3f839a92";
const NATIVE_SRC = `https://pl25832426.effectivecpmnetwork.com/${NATIVE_ID}/invoke.js`;
const LOADING_SRC =
  "https://pl27983175.effectivecpmnetwork.com/c1/07/27/c10727dadb32856a5f427df5cc7f44ab.js";
const INVOKE_HOST = "https://www.highperformanceformat.com";

export function adSrcDoc(key: string, width: number, height: number) {
  const opts = JSON.stringify({
    key,
    format: "iframe",
    height,
    width,
    params: {},
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;width:100%;height:100%;}iframe{border:0;display:block;margin:0 auto;max-width:100%;}</style></head><body><script>window.atOptions=${opts};<\/script><script src="${INVOKE_HOST}/${key}/invoke.js"><\/script></body></html>`;
}

function AdFrame({
  adKey,
  width,
  height,
}: {
  adKey: string;
  width: number;
  height: number;
}) {
  const srcDoc = useMemo(() => adSrcDoc(adKey, width, height), [adKey, width, height]);
  return (
    <iframe
      title="Advertisement"
      srcDoc={srcDoc}
      width={width}
      height={height}
      scrolling="no"
      frameBorder={0}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="attribution-reporting"
      style={{
        border: 0,
        overflow: "hidden",
        display: "block",
        margin: "0 auto",
        maxWidth: "100%",
        width,
        height,
        background: "transparent",
        flexShrink: 0,
      }}
    />
  );
}

function AdLabel() {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "hsla(0,0%,100%,0.35)",
      }}
    >
      Ad
    </span>
  );
}

const slotShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  gap: 4,
  padding: "10px 0 12px",
  minHeight: 64,
};

export function AdBanner728({ className = "" }: { className?: string }) {
  return (
    <div className={className} style={{ ...slotShell, minHeight: 110 }}>
      <AdLabel />
      <AdFrame adKey={KEY_728} width={728} height={90} />
    </div>
  );
}

export function AdBanner320({ className = "" }: { className?: string }) {
  return (
    <div className={className} style={{ ...slotShell, minHeight: 70 }}>
      <AdLabel />
      <AdFrame adKey={KEY_320} width={320} height={50} />
    </div>
  );
}

export function AdResponsiveBanner({ className = "" }: { className?: string }) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return mobile ? <AdBanner320 className={className} /> : <AdBanner728 className={className} />;
}

export function AdNativeBar() {
  const id = useId().replace(/:/g, "");
  const containerId = `container-${NATIVE_ID}`;
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (document.querySelector(`script[data-pz-native="${NATIVE_ID}"]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.pzNative = NATIVE_ID;
    script.src = NATIVE_SRC;
    document.body.appendChild(script);
  }, []);
  return (
    <div style={{ width: "100%", padding: "4px 0 12px" }} data-ad-slot={id}>
      <AdLabel />
      <div
        id={containerId}
        style={{
          width: "100%",
          minHeight: 48,
          maxHeight: 120,
          overflow: "hidden",
          marginTop: 4,
        }}
      />
    </div>
  );
}

const LOADING_HOST_ID = "pz-adsterra-loading-host";
const AD_BLEED_SRC_RE =
  /effectivecpmnetwork\.com|highperformanceformat\.com|profitablegatecpm\.com|adsterra\.com|senty\.com\.au/i;

/** Remove leftover Social Bar / notification widgets from the top document. */
export function scrubAdsterraLoadingArtifacts() {
  try {
    document.getElementById(LOADING_HOST_ID)?.remove();
  } catch {}

  try {
    document
      .querySelectorAll('script[data-pz-loading-ad="1"]')
      .forEach((el) => {
        try {
          el.remove();
        } catch {}
      });
  } catch {}

  // Social Bar injects fixed iframes/widgets as direct body children.
  try {
    for (const el of Array.from(document.body.children)) {
      if (el.id === "root" || el.id === "app" || el.id === "pz-applixir-root") continue;
      if (el.id === LOADING_HOST_ID) {
        try {
          el.remove();
        } catch {}
        continue;
      }
      const tag = el.tagName;
      if (tag === "SCRIPT") {
        const src = (el as HTMLScriptElement).src || "";
        if (AD_BLEED_SRC_RE.test(src) && !src.includes(NATIVE_ID)) {
          try {
            el.remove();
          } catch {}
        }
        continue;
      }
      if (tag !== "IFRAME" && tag !== "DIV" && tag !== "INS" && tag !== "SECTION") continue;
      const html = (el as HTMLElement).outerHTML?.slice(0, 2500) || "";
      const src = tag === "IFRAME" ? (el as HTMLIFrameElement).src || "" : "";
      if (!AD_BLEED_SRC_RE.test(html) && !AD_BLEED_SRC_RE.test(src)) continue;
      // Keep intentional in-page banner/native slots.
      if ((el as HTMLElement).closest?.("[data-ad-slot]")) continue;
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

/**
 * Temporary Social Bar / notification unit for the game/app loader.
 * Runs inside an opaque-origin sandbox so it cannot keep injecting into the
 * top page after the interstitial ends.
 */
export function playAdsterraLoadingAd(ms = 2800): Promise<"shown" | "skipped"> {
  return new Promise((resolve) => {
    let settled = false;
    const preserved = new Set<Element>(Array.from(document.body.children));

    scrubAdsterraLoadingArtifacts();

    const host = document.createElement("div");
    host.id = LOADING_HOST_ID;
    host.setAttribute("data-pz-loading-host", "1");
    host.style.cssText =
      "position:fixed;inset:0;z-index:2147483645;pointer-events:none;overflow:hidden;background:transparent;";

    const frame = document.createElement("iframe");
    frame.title = "Advertisement";
    // No allow-same-origin: script cannot reach window.top / parent.document,
    // which is what leaves notification widgets stuck on the site.
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-popups-to-escape-sandbox"
    );
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:auto;background:transparent;";
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}</style></head><body><script src="${LOADING_SRC}"><\/script></body></html>`;

    const finish = (r: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        frame.srcdoc = "<!DOCTYPE html><html><body></body></html>";
        frame.src = "about:blank";
      } catch {}
      try {
        host.remove();
      } catch {}
      // Anything the network still managed to attach on top — remove it.
      try {
        for (const el of Array.from(document.body.children)) {
          if (preserved.has(el)) continue;
          if (el.id === "root" || el.id === "app" || el.id === "pz-applixir-root") continue;
          try {
            el.remove();
          } catch {}
        }
      } catch {}
      scrubAdsterraLoadingArtifacts();
      resolve(r);
    };

    const timer = window.setTimeout(() => finish("shown"), Math.max(1200, ms));
    frame.onerror = () => finish("skipped");

    try {
      host.appendChild(frame);
      document.body.appendChild(host);
    } catch {
      finish("skipped");
    }
  });
}

export { LOADING_SRC, KEY_728, KEY_320, NATIVE_ID, INVOKE_HOST };
