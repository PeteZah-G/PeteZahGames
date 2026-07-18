import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Megaphone } from "lucide-react";

const SEEN_KEY = "pz-announcement-seen";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at?: number;
}

export default function GlobalAnnouncement() {
  const [item, setItem] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/active", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.announcement) return;
        const seen = localStorage.getItem(SEEN_KEY);
        if (seen === d.announcement.id) return;
        setItem(d.announcement);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    if (item) localStorage.setItem(SEEN_KEY, item.id);
    setItem(null);
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "hsla(220, 40%, 4%, 0.72)",
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 16,
              background: "hsla(220, 30%, 9%, 0.98)",
              border: "1px solid hsla(210, 40%, 80%, 0.12)",
              boxShadow: "0 24px 80px hsla(0,0%,0%,0.5)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderBottom: "1px solid hsla(210, 40%, 80%, 0.1)",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "hsla(213, 70%, 55%, 0.2)",
                  border: "1px solid hsla(213, 70%, 55%, 0.35)",
                }}
              >
                <Megaphone size={13} style={{ color: "hsl(213 80% 70%)" }} />
              </div>
              <h2 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 700, color: "hsla(0,0%,96%,0.95)" }}>
                {item.title}
              </h2>
              <button
                onClick={dismiss}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "hsla(0,0%,100%,0.45)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: "16px 18px 18px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "hsla(0,0%,100%,0.72)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.content}
              </p>
              <button
                onClick={dismiss}
                style={{
                  marginTop: 16,
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid hsla(213, 60%, 50%, 0.4)",
                  background: "hsla(213, 70%, 48%, 0.25)",
                  color: "hsl(213 90% 78%)",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
