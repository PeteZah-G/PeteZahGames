import { motion } from "framer-motion";
import { X, User, Settings, LogOut, Moon, Globe, Shield, Palette, HardDrive, Bell } from "lucide-react";

interface AccountPanelProps {
  onClose: () => void;
}

export default function AccountPanel({ onClose }: AccountPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[360px] rounded-2xl liquid-glass overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-foreground">Account</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-accent transition-colors">
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl glass">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-border">
              <User size={16} className="text-primary/80" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Guest User</p>
              <p className="text-[11px] text-muted-foreground">Sign in to sync</p>
            </div>
          </div>

          <div className="space-y-1">
            {[
              { icon: User, label: "Profile", desc: "Manage your identity" },
              { icon: Palette, label: "Appearance", desc: "Theme & display" },
              { icon: Shield, label: "Privacy", desc: "Security settings" },
              { icon: Globe, label: "Search Engine", desc: "Default search" },
              { icon: Bell, label: "Notifications", desc: "Alerts & sounds" },
              { icon: HardDrive, label: "Storage", desc: "Cache & data" },
              { icon: Settings, label: "Advanced", desc: "Developer tools" },
            ].map(({ icon: Icon, label, desc }) => (
              <button
                key={label}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/60 transition-all group text-left"
              >
                <Icon size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                <div className="flex-1">
                  <span className="text-[13px] text-foreground">{label}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{desc}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive/10 transition-all group text-left">
              <LogOut size={14} className="text-muted-foreground group-hover:text-destructive transition-colors" />
              <span className="text-[13px] text-muted-foreground group-hover:text-destructive transition-colors">Sign Out</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
