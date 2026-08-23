import { useEffect, useRef, useState } from "react";
import VantaBackground from "@/components/VantaBackground";
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
  const [statusKind, setStatusKind] = useState<"ok" | "err" | "">("");
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
        if (d.gate) {
          setSolved(true);
          setStatus("Verified. Accept the policies to continue.");
        }
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
      setStatusKind("ok");
      setStatus(agreed ? "Verified. Click Continue." : "Verified. Accept the policies, then Continue.");
    };
    const onErr = (e: Event) => {
      setSolved(false);
      setStatusKind("err");
      setStatus((e as CustomEvent)?.detail?.message || "Verification failed. Please try again.");
    };
    el.addEventListener("solve", onSolve);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("solve", onSolve);
      el.removeEventListener("error", onErr);
    };
  }, [capReady, agreed]);

  if (ready) return <>{children}</>;

  async function continueOn() {
    if (busy || !solved || !agreed) return;
    setBusy(true);
    setStatusKind("");
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
        setStatusKind("err");
        setBusy(false);
        return;
      }
      setReady(true);
    } catch {
      setStatus("Network error. Please try again.");
      setStatusKind("err");
      setBusy(false);
    }
  }

  const href = (p: string) => origin + p;
  const canGo = !busy && solved && agreed;

  return (
    <div className="pz-svg-gate">
      <style>{`
        .pz-svg-gate {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          background: #020810;
          color: hsl(0 0% 100%);
          font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }
        .pz-svg-gate .stage {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .pz-svg-gate .icon {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: hsl(216 30% 10%);
          border: 1px solid hsl(213 40% 32%);
          color: hsl(213 80% 80%);
        }
        .pz-svg-gate .eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: hsl(213 75% 68%);
          margin-bottom: 8px;
        }
        .pz-svg-gate h1 {
          font-size: clamp(1.75rem, 5vw, 1.95rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.15;
          color: hsl(0 0% 100%);
          margin: 0 0 10px;
        }
        .pz-svg-gate .sub {
          font-size: 0.9rem;
          line-height: 1.55;
          color: hsl(216 15% 72%);
          max-width: 34ch;
          margin: 0 0 22px;
        }
        .pz-svg-gate .widget-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 18px;
          min-height: 52px;
        }
        .pz-svg-gate cap-widget {
          --cap-background: hsl(216 30% 10%);
          --cap-border-color: hsl(213 40% 28%);
          --cap-border-radius: 12px;
          --cap-color: hsl(0 0% 96%);
          --cap-checkbox-background: hsl(216 28% 12%);
          --cap-checkbox-border: 1px solid hsl(213 40% 30%);
          --cap-spinner-color: hsl(213 75% 68%);
          --cap-spinner-background-color: hsl(213 40% 30% / 0.35);
          --cap-font: inherit;
          --cap-widget-width: 260px;
        }
        .pz-svg-gate .agree {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          text-align: left;
          max-width: 320px;
          margin: 0 auto 18px;
          cursor: pointer;
          user-select: none;
        }
        .pz-svg-gate .agree input {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }
        .pz-svg-gate .tick {
          width: 18px;
          height: 18px;
          margin-top: 1px;
          flex-shrink: 0;
          border-radius: 5px;
          border: 1px solid hsl(213 40% 34%);
          background: hsl(216 30% 10%);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, border-color 0.15s;
        }
        .pz-svg-gate .tick svg {
          width: 11px;
          height: 11px;
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 0.12s, transform 0.12s;
          color: #fff;
        }
        .pz-svg-gate .agree input:checked + .tick {
          background: hsl(213 55% 32%);
          border-color: hsl(213 45% 42%);
        }
        .pz-svg-gate .agree input:checked + .tick svg { opacity: 1; transform: scale(1); }
        .pz-svg-gate .agree input:focus-visible + .tick {
          outline: 2px solid hsla(213, 70%, 58%, 0.55);
          outline-offset: 2px;
        }
        .pz-svg-gate .agree-text {
          font-size: 0.78rem;
          line-height: 1.45;
          color: hsl(216 15% 68%);
        }
        .pz-svg-gate .agree-text a {
          color: hsl(213 75% 68%);
          text-decoration: none;
        }
        .pz-svg-gate .agree-text a:hover { text-decoration: underline; }
        .pz-svg-gate .continue {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
          padding: 12px 28px;
          border-radius: 12px;
          border: 1px solid hsl(213 45% 42%);
          background: hsl(213 55% 32%);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s, filter 0.15s;
        }
        .pz-svg-gate .continue:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .pz-svg-gate .continue:not(:disabled):hover { filter: brightness(1.08); }
        .pz-svg-gate .status {
          font-size: 0.75rem;
          color: hsl(216 15% 58%);
          min-height: 1.2em;
          margin-top: 14px;
        }
        .pz-svg-gate .status.ok { color: #7ddea8; }
        .pz-svg-gate .status.err { color: #f0a0a8; }
        .pz-svg-gate .foot {
          margin-top: 18px;
          font-size: 11px;
          color: hsl(216 15% 52%);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pz-svg-gate .foot svg { flex-shrink: 0; opacity: 0.8; }
        .pz-svg-gate .cap-fallback {
          font-size: 13px;
          color: hsl(216 15% 58%);
        }
      `}</style>
      <VantaBackground contained />
      <div className="stage">
        <div className="icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="eyebrow">PeteZah</p>
        <h1>Verify to continue</h1>
        <p className="sub">A quick check keeps the community safe. Agree to our policies, then continue.</p>
        <div className="widget-wrap">
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
            <p className="cap-fallback">Loading verification…</p>
          )}
        </div>
        <label className="agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span className="tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="agree-text">
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
              Copyright Policy
            </a>
            . You must be 13 or older.
          </span>
        </label>
        <button type="button" className="continue" disabled={!canGo} onClick={continueOn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
          Continue
        </button>
        <p className={`status${statusKind ? ` ${statusKind}` : ""}`}>{status}</p>
        <p className="foot">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l2.4 7.2H22l-6 4.8 2.3 7L12 16.8 5.7 21l2.3-7-6-4.8h7.6z" />
          </svg>
          Secure access · PeteZah
        </p>
      </div>
    </div>
  );
}
