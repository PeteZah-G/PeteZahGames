import { motion } from "framer-motion";
import { Wifi, Battery, Shield, Download } from "lucide-react";

interface StatusBarProps {
  tabCount: number;
  spaceCount: number;
}

const LEGAL_LINKS = [
  { key: "tos", label: "ToS", href: "/terms" },
  { key: "privacy", label: "Privacy", href: "/privacy-policy" },
  { key: "dmca", label: "DMCA", href: "/dmca" },
] as const;

export default function StatusBar({ tabCount, spaceCount }: StatusBarProps) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 chrome-bar"
      style={{ borderTop: "1px solid hsla(210, 40%, 80%, 0.08)" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-mono tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)" }}>
          {tabCount} tabs · {spaceCount} spaces
        </span>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-1.5" style={{ color: "hsla(0,0%,100%,0.4)" }}>
          <Download size={9} />
          <span className="text-[9px] font-mono">0</span>
        </div>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-2.5">
          {LEGAL_LINKS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-mono transition-colors capitalize"
              style={{ color: "hsla(0,0%,100%,0.32)", textDecoration: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.32)"; }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Shield size={9} style={{ color: "hsla(210, 90%, 70%, 0.75)" }} />
          <span className="text-[9px] font-mono tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)" }}>Secure</span>
        </div>
        <div className="w-px h-2.5" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />
        <div className="flex items-center gap-2" style={{ color: "hsla(0,0%,100%,0.4)" }}>
          <Wifi size={9} />
          <Battery size={10} />
          <span className="text-[9px] font-mono tracking-wider" style={{ color: "hsla(0,0%,100%,0.45)" }}>{time}</span>
        </div>
      </div>
    </motion.div>
  );
}
