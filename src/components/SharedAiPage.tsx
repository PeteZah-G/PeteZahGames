import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, MessageSquare } from "lucide-react";

type Msg = { role: string; content: string };

export default function SharedAiPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("Shared chat");
  const [messages, setMessages] = useState<Msg[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = String(token || "").replace(/[^a-f0-9]/gi, "");
        if (t.length !== 32) throw new Error("Invalid share link");
        const r = await fetch(`/api/ai/share/${t}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Not found");
        if (cancelled) return;
        setTitle(d.conversation?.title || "Shared chat");
        setMessages(Array.isArray(d.conversation?.messages) ? d.conversation.messages : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load share");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col"
      style={{ background: "hsla(220, 35%, 5%, 1)", color: "white" }}
    >
      <header
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.1)" }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: "hsla(205, 90%, 68%, 1)" }} />
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-white/40">Shared PeteAI conversation</p>
          </div>
        </div>
        <Link
          to="/"
          className="text-[12px] px-3 py-1.5 rounded-lg"
          style={{
            background: "hsla(205, 80%, 55%, 0.16)",
            border: "1px solid hsla(205, 80%, 60%, 0.28)",
            color: "hsla(205, 90%, 78%, 1)",
            textDecoration: "none",
          }}
        >
          Open PeteZah
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 max-w-3xl w-full mx-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-white/45 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}
        {error && !loading && (
          <div className="text-center py-20 text-sm text-white/50">{error}</div>
        )}
        {!loading &&
          !error &&
          messages.map((m, i) => (
            <div
              key={i}
              className="mb-3 rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
              style={{
                background:
                  m.role === "user"
                    ? "hsla(205, 70%, 50%, 0.14)"
                    : "hsla(210, 40%, 90%, 0.05)",
                border: "1px solid hsla(210, 40%, 90%, 0.1)",
                whiteSpace: "pre-wrap",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1">
                {m.role === "user" ? "You" : "PeteAI"}
              </div>
              {m.content}
            </div>
          ))}
      </main>
    </div>
  );
}
