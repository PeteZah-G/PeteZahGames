import { useEffect, useRef } from "react";

const ZONE = "6002292";
const SLOT_CLASS = "eas6a97888e2";
const PROVIDER_SRC = "https://a.magsrv.com/ad-provider.js";

declare global {
  interface Window {
    AdProvider?: Array<Record<string, unknown>>;
  }
}

function ensureProvider() {
  if (document.querySelector(`script[data-pz-exo-provider="1"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.type = "application/javascript";
  s.src = PROVIDER_SRC;
  s.dataset.pzExoProvider = "1";
  document.head.appendChild(s);
}

export function ExoClickBanner() {
  const served = useRef(false);
  useEffect(() => {
    ensureProvider();
    if (served.current) return;
    served.current = true;
    (window.AdProvider = window.AdProvider || []).push({ serve: {} });
  }, []);

  return (
    <div
      data-ad-slot="exo"
      style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        padding: "2px 0 6px",
        overflow: "hidden",
        opacity: 0.9,
      }}
    >
      <ins className={SLOT_CLASS} data-zoneid={ZONE} />
    </div>
  );
}
