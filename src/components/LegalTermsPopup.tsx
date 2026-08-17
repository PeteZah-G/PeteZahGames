import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSiteOrigin } from "@/lib/siteOrigin";

export default function LegalTermsPopup() {
  const origin = getSiteOrigin();
  const href = (p: string) => (origin ? origin + p : p);
  const [show, setShow] = useState(false);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let gone = false;
    fetch("/api/legal/status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (gone) return;
        setVersion(d.version || "");
        if (d.gate && !d.accepted) setShow(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/legal/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accepted: true, version }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(d.error || "Could not save. Please try again.");
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setStatus("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
        >
          <div
            className="absolute inset-0"
            style={{ background: "hsla(220, 40%, 4%, 0.72)", backdropFilter: "blur(10px)" }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative z-10 w-full max-w-sm flex flex-col items-center text-center"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "hsl(216 30% 10%)",
                border: "1px solid hsl(213 40% 32%)",
                color: "hsl(213 80% 80%)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "hsl(213 75% 68%)" }}>
              Updated policies
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: "hsl(0 0% 100%)" }}>
              A quick update
            </h2>
            <p className="text-sm leading-relaxed mb-5 max-w-[32ch]" style={{ color: "hsl(216 15% 72%)" }}>
              Our Terms, Privacy Policy, and Copyright Policy were revised. Please review and continue.
            </p>
            <p className="text-[11px] leading-relaxed mb-5 max-w-[34ch]" style={{ color: "hsl(216 15% 60%)" }}>
              By continuing you agree to the{" "}
              <a href={href("/terms")} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(213 75% 68%)" }}>
                Terms
              </a>
              ,{" "}
              <a href={href("/privacy-policy")} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(213 75% 68%)" }}>
                Privacy Policy
              </a>
              , and{" "}
              <a href={href("/dmca")} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(213 75% 68%)" }}>
                Copyright Policy
              </a>
              .
            </p>
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white w-full max-w-[280px]"
              style={{
                background: "hsl(213 55% 32%)",
                border: "1px solid hsl(213 45% 42%)",
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "default" : "pointer",
              }}
            >
              I agree, continue
            </button>
            {status ? (
              <p className="mt-3 text-[12px]" style={{ color: "hsl(0 70% 72%)" }}>
                {status}
              </p>
            ) : (
              <p className="mt-3 text-[11px]" style={{ color: "hsl(216 15% 52%)" }}>
                Version {version}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
