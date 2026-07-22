import { useEffect, useState } from "react";
import { Lock, Monitor, ExternalLink, Loader2, Sparkles, Maximize2 } from "lucide-react";
import { setPendingAuth } from "@/lib/authPending";

export default function FirefoxVmPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [assetOk, setAssetOk] = useState(true);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.user) setAuthed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    fetch("/firefox-wasm/index.html", { method: "HEAD", credentials: "include" })
      .then((r) => {
        if (!cancelled) setAssetOk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setAssetOk(false);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  function launchVm() {
    if (!ready || launching) return;
    setLaunching(true);
    try {
      sessionStorage.setItem("pz-vm-return", "1");
    } catch {}
    window.location.assign("/firefox-wasm/index.html");
  }

  if (loading) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{
          background:
            "radial-gradient(900px 500px at 50% -10%, #0c2244 0%, transparent 55%), hsl(216 32% 6%)",
        }}
      >
        <Loader2 className="animate-spin" size={18} style={{ color: "hsl(213 70% 58%)" }} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-5 px-6"
        style={{
          background:
            "radial-gradient(900px 500px at 50% -10%, #0c2244 0%, transparent 55%), hsl(216 32% 6%)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, hsl(213 70% 48% / 0.25), hsl(250 65% 52% / 0.2))",
            border: "1px solid hsl(213 70% 58% / 0.35)",
            boxShadow: "0 0 40px hsl(213 70% 50% / 0.15)",
          }}
        >
          <Lock size={20} style={{ color: "hsl(213 70% 70%)" }} />
        </div>
        <div className="text-center max-w-sm">
          <p
            className="text-lg font-extrabold mb-1 tracking-tight"
            style={{
              background: "linear-gradient(135deg, #fff 20%, #9ec5ff 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            PeteZah VM
          </p>
          <p className="text-sm font-medium mb-1" style={{ color: "hsl(0 0% 90%)" }}>
            Sign in to launch
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "hsl(216 12% 48%)" }}>
            Firefox in WebAssembly — a real Gecko browser inside PeteZah. Account required.
          </p>
        </div>
        <button
          onClick={() => {
            setPendingAuth({ type: "vm" });
            onNavigate("petezah://account");
          }}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, hsl(213 70% 48%), hsl(250 65% 52%))",
            boxShadow: "0 8px 28px hsl(213 70% 40% / 0.35)",
          }}
        >
          Sign In
        </button>
        <p className="text-[10px]" style={{ color: "hsl(216 12% 40%)" }}>
          Powered by{" "}
          <a
            href="https://developer.puter.com/labs/firefox-wasm/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "hsl(213 70% 58%)" }}
          >
            Puter Labs
          </a>
        </p>
      </div>
    );
  }

  if (!assetOk) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: "hsl(216 32% 6%)" }}
      >
        <Monitor size={22} style={{ color: "hsl(216 12% 40%)" }} />
        <p className="text-sm" style={{ color: "hsl(0 0% 90%)" }}>
          VM assets are not installed on this server.
        </p>
        <p className="text-xs max-w-md" style={{ color: "hsl(216 12% 45%)" }}>
          Run <code style={{ color: "hsl(213 70% 58%)" }}>npm run vendor:firefox-wasm</code> then redeploy.
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(1000px 560px at 50% -8%, #0c2244 0%, transparent 55%), radial-gradient(700px 400px at 90% 100%, hsla(250, 65%, 40%, 0.1), transparent 50%), hsl(216 32% 6%)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(213 70% 58%), hsl(250 65% 55%), transparent)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center text-center max-w-md gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-1"
          style={{
            background: "linear-gradient(145deg, hsl(213 70% 48% / 0.3), hsl(250 65% 52% / 0.22))",
            border: "1px solid hsl(213 70% 58% / 0.4)",
            boxShadow: "0 0 50px hsl(213 70% 50% / 0.2)",
          }}
        >
          <Monitor size={26} style={{ color: "hsl(213 70% 75%)" }} />
        </div>
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
            style={{ color: "hsl(213 70% 58%)" }}
          >
            PeteZah VMs
          </p>
          <h1
            className="text-3xl font-extrabold tracking-tight mb-2"
            style={{
              background: "linear-gradient(135deg, #fff 15%, #9ec5ff 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Firefox VM
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(216 12% 52%)" }}>
            Opens as a full-page Gecko browser (WebAssembly). Threaded WASM can’t run inside PeteZah’s
            iframe — so Launch takes over this tab securely.
          </p>
        </div>
        <button
          onClick={launchVm}
          disabled={!ready || launching}
          className="mt-2 inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, hsl(213 70% 48%), hsl(250 65% 52%))",
            boxShadow: "0 10px 32px hsl(213 70% 40% / 0.4)",
          }}
        >
          {launching || !ready ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {launching ? "Launching…" : "Preparing…"}
            </>
          ) : (
            <>
              <Maximize2 size={15} />
              Launch VM
            </>
          )}
        </button>
        <p className="text-[11px] mt-1" style={{ color: "hsl(216 12% 40%)" }}>
          Uses Virginia Wisp · Credit{" "}
          <a
            href="https://github.com/HeyPuter/firefox-wasm"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5"
            style={{ color: "hsl(213 70% 58%)" }}
          >
            Puter / firefox-wasm <ExternalLink size={9} />
          </a>
        </p>
        <p className="text-[10px] flex items-center gap-1" style={{ color: "hsl(216 12% 36%)" }}>
          <Sparkles size={10} />
          Use Exit on the VM splash to return to PeteZah
        </p>
      </div>
    </div>
  );
}
