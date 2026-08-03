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

export function playAdsterraLoadingAd(ms = 2800): Promise<"shown" | "skipped"> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: "shown" | "skipped") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        script.remove();
      } catch {}
      resolve(r);
    };
    const timer = window.setTimeout(() => finish("shown"), ms);
    const script = document.createElement("script");
    script.src = LOADING_SRC;
    script.async = true;
    script.dataset.cfasync = "false";
    script.dataset.pzLoadingAd = "1";
    script.onerror = () => finish("skipped");
    try {
      document.body.appendChild(script);
    } catch {
      finish("skipped");
    }
  });
}

export { LOADING_SRC, KEY_728, KEY_320, NATIVE_ID, INVOKE_HOST };
