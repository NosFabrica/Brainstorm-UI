/**
 * Contact & Support, and About — the cards that were Settings › About until
 * 2026-11-02. Nothing on them is a setting, so they live with the FAQ.
 */
import { Code2, ExternalLink, Mail } from "lucide-react";
import { SiGithub } from "react-icons/si";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";
import nostrLogo from "@assets/download_1774042580188.png";

export function ContactCard() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-contact-support"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <Mail className="h-4 w-4 text-brand-deep" />
          </div>
          <div>
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-contact-support-title"
            >
              Contact & Support
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-contact-support-subtitle">
              Developer outreach and general inquiries
            </p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div
            className="rounded-xl border border-brand-accent/15 bg-white/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="card-list-your-client"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                <Code2 className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-list-client-title"
                >
                  List Your Client
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-list-client-subtitle">
                  Get featured on Brainstorm
                </p>
              </div>
            </div>
            <p
              className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-list-client-description"
            >
              Built a Nostr client that supports NIP-85? Get your app featured on our Supported Clients showcase — free
              promotion to our growing user base.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=NIP-85%20Client%20Listing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-list-client-email"
            >
              <Mail className="h-4 w-4" />
              support@nosfabrica.com
            </a>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="text-list-client-helper">
              Include your client name, platform, and a brief description
            </p>
          </div>

          <div
            className="rounded-xl border border-brand-accent/15 bg-white/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="card-get-in-touch"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                <Mail className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-get-in-touch-title"
                >
                  Get in Touch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-get-in-touch-subtitle">
                  Questions, feedback, or support
                </p>
              </div>
            </div>
            <p
              className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-get-in-touch-description"
            >
              Have questions, feedback, or need help with Brainstorm? We'd love to hear from you.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=Brainstorm%20Support"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-get-in-touch-email"
            >
              <Mail className="h-4 w-4" />
              support@nosfabrica.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutCard() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-about"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-900 shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:ring-slate-800/60">
            <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
          </div>
          <div>
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-about-title"
            >
              NosFabrica
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-about-subtitle">
              Weaving the fabric of Nostr
            </p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <p
          className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="text-about-description"
        >
          NosFabrica builds the open-source, scalable Web of Trust engines that power a safer, cleaner Nostr. We analyze
          raw network signals and turn them into clear, reliable scores.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            href="https://github.com/NosFabrica"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-github"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 transition-colors group-hover/link:bg-slate-800">
              <SiGithub className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-github-label"
              >
                GitHub
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Open-source projects</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>

          <a
            href="https://njump.me/npub1healthsx3swcgtknff7zwpg8aj2q7h49zecul5rz490f6z2zp59qnfvp8p"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-nostr"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl">
              <img src={nostrLogo} alt="Nostr" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-nostr-label"
              >
                Nostr
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Follow on Nostr</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>

          <a
            href="https://nosfabrica.com"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-website"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-900 transition-colors group-hover/link:bg-slate-800">
              <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-website-label"
              >
                Website
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">nosfabrica.com</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/60">
          <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="text-about-copyright">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Brainstorm</span> by NosFabrica —
            open-source under AGPL-3.0 license
          </p>
          <span
            className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-300 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-600"
            data-testid="text-about-version"
          >
            v1.0
          </span>
        </div>
      </div>
    </div>
  );
}
