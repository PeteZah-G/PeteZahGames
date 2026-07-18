import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, Battery, Shield, Download, X } from "lucide-react";

interface StatusBarProps {
  tabCount: number;
  spaceCount: number;
}

type ModalType = "tos" | "privacy" | "dmca" | null;

const TOS = `Terms of Service
Last Updated: January 24, 2026

Please read these Terms of Service carefully before using our web proxy service. By accessing or using the service, you agree to be bound by these terms.

1. Acceptance of Terms
By creating an account or using this service, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you may not use the service.

2. Description of Service
We provide a web proxy service that allows users to access internet content through our platform. The service includes:
  • Web browsing proxy capabilities
  • Embedded games and applications
  • User account management
  • Community features and feedback systems

3. User Responsibilities
As a user of this service, you agree to:
  • Provide accurate and truthful information when creating an account
  • Maintain the security of your account credentials
  • Use the service in compliance with all applicable laws and regulations
  • Respect the intellectual property rights of third parties
  • Not engage in illegal activities through our service
  • Not attempt to compromise the security or integrity of the service
  • Not use automated systems to abuse or overload the service

4. Acceptable Use Policy
You may not use this service to access, distribute, or store illegal content; violate any law; infringe on intellectual property rights; harass or harm others; distribute malware; attempt to bypass security measures; engage in fraudulent activities; or scrape or abuse our infrastructure.

5. Educational and Network Restrictions
This service may be capable of bypassing network restrictions. We do not condone violating school, workplace, or institutional network policies. Users are solely responsible for ensuring their use complies with applicable policies. By using this service to access restricted content, you acknowledge that you do so at your own risk and accept full responsibility for any consequences.

6. Intellectual Property
All games, applications, and content accessible through our service belong to their respective copyright holders. We do not claim ownership of third-party content. Our service acts as a conduit for accessing publicly available content.

7. Account Termination
We reserve the right to suspend or terminate your account at any time for violation of these Terms, fraudulent or illegal activity, abuse of service resources, or any reason at our sole discretion.

8. Disclaimers and Limitations of Liability
This service is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service, accuracy of information, security of transmitted data, or that the service will meet your requirements. To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages.

9. Third-Party Content
Our service may provide access to third-party websites and content. We are not responsible for their availability, accuracy, privacy practices, or any damages caused by third-party content.

10. Indemnification
You agree to indemnify and hold harmless our service and its operators from any claims arising from your use of the service, violation of these Terms, or violation of any rights of third parties.

11. Changes to Terms
We reserve the right to modify these Terms at any time. Your continued use after changes are posted constitutes acceptance.

12. Contact Information
Email: contact@petezahgames.com
Discord: discord.petezahgames.com`;

const PRIVACY = `Privacy Policy
Last Updated: January 24, 2026

This Privacy Policy describes how we collect, use, and protect your information when you use our web proxy service.

Information We Collect

Account Information:
  • Email address
  • Username
  • Password (encrypted with bcrypt)
  • Optional profile information (bio, avatar, age, school)

Usage Data:
  • IP addresses for security and abuse prevention
  • Browser type and version
  • Device information
  • Connection timestamps
  • Pages accessed through our service

Local Storage Data: If you choose to sync settings, we store your preferences on our servers.

How We Use Your Information
  • To provide and maintain our proxy service
  • To verify your identity and manage your account
  • To detect and prevent abuse, fraud, and malicious activity
  • To improve service performance and user experience
  • To respond to user feedback and support requests
  • To comply with legal obligations

Data Security
We implement industry-standard security measures including bcrypt password hashing, secure session management, DDoS protection and rate limiting, and regular security audits. No internet transmission is 100% secure.

Data Retention
We retain your information for as long as your account is active. You may delete your account at any time to remove your personal information from our systems.

Cookies and Tracking
We use essential cookies for session management, authentication, and security verification only. We do not use third-party tracking cookies or sell your data to advertisers.

Third-Party Services
Our service acts as a proxy to third-party websites. We are not responsible for the privacy practices of websites you access through our service.

Children's Privacy
Our service is not intended for children under 13. Contact us immediately if you believe we have collected information from a child under 13.

Your Rights
  • Access your personal information
  • Correct inaccurate information
  • Delete your account and associated data
  • Export your data
  • Opt-out of non-essential data collection

Contact
Email: contact@petezahgames.com
Discord: discord.petezahgames.com`;

const DMCA = `DMCA Policy
Last Updated: January 24, 2026

This Digital Millennium Copyright Act (DMCA) Policy outlines our procedures for responding to claims of copyright infringement.

Copyright Ownership
All games, applications, images, videos, and other content accessible through our service belong to their respective copyright holders. We do not claim ownership of any third-party content. Our service acts as a technical conduit that allows users to access publicly available internet content.

Safe Harbor Provisions
We operate under the safe harbor provisions of the DMCA (17 U.S.C. § 512). As a service provider that merely transmits, routes, or provides connections for material, we are not liable for copyright infringement by users, provided we respond expeditiously to valid notices.

Filing a DMCA Takedown Notice
A valid notice must include:
  • Identification of the copyrighted work claimed to be infringed
  • Identification of the infringing material and its location (URLs are helpful)
  • Your name, address, telephone number, and email address
  • A good faith statement that the use is not authorized by the copyright owner
  • A statement that the information is accurate, under penalty of perjury
  • Your physical or electronic signature

Send notices to:
  Email: contact@petezahgames.com
  Subject: DMCA Takedown Notice

We process valid notices within 48–72 hours of receipt.

Counter-Notification
If content was removed by mistake, you may file a counter-notification including your signature, identification of removed material, a good faith belief statement, your contact information, and consent to jurisdiction.

Repeat Infringer Policy
We terminate accounts of users who are repeat infringers in accordance with the DMCA.

Misrepresentation Warning
Under Section 512(f), knowingly misrepresenting infringing material may result in liability for damages including attorney fees.

Fair Use Considerations
Before submitting a notice, consider whether the use constitutes fair use (criticism, commentary, news reporting, teaching, research). Consult a legal professional if unsure.

Contact
Email: petezahgames@gmail.com
Discord: discord.petezahgames.com`;

function LegalModal({ type, onClose }: { type: ModalType; onClose: () => void }) {
  if (!type) return null;
  const map = { tos: { title: "Terms of Service", body: TOS }, privacy: { title: "Privacy Policy", body: PRIVACY }, dmca: { title: "DMCA Policy", body: DMCA } };
  const { title, body } = map[type];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        className="relative z-10 w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 scrollbar-thin">
          <pre className="text-[11px] text-foreground/70 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function StatusBar({ tabCount, spaceCount }: StatusBarProps) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <>
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
            {(["tos", "privacy", "dmca"] as ModalType[]).map((key) => (
              <button
                key={key}
                onClick={() => setModal(key)}
                className="text-[9px] font-mono transition-colors capitalize"
                style={{ color: "hsla(0,0%,100%,0.32)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.7)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "hsla(0,0%,100%,0.32)"; }}
              >
                {key === "tos" ? "ToS" : key === "privacy" ? "Privacy" : "DMCA"}
              </button>
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

      <AnimatePresence>
        {modal && <LegalModal type={modal} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </>
  );
}