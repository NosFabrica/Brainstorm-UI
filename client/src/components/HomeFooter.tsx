import { useLocation } from "wouter";

const LINKS = [
  { label: "About", path: "/about" },
  { label: "How search works", path: "/how-search-works" },
  { label: "Developers", path: "/developers" },
  { label: "Q&A", path: "/faq" },
];

/** The home page's quiet bottom row. */
export function HomeFooter() {
  const [, setLocation] = useLocation();
  return (
    // Already hidden on narrow phones for lack of room; a landscape phone has
    // even less of it, and these links were what the Recent panel collided
    // with. Same rationale, height axis — they stay one rotation away.
    <footer className="relative z-10 hidden sm:flex short:!hidden flex-wrap items-center justify-start gap-x-6 gap-y-2 px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
      {LINKS.map((l) => (
        <button
          key={l.path}
          type="button"
          onClick={() => setLocation(l.path)}
          className="font-medium text-slate-500 dark:text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid={`footer-home-${l.path.slice(1)}`}
        >
          {l.label}
        </button>
      ))}
    </footer>
  );
}
