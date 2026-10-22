/**
 * "How do we know where you are?" — the sources, in the order the search
 * uses them, each named plainly. Nothing here says "trust us": a reader can
 * see what is read and when, and that a tapped position is kept nowhere.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SOURCES: { what: string; how: string }[] = [
  { what: "The words you typed", how: "a town or a kind of place in your search is what the results are placed by." },
  {
    what: "Your browser's language",
    how: "read only to choose kilometres or miles and a currency — never to place you.",
  },
  {
    what: "A rough guess from your network",
    how: "when our server can tell a country or city from the connection, results start there. Nothing is asked of your device.",
  },
  {
    what: "Your precise position",
    how: "only when you tap Near me. Your browser asks you first; the position is used for that search and not stored.",
  },
];

export function LocationExplainer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="location-explainer">
        <DialogHeader>
          <DialogTitle>How do we know where you are?</DialogTitle>
          <DialogDescription>
            Four sources, used in this order. Each is listed so you can see what is read and when.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          {SOURCES.map((s, i) => (
            <li key={s.what} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-deep">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{s.what}</span>
                <span className="text-slate-600 dark:text-slate-300"> — {s.how}</span>
              </span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
