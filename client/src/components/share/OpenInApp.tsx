import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";

/**
 * Shared "open in a Nostr app" block — a SECONDARY escape hatch on the public
 * share pages (/e, /p, /a). Brainstorm itself is the destination; this just hands
 * power users off to a client to reply/zap. Named clients (alphabetical) with
 * correct per-entity URLs + the universal `nostr:` default.
 */
export type OpenEntity = {
  /** Which kind of thing we're linking to — drives the per-client URL path. */
  kind: "event" | "profile" | "article";
  /** The entity's bech32 (nevent / npub / naddr), no `nostr:` prefix. */
  bech32: string;
  /** The `nostr:` URI for the OS default handler (covers Damus, etc.). */
  uri: string;
};

/**
 * Primal & Ditto marks recreated inline (no binary asset) — each on the dark
 * rounded tile of the real app icon, sized to match the Amethyst/Nostria logos.
 * Swap in official PNGs by dropping them in assets/ and rendering an <img>.
 */
function PrimalLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="primalg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ab3ff" />
          <stop offset="1" stopColor="#2f6bff" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="5.5" fill="#0c1230" />
      <circle cx="12" cy="12" r="7.2" fill="url(#primalg)" />
      <path d="M9.2 15.4a4.1 4.1 0 1 1 5.7-3.2" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function DittoLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#1a1233" />
      <ellipse cx="12" cy="12.5" rx="9.2" ry="3.3" fill="none" stroke="#8f6bff" strokeWidth="1.5" transform="rotate(-20 12 12.5)" />
      <circle cx="12" cy="11.6" r="5.1" fill="#7c5cff" />
      <circle cx="12" cy="9.5" r="0.95" fill="#fff" />
      <rect x="11.25" y="11" width="1.5" height="4" rx="0.75" fill="#fff" />
    </svg>
  );
}

function primalUrl(e: OpenEntity): string {
  const seg = e.kind === "profile" ? "p" : e.kind === "article" ? "a" : "e";
  return `https://primal.net/${seg}/${e.bech32}`;
}

const btn =
  "inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white hover:border-[#7c86ff]/50 hover:shadow-sm text-sm font-semibold text-slate-700 transition-all";
const logoCls = "w-5 h-5 rounded-md object-contain";

export function OpenInApp({ entity, className = "" }: { entity: OpenEntity; className?: string }) {
  const { uri } = entity;
  // Primal renders every entity type on the web; Ditto resolves bech32 entities
  // at its root; Nostria has clean profile URLs (notes/articles fall back to the
  // OS handler); Amethyst is the Android `nostr:` handler.
  const nostriaHref = entity.kind === "profile" ? `https://nostria.app/p/${entity.bech32}` : uri;

  // Alphabetical.
  const clients: { name: string; href: string; external: boolean; logo: JSX.Element; testId: string }[] = [
    { name: "Amethyst", href: uri, external: false, testId: "open-amethyst", logo: <img src={amethystLogoImg} alt="" className={logoCls} /> },
    { name: "Ditto", href: `https://ditto.pub/${entity.bech32}`, external: true, testId: "open-ditto", logo: <DittoLogo className={logoCls} /> },
    { name: "Nostria", href: nostriaHref, external: entity.kind === "profile", testId: "open-nostria", logo: <img src={nostriaIconImg} alt="" className={logoCls} /> },
    { name: "Primal", href: primalUrl(entity), external: true, testId: "open-primal", logo: <PrimalLogo className={logoCls} /> },
  ];

  return (
    <section className={`rounded-2xl bg-white border border-slate-200 shadow-sm p-5 ${className}`} data-testid="open-in-app">
      <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-3">Open in a Nostr app</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {clients.map((c) => (
          <a
            key={c.name}
            href={c.href}
            {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={btn}
            data-testid={c.testId}
          >
            {c.logo} {c.name}
          </a>
        ))}
      </div>
      <a href={uri} className="mt-2.5 block text-center text-xs text-slate-400 hover:text-[#333286] transition-colors" data-testid="open-default">
        or open in your default app →
      </a>
    </section>
  );
}
