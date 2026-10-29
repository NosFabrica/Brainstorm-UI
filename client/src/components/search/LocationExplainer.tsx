/**
 * "How do we know where you are?" — the sources, in the order the search
 * uses them, each named plainly. The same sheet as the search syntax help
 * (SearchSyntaxSheet): a kicker, rows that read token → what, small print.
 * Nothing here says "trust us": what is read, when, and that a tapped
 * position is kept nowhere.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/section-header";

/** A source, and what the search reads it for. In the order the search tries them. */
const SOURCES: { what: string; how: string }[] = [
  {
    what: "The words you type",
    how: "A town or a kind of place in your search places the results. Nothing else is needed.",
  },
  {
    what: "Your browser's language",
    how: "Read only to choose kilometres or miles and a currency — never to place you.",
  },
  {
    what: "A rough guess from your network",
    how: "When our server can tell a country or city from the connection, results start there. Nothing is asked of your device.",
  },
  {
    what: "Your precise position",
    how: "Only when you tap Near me. Your browser asks you first; the position is used for that search and not stored.",
  },
];

export function LocationExplainer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto" data-testid="location-explainer">
        <DialogHeader>
          <DialogTitle>How do we know where you are?</DialogTitle>
          <DialogDescription>Four sources, tried in this order. Each says what is read, and when.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <section className="space-y-2">
            <SectionHeader kicker="Where you are" />
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,15rem)_1fr]">
              {SOURCES.map((s, i) => (
                <div key={s.what} className="contents">
                  <dt className="flex min-w-0 items-baseline gap-2 pt-0.5">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-deep dark:bg-brand-primary/20 dark:text-brand-link">
                      {i + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{s.what}</span>
                  </dt>
                  <dd className="mb-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mb-0">
                    {s.how}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Near me is the only one that asks. It is asked once, used for this search, and not stored — the next search
            starts from the words again.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
