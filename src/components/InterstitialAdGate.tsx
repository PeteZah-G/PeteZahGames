import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { runInterstitial } from "@/lib/applixir";

type Context = "game" | "app" | "vm";

export function useInterstitialUnlock(context: Context, enabled = true) {
  const [unlocked, setUnlocked] = useState(!enabled);
  const [phase, setPhase] = useState<"checking" | "ad" | "ready">(
    enabled ? "checking" : "ready"
  );

  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
      setPhase("ready");
      return;
    }

    let cancelled = false;
    setUnlocked(false);
    setPhase("checking");

    (async () => {
      setPhase("ad");
      try {
        let userId: string | undefined;
        try {
          const me = await fetch("/api/me", { credentials: "include" });
          if (me.ok) {
            const d = await me.json();
            if (d?.user?.id) userId = String(d.user.id);
          }
        } catch {}
        await runInterstitial(context, userId);
      } catch {}
      if (!cancelled) {
        setUnlocked(true);
        setPhase("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, enabled]);

  return { unlocked, phase };
}

export function InterstitialOverlay({ phase }: { phase: "checking" | "ad" | "ready" }) {
  if (phase === "ready") return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "hsla(220, 35%, 5%, 0.92)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Loader2 size={18} className="animate-spin" style={{ color: "hsla(213,70%,62%,1)" }} />
      <p style={{ margin: 0, fontSize: 12, color: "hsla(0,0%,100%,0.72)" }}>
        {phase === "ad" ? "Short ad — thanks for supporting PeteZah" : "Preparing…"}
      </p>
      <p style={{ margin: 0, fontSize: 10, color: "hsla(0,0%,100%,0.4)" }}>
        At most once every 5 minutes
      </p>
    </div>
  );
}

export function InterstitialGate({
  context,
  children,
}: {
  context: Context;
  children: ReactNode;
}) {
  const { unlocked, phase } = useInterstitialUnlock(context);
  return (
    <div className="absolute inset-0">
      {unlocked ? children : null}
      <InterstitialOverlay phase={phase} />
    </div>
  );
}
