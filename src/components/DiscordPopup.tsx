import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle } from "lucide-react";

const STORAGE_KEY = "petezah-discord-popup-last";

export default function DiscordPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    if (!last || now - Number(last) > 3600000) {
      const timer = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
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
            style={{ background: "hsla(220, 40%, 4%, 0.78)", backdropFilter: "blur(8px)" }}
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            className="relative z-10 w-full max-w-xl rounded-2xl flex flex-col overflow-hidden"
            style={{
              background: "hsla(220, 35%, 6%, 0.98)",
              border: "1px solid hsla(210, 40%, 80%, 0.12)",
              boxShadow: "0 24px 80px hsla(0,0%,0%,0.55)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.1)" }}
            >
              <div className="flex items-center gap-2">
                <MessageCircle size={13} style={{ color: "hsl(235 86% 72%)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "hsla(0,0%,98%,0.95)" }}>
                  Join our Discord
                </h2>
              </div>
              <button
                onClick={dismiss}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "hsla(0,0%,100%,0.45)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "hsla(0,0%,100%,0.06)";
                  e.currentTarget.style.color = "hsla(0,0%,100%,0.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "hsla(0,0%,100%,0.45)";
                }}
              >
                <X size={13} />
              </button>
            </div>

            <div className="px-5 py-6 flex flex-col gap-4">
              <p className="text-[12px] leading-relaxed font-sans" style={{ color: "hsla(0,0%,100%,0.78)" }}>
                Connect with the PeteZah community. Get updates, share feedback, report issues, and hang out with other users.
              </p>

              <div className="flex flex-col gap-2">
                <a
                  href={"https://discord.com/invite/arcgZTV9zX"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={dismiss}
                  className="w-full py-2.5 rounded-xl font-medium text-sm text-center transition-colors"
                  style={{
                    background: "hsl(235 70% 58%)",
                    color: "hsla(0,0%,100%,0.98)",
                  }}
                >
                  Open Discord
                </a>
                <button
                  onClick={dismiss}
                  className="w-full py-2 rounded-xl text-[11px] transition-colors"
                  style={{ color: "hsla(0,0%,100%,0.5)", background: "transparent", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "hsla(0,0%,100%,0.9)";
                    e.currentTarget.style.background = "hsla(0,0%,100%,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "hsla(0,0%,100%,0.5)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
