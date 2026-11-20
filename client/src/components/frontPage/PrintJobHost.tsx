/**
 * Mounted once for the whole app, beside the other global surfaces: what a running
 * Observer print needs while the reader is elsewhere in Brainstorm (services/printJob).
 * It cancels the print (and a publish) when another account signs in, asks before the tab
 * closes while one runs or its paper waits to be published, and says how it ended when the
 * reader isn't on the Observer page.
 */
import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useActiveAccount } from "applesauce-react/hooks";
import { Loader2, Newspaper } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useNow } from "@/hooks/useNow";
import { statusLine } from "@/lib/frontPage/printProgress";
import {
  cancelPrintUnlessFor,
  getPrintJob,
  holdsTab,
  isRunning,
  subscribePrintJob,
  usePrintJob,
  type PrintJob,
} from "@/services/printJob";
import { cn } from "@/lib/utils";

export const FRONT_PAGE_PATH = "/front-page";

export function PrintJobHost() {
  const account = useActiveAccount();
  const pubkey = account?.pubkey ?? null;
  const [location, navigate] = useLocation();
  const onPage = useRef(location === FRONT_PAGE_PATH);
  onPage.current = location === FRONT_PAGE_PATH;
  const job = usePrintJob(pubkey);
  const holding = holdsTab(job);

  // A print belongs to the account that started it: its paper would be published as
  // whoever is signed in now, so a switch cancels it.
  useEffect(() => cancelPrintUnlessFor(pubkey), [pubkey]);

  // Closing or reloading the tab ends the print, or loses a paid paper on its way to the
  // site: ask first, and only then (`holdsTab`).
  useEffect(() => {
    if (!holding) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [holding]);

  // How it ended, said where the reader is: the Observer page says it itself.
  useEffect(() => {
    let last = getPrintJob();
    return subscribePrintJob(() => {
      const now = getPrintJob();
      const ended = !!last && last.id === now?.id && last.finishedAt === null && now.finishedAt !== null;
      last = now;
      if (!ended || !now || onPage.current) return;
      const read = (
        <ToastAction altText="Open the Observer" onClick={() => navigate(FRONT_PAGE_PATH)}>
          Open
        </ToastAction>
      );
      if (now.outcome === "printed") {
        toast({ title: "Today's Observer is ready", action: read });
      } else if (now.run.state === "error") {
        toast({ title: "Couldn't print", description: now.run.message, variant: "destructive", action: read });
      } else if (now.run.state === "refused") {
        toast({
          title: "Couldn't print",
          description: "The page didn't pass the check, so it isn't shown.",
          variant: "destructive",
          action: read,
        });
      } else if (now.run.state === "pending") {
        toast({ title: "Couldn't print", description: "Search isn't ranking through you yet.", action: read });
      }
    });
  }, [navigate]);

  return null;
}

/**
 * In the header, anywhere in the app while a print runs: what it is doing, as the way
 * back to the Observer page. Not on that page, which shows the print itself.
 */
export function PrintingIndicator() {
  const account = useActiveAccount();
  const [location] = useLocation();
  const job = usePrintJob(account?.pubkey ?? null);
  if (!job || !isRunning(job) || location === FRONT_PAGE_PATH) return null;
  return <Printing job={job} />;
}

/** The indicator itself: its clock ticks only while it is mounted, so only while a print runs. */
function Printing({ job }: { job: PrintJob }) {
  const now = useNow(1_000);
  const step = statusLine(job.progress, now, false);
  return (
    <Link
      href={FRONT_PAGE_PATH}
      aria-label={`Printing your Observer: ${step}. Open the Observer`}
      title={step}
      className={cn(
        "mr-1 inline-flex h-9 max-w-[16rem] items-center gap-2 rounded-full border border-border bg-card px-2.5 text-xs text-muted-foreground",
        "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      data-testid="front-page-printing-indicator"
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center">
        <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
        <Loader2 className="absolute -right-1.5 -top-1.5 h-3 w-3 animate-spin text-brand-primary" aria-hidden="true" />
      </span>
      <span className="hidden min-w-0 flex-col leading-tight md:flex">
        <span className="font-medium text-foreground">Printing your Observer…</span>
        <span className="truncate">{step}</span>
      </span>
    </Link>
  );
}
