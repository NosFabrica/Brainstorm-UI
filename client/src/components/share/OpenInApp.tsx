import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";
import dittoLogoImg from "@/assets/ditto-logo.png";
import primalLogoImg from "@/assets/primal-logo.png";

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

function primalUrl(e: OpenEntity): string {
  const seg = e.kind === "profile" ? "p" : e.kind === "article" ? "a" : "e";
  return `https://primal.net/${seg}/${e.bech32}`;
}

const btn =
  "inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-accent/50 hover:shadow-sm text-sm font-semibold text-slate-700 dark:text-slate-200 transition-all";
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
    { name: "Ditto", href: `https://ditto.pub/${entity.bech32}`, external: true, testId: "open-ditto", logo: <img src={dittoLogoImg} alt="" className={logoCls} /> },
    { name: "Nostria", href: nostriaHref, external: entity.kind === "profile", testId: "open-nostria", logo: <img src={nostriaIconImg} alt="" className={logoCls} /> },
    { name: "Primal", href: primalUrl(entity), external: true, testId: "open-primal", logo: <img src={primalLogoImg} alt="" className={logoCls} /> },
  ];

  return (
    <section className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 ${className}`} data-testid="open-in-app">
      <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500 uppercase mb-3">Open in a Nostr app</p>
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
      <a href={uri} className="mt-2.5 block text-center text-xs text-slate-400 dark:text-slate-500 hover:text-brand-deep transition-colors" data-testid="open-default">
        or open in your default app →
      </a>
    </section>
  );
}
