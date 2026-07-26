import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle, Youtube } from "lucide-react";

const LAST_KEY = "petezah-discord-popup-last";
const SEEN_KEY = "petezah-socials-first-seen";
const COOLDOWN_MS = 30 * 60 * 1000;
const DISCORD_URL = "https://discord.com/invite/arcgZTV9zX";
const YOUTUBE_URL = "https://youtube.com/@ngnix062";

export default function DiscordPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let firstSeen = false;
    try {
      firstSeen = localStorage.getItem(SEEN_KEY) === "1";
      if (!firstSeen) {
        const legacy = Number(localStorage.getItem("petezah-socials-visits") || "0") || 0;
        if (legacy >= 1) {
          firstSeen = true;
          localStorage.setItem(SEEN_KEY, "1");
        }
      }
    } catch {
      firstSeen = false;
    }

    if (!firstSeen) {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
      return;
    }

    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_KEY) || "0") || 0;
    } catch {
      last = 0;
    }
    if (Date.now() - last < COOLDOWN_MS) return;

    const timer = window.setTimeout(() => {
      setShow(true);
      try {
        localStorage.setItem(LAST_KEY, String(Date.now()));
      } catch {}
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {}
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-6"
        >
          <div
            className="absolute inset-0"
            style={{ background: "hsla(220, 40%, 4%, 0.72)", backdropFilter: "blur(10px)" }}
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative z-10 w-full max-w-sm flex flex-col items-center text-center"
            style={{ pointerEvents: "auto" }}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="group absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                color: "hsla(0,0%,100%,0.4)",
                background: "hsla(216, 28%, 12%, 0.9)",
                border: "1px solid hsla(210, 40%, 80%, 0.12)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = "hsla(0, 72%, 42%, 0.92)";
                el.style.borderColor = "hsla(0, 72%, 58%, 0.55)";
                el.style.color = "hsl(0 0% 100%)";
                el.style.transform = "scale(1.06)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = "hsla(216, 28%, 12%, 0.9)";
                el.style.borderColor = "hsla(210, 40%, 80%, 0.12)";
                el.style.color = "hsla(0,0%,100%,0.4)";
                el.style.transform = "scale(1)";
              }}
            >
              <X size={14} strokeWidth={2.25} />
            </button>

            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "hsl(216 30% 10%)",
                border: "1px solid hsl(213 40% 32%)",
              }}
            >
              <MessageCircle size={22} style={{ color: "hsl(235 86% 78%)" }} />
            </div>

            <p
              className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
              style={{ color: "hsl(213 75% 68%)" }}
            >
              Community
            </p>
            <h2
              className="text-2xl font-extrabold tracking-tight mb-2"
              style={{ color: "hsl(0 0% 100%)" }}
            >
              Stay connected
            </h2>
            <p
              className="text-sm leading-relaxed mb-6 max-w-[30ch]"
              style={{ color: "hsl(216 15% 72%)" }}
            >
              Join Discord for updates and support. YouTube for videos and channel drops.
            </p>

            <div className="flex flex-col gap-2.5 w-full max-w-[280px]">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
                style={{
                  background: "hsl(235 60% 42%)",
                  border: "1px solid hsl(235 50% 52%)",
                  textDecoration: "none",
                }}
              >
                <MessageCircle size={15} />
                Join Discord
              </a>
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: "hsl(216 30% 10%)",
                  border: "1px solid hsl(213 40% 32%)",
                  color: "hsl(0 0% 96%)",
                  textDecoration: "none",
                }}
              >
                <Youtube size={15} style={{ color: "hsl(0 72% 58%)" }} />
                YouTube channel
              </a>
              <button
                type="button"
                onClick={dismiss}
                className="mt-1 py-2 text-[11px]"
                style={{
                  background: "none",
                  border: "none",
                  color: "hsl(216 15% 55%)",
                  cursor: "pointer",
                }}
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
