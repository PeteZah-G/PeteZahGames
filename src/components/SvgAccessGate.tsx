import { useEffect, useRef, useState } from "react";
import { getSiteOrigin, isSvgShell, svgDirUrl } from "@/lib/siteOrigin";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "cap-widget": any;
    }
  }
}

function asset(path: string) {
  return new URL(path, svgDirUrl()).href;
}

export default function SvgAccessGate({ children }: { children: React.ReactNode }) {
  const origin = getSiteOrigin();
  const [ready, setReady] = useState(!isSvgShell());
  const [solved, setSolved] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [legalVersion, setLegalVersion] = useState<string | null>(null);
  const [capReady, setCapReady] = useState(false);
  const capRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isSvgShell()) return;
    let gone = false;
    (async () => {
      try {
        const r = await fetch("/api/legal/status", { credentials: "include" });
        const d = await r.json();
        if (gone) return;
        setLegalVersion(d.version || null);
        if (d.gate && d.accepted) {
          setReady(true);
          return;
        }
        if (d.gate) setSolved(true);
      } catch {}
      (window as any).CAP_CUSTOM_WASM_URL = asset("vendor/cap/cap_wasm_bg.wasm");
      (window as any).CAP_PAKO_URL = asset("vendor/cap/pako_inflate.min.js");
      try {
        if (!customElements.get("cap-widget")) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = asset("vendor/cap/cap.min.js");
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("captcha"));
            document.head.appendChild(s);
          });
        }
        if (customElements.whenDefined) await customElements.whenDefined("cap-widget");
      } catch {}
      if (!gone) setCapReady(true);
    })();
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    const onSolve = () => {
      setSolved(true);
      setStatus("Verified. Accept the policies, then continue.");
    };
    const onErr = (e: Event) => {
      setSolved(false);
      setStatus((e as CustomEvent)?.detail?.message || "Verification failed. Try again.");
    };
    el.addEventListener("solve", onSolve);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("solve", onSolve);
      el.removeEventListener("error", onErr);
    };
  }, [capReady]);

  if (ready) return <>{children}</>;

  async function continueOn() {
    if (busy || !solved || !agreed) return;
    setBusy(true);
    setStatus("Saving agreement…");
    try {
      const r = await fetch("/api/legal/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accepted: true, version: legalVersion }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(d.error || "Could not save agreement. Try again.");
        setBusy(false);
        return;
      }
      setReady(true);
    } catch {
      setStatus("Network error. Please try again.");
      setBusy(false);
    }
  }

  const href = (p: string) => origin + p;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#020810",
        color: "#e8f0fa",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "min(420px, calc(100vw - 32px))", padding: 28 }}>
        <p style={{ letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, fontSize: 11, margin: 0 }}>
          PeteZah
        </p>
        <h1 style={{ fontSize: 28, margin: "10px 0 8px" }}>Verify to continue</h1>
        <p style={{ opacity: 0.7, lineHeight: 1.5, margin: "0 0 18px" }}>
          A quick check keeps the community safe. Agree to our policies, then continue.
        </p>
        <div style={{ margin: "16px 0", minHeight: 72 }}>
          {capReady ? (
            <cap-widget
              ref={capRef as any}
              data-cap-api-endpoint={`${origin}/cap/`}
              data-cap-i18n-initial-state="I'm not a robot"
              data-cap-i18n-verifying-label="Verifying…"
              data-cap-i18n-solved-label="Verified"
              data-cap-i18n-error-label="Try again"
            />
          ) : (
            <p style={{ opacity: 0.6, fontSize: 13 }}>Loading verification…</p>
          )}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13, lineHeight: 1.45 }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            I agree to the{" "}
            <a href={href("/terms")} target="_blank" rel="noopener noreferrer">
              Terms
            </a>
            ,{" "}
            <a href={href("/privacy-policy")} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            , and{" "}
            <a href={href("/dmca")} target="_blank" rel="noopener noreferrer">
              DMCA Policy
            </a>
            .
          </span>
        </label>
        <button
          type="button"
          disabled={busy || !solved || !agreed}
          onClick={continueOn}
          style={{
            marginTop: 18,
            width: "100%",
            height: 42,
            borderRadius: 10,
            border: "none",
            background: busy || !solved || !agreed ? "hsla(213,70%,55%,0.25)" : "#4d8dff",
            color: "#fff",
            fontWeight: 650,
            cursor: busy || !solved || !agreed ? "default" : "pointer",
          }}
        >
          Continue
        </button>
        <p style={{ minHeight: 20, fontSize: 12, opacity: 0.75, margin: "12px 0 0" }}>{status}</p>
      </div>
    </div>
  );
}
