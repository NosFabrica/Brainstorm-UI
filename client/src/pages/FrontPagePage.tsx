import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ChevronRight,
  ExternalLink,
  Globe,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Maximize2,
  Newspaper,
  RotateCcw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyToClipboard } from "@/lib/clipboard";
import { observerNaddr, observerUrl, utcDay, type EditionEntry } from "@/lib/frontPage/observerSite";
import {
  PublishError,
  fetchBlob,
  leadHeadline,
  loadObserverSite,
  publishToObserver,
  type PublishFailure,
} from "@/services/observerSite";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useCanSearchMywot } from "@/hooks/useCanSearchMywot";
import { useScoringStatus } from "@/hooks/useScoringStatus";
import { wotStepOf, type WotStep } from "@/lib/frontPage/setupSteps";
import { pageWidth } from "@/lib/pageWidth";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useAgentKeys } from "@/hooks/useAgentKeys";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { logout } from "@/accounts/login-flow";
import { providerName, type AgentKey } from "@/lib/agentKeys";
import { rankModels } from "@/lib/frontPage/writer";
import { noteworthy, type ResolveChange } from "@/lib/frontPage/resolve";
import type { Violation } from "@/lib/frontPage/validate";
import { DESKS, shortNpub } from "@/lib/frontPage/desks";
import { cn } from "@/lib/utils";
import { accountKey, tabKey } from "@/lib/accountStorage";
import { withPaperCsp } from "@/lib/frontPage/validate";
import { printedToday, printedTodayZone, type PrintedEdition } from "@/lib/frontPage/observerSchedule";
import { browserTimeZone, formatClock } from "@/lib/scheduledTasks";
import { useObserverSchedule } from "@/hooks/useObserverSchedule";
import { MorningSchedule } from "@/components/frontPage/MorningSchedule";
import { useNow } from "@/hooks/useNow";
import { onAppResume } from "@/lib/appResume";
import { WriterError, fetchModels, printFrontPage, type PrintStep, type PullProgress } from "@/services/frontPage";
import type { Usage } from "@/lib/frontPage/writer";

/**
 * Today's front page: the Nostr Observer's daily paper, written from the reader's own
 * web of trust by the reader's own AI key. With "Publish to my Observer" on, each clean
 * paper also goes to the reader's public Observer site (quartz
 * `plans/2026-11-11-observer-site.md`), and the day tabs read the earlier editions back
 * from it — printed here, in Amethyst, or anywhere else. The just-printed paper also
 * survives a reload of this tab.
 */

const AI_SETTINGS = "/settings?tab=assistants&view=ai";

interface Printed {
  html: string;
  code: string;
  /** Which model wrote it; absent on a paper printed before this was kept. */
  model?: string;
  printedAt: number;
  /** Absent for an edition read back from the site that didn't record it. */
  events?: number;
  quotes?: number;
  rounds: number;
  usage: Usage | null;
  changes: ResolveChange[];
  /** Desks the search relay didn't answer this run: their sections may be thin. */
  unanswered?: number;
}

// The paper on show lives apart from the run, so a reprint's progress sits above the
// paper the reader is still reading instead of replacing it.
type Run =
  | { state: "idle" }
  | { state: "running"; step: PrintStep; pull: PullProgress | null }
  | { state: "refused"; violations: Violation[]; changes: ResolveChange[] }
  | { state: "pending" }
  | { state: "error"; message: string };

// --- session-only memory ------------------------------------------------------

const lastKey = (pubkey: string) => tabKey("frontPage:last", pubkey);

function readLast(pubkey: string): Printed | null {
  try {
    const raw = sessionStorage.getItem(lastKey(pubkey));
    return raw ? (JSON.parse(raw) as Printed) : null;
  } catch {
    return null;
  }
}

function writeLast(pubkey: string, page: Printed | null) {
  try {
    if (page) sessionStorage.setItem(lastKey(pubkey), JSON.stringify(page));
    else sessionStorage.removeItem(lastKey(pubkey));
  } catch {
    // private window or full storage: the page still shows, it just won't survive a reload
  }
}

const publishKey = (pubkey: string) => accountKey("frontPage:publish", pubkey);
const noticeKey = (pubkey: string) => accountKey("frontPage:observerNotice", pubkey);

/** "Publish to my Observer": on unless this account turned it off. */
function readPublish(pubkey: string): boolean {
  try {
    return localStorage.getItem(publishKey(pubkey)) !== "off";
  } catch {
    return true;
  }
}

function writePublish(pubkey: string, on: boolean) {
  try {
    localStorage.setItem(publishKey(pubkey), on ? "on" : "off");
  } catch {
    // remembered for this visit only
  }
}

function noticeSeen(pubkey: string): boolean {
  try {
    return localStorage.getItem(noticeKey(pubkey)) === "1";
  } catch {
    return false;
  }
}

function markNoticeSeen(pubkey: string) {
  try {
    localStorage.setItem(noticeKey(pubkey), "1");
  } catch {
    // shown again next time
  }
}

/** An edition read back from the site, as the page shows it; empty html until fetched. */
function fromEntry(entry: EditionEntry, html: string): Printed {
  return {
    html,
    code: entry.code ?? "",
    model: entry.model,
    printedAt: entry.printedAt ? entry.printedAt * 1000 : Date.parse(`${entry.day}T12:00:00Z`),
    events: entry.posts,
    quotes: entry.quotesVerified,
    rounds: 1,
    usage: null,
    changes: [],
  };
}

interface SiteState {
  editions: EditionEntry[];
  servers: string[];
  exists: boolean;
}

type PublishState =
  | { state: "idle" }
  /** Waiting for the reader to say yes to a public site, the first time. */
  | { state: "confirm"; paper: Printed }
  | { state: "publishing" }
  | { state: "published" }
  | { state: "failed"; message: string; reason: PublishFailure | null };

/** Where Brainstorm keeps the reader's Blossom servers (Settings › Messages › File servers). */
const FILE_SERVERS_SETTINGS = "/settings?tab=messages&focus=file-servers";

const modelKey = (url: string) => `frontPage:model:${url}`;

function readModel(url: string): string | null {
  try {
    return localStorage.getItem(modelKey(url));
  } catch {
    return null;
  }
}

function writeModel(url: string, model: string) {
  try {
    localStorage.setItem(modelKey(url), model);
  } catch {
    // remembered for this visit only
  }
}

// --- the model list -------------------------------------------------------------

type Models = { status: "loading" } | { status: "listed"; ids: string[] } | { status: "unlisted" };

function useModels(key: AgentKey | null): Models {
  const [models, setModels] = useState<Models>({ status: "loading" });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setModels({ status: "loading" });
    fetchModels(key, controller.signal)
      .then((ids) => {
        // A key changed mid-flight: this list is the old key's.
        if (controller.signal.aborted) return;
        const ranked = rankModels(ids);
        setModels(ranked.length ? { status: "listed", ids: ranked } : { status: "unlisted" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setModels({ status: "unlisted" });
      });
    return () => controller.abort();
  }, [key?.url, key?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return models;
}

// --- the page --------------------------------------------------------------------

/** Away this long, the site is asked again on return: a device may have printed meanwhile. */
const SITE_REASK_AWAY_MS = 60_000;

export default function FrontPagePage() {
  const user = useActiveAccountDisplay();
  // Everything below is one account's: its paper, its site, the editions fetched from
  // it, a publish in flight. Switching accounts starts it over instead of showing the
  // last account's under the new one's name (or publishing it to the new one's site).
  return <FrontPageBody key={user?.pubkey ?? "signed-out"} user={user} />;
}

function FrontPageBody({ user }: { user: ReturnType<typeof useActiveAccountDisplay> }) {
  const pubkey = user?.pubkey ?? null;
  const readerName = user?.displayName || (pubkey ? shortNpub(pubkey) : "");
  const keys = useAgentKeys();
  const key = keys.status === "ready" ? (keys.keys[0] ?? null) : null;
  const mywot = useHasMywot();
  const { canUseMywot, hasMywot, isSearchObserver } = useCanSearchMywot();

  const [page, setPage] = useState<Printed | null>(() => (pubkey ? readLast(pubkey) : null));
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [publish, setPublish] = useState(() => (pubkey ? readPublish(pubkey) : true));
  const [publishState, setPublishState] = useState<PublishState>({ state: "idle" });
  const [site, setSite] = useState<SiteState | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Editions fetched from the site, by sha256 (a day reprinted is other bytes): html, or
  // null when no server had them.
  const [fetched, setFetched] = useState<Record<string, string | null>>({});

  // The reader's Observer site: what the day tabs list. Asked again when the page is shown
  // again after a while away, so a paper a device printed meanwhile is known before the
  // "already printed today" hint is worked out.
  const [siteAsk, setSiteAsk] = useState(0);
  useEffect(
    () =>
      onAppResume((away) => {
        if (away >= SITE_REASK_AWAY_MS) setSiteAsk((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!pubkey) return;
    let live = true;
    loadObserverSite(pubkey)
      .then((loaded) => {
        if (live) setSite({ editions: loaded.index.editions, servers: loaded.servers, exists: !!loaded.event });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pubkey, siteAsk]);

  const sessionDay = page ? utcDay(page.printedAt) : null;
  // A paper already printed today (here, on another device, by Amethyst's schedule): a
  // hint beside Print, never a block on it. The spec's rule for a scheduled print: today
  // is a calendar day in the schedule's zone when there is one this account can read,
  // else in the viewer's. The schedule's read is shared with the card (one ask, one
  // decrypt). `now` ticks each minute (paused while hidden): the hint lapses at midnight.
  const now = useNow(60_000);
  const scheduleState = useObserverSchedule();
  const syncedSchedule = scheduleState.status === "ready" ? scheduleState.schedule : null;
  const todayZone = printedTodayZone(syncedSchedule, browserTimeZone());
  const todays = useMemo(() => {
    const editions: PrintedEdition[] = [...(site?.editions ?? [])];
    if (page) editions.push({ day: utcDay(page.printedAt), printedAt: Math.floor(page.printedAt / 1000) });
    return printedToday(editions, now, todayZone);
  }, [site, page, now, todayZone]);
  const days = useMemo(() => {
    const all = new Set<string>(site?.editions.map((e) => e.day) ?? []);
    if (sessionDay) all.add(sessionDay);
    return [...all].sort().reverse();
  }, [site, sessionDay]);
  const day = selectedDay && days.includes(selectedDay) ? selectedDay : (days[0] ?? null);
  const siteEntry = day && day !== sessionDay ? site?.editions.find((e) => e.day === day) : undefined;
  const shown: Printed | null =
    day === sessionDay ? page : siteEntry ? fromEntry(siteEntry, fetched[siteEntry.sha256] ?? "") : null;
  // No servers to ask is not an answer: nothing is remembered, so a later load can try.
  const shownFailed = !!siteEntry && (fetched[siteEntry.sha256] === null || site?.servers.length === 0);

  useEffect(() => {
    if (!siteEntry || !site || site.servers.length === 0 || fetched[siteEntry.sha256] !== undefined) return;
    const controller = new AbortController();
    const { sha256 } = siteEntry;
    fetchBlob(sha256, site.servers, { signal: controller.signal }).then((html) => {
      if (!controller.signal.aborted) setFetched((m) => ({ ...m, [sha256]: html }));
    });
    return () => controller.abort();
  }, [siteEntry, site, fetched]);

  // Read when a paper is ready, not when Print was pressed: turning publishing off while
  // the paper is being written must keep that paper private.
  const publishOn = useRef(publish);
  publishOn.current = publish;
  const choosePublish = (on: boolean) => {
    setPublish(on);
    publishOn.current = on;
    if (pubkey) writePublish(pubkey, on);
    if (!on) setPublishState((s) => (s.state === "confirm" ? { state: "idle" } : s));
  };

  const publishPaper = useCallback(
    async (printed: Printed) => {
      if (!pubkey) return;
      setPublishState({ state: "publishing" });
      try {
        const out = await publishToObserver({
          pubkey,
          html: printed.html,
          name: user?.displayName ?? "",
          printedAt: printed.printedAt,
          headline: leadHeadline(printed.html),
          code: printed.code,
          posts: printed.events,
          quotesVerified: printed.quotes,
          model: printed.model,
        });
        setSite((prev) => ({
          editions: out.editions,
          servers: [...new Set([...out.servers, ...(prev?.servers ?? [])])],
          exists: true,
        }));
        setPublishState({ state: "published" });
      } catch (err) {
        setPublishState({
          state: "failed",
          message: err instanceof PublishError ? err.message : "Couldn't publish to your Observer.",
          reason: err instanceof PublishError ? err.reason : null,
        });
      }
    },
    [pubkey, user?.displayName],
  );

  /** Publish, once the reader has said yes to a public site: asked before the first one. */
  const offerPublish = useCallback(
    (printed: Printed) => {
      if (!pubkey) return;
      if (noticeSeen(pubkey)) void publishPaper(printed);
      else setPublishState({ state: "confirm", paper: printed });
    },
    [pubkey, publishPaper],
  );
  const [printOpen, setPrintOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const models = useModels(key);
  // The model is one provider's: when the key changes, the last provider's choice is
  // not sent to the new one while its list loads.
  const [chosen, setChosen] = useState<{ url: string; id: string } | null>(null);
  const model = key && chosen?.url === key.url ? chosen.id : "";
  useEffect(() => {
    if (!key) return;
    const remembered = readModel(key.url);
    if (models.status === "listed") {
      setChosen({ url: key.url, id: remembered && models.ids.includes(remembered) ? remembered : models.ids[0] });
    } else if (models.status === "unlisted") {
      setChosen({ url: key.url, id: remembered ?? "" });
    } else {
      setChosen(null);
    }
  }, [key?.url, models]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseModel = (id: string) => {
    if (!key) return;
    setChosen({ url: key.url, id });
    writeModel(key.url, id);
  };

  const print = useCallback(async () => {
    if (!key || !pubkey || !model) return;
    setPrintOpen(false);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let pull: PullProgress | null = null;
    setRun({ state: "running", step: { step: "probe" }, pull });
    try {
      const result = await printFrontPage({
        key,
        model,
        observer: pubkey,
        readerName,
        signal: controller.signal,
        onStep: (step) => {
          if (step.step === "pull") pull = step.progress;
          setRun({ state: "running", step, pull });
        },
      });
      if (result.status === "not-ready") {
        setRun(
          result.reason === "relay-unreachable"
            ? {
                state: "error",
                message: "The search relay didn't answer, so nothing was sent to your AI. Try again in a few minutes.",
              }
            : { state: "pending" },
        );
      } else if (result.status === "refused") {
        writeLast(pubkey, null);
        setPage(null);
        setRun({ state: "refused", violations: result.violations, changes: result.changes });
      } else {
        const printed: Printed = {
          html: result.html,
          code: result.corpus.code,
          model,
          printedAt: Date.now(),
          events: Object.values(result.corpus.desks).reduce((n, list) => n + list.length, 0),
          quotes: result.quotes,
          rounds: result.rounds,
          usage: result.usage,
          changes: result.changes,
          unanswered: result.corpus.unanswered?.length ?? 0,
        };
        writeLast(pubkey, printed);
        setPage(printed);
        setSelectedDay(null);
        setRun({ state: "idle" });
        // Only a page the check passed gets here: that is the only one published.
        if (publishOn.current) offerPublish(printed);
        else setPublishState({ state: "idle" });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setRun({ state: "idle" });
        return;
      }
      setRun({
        state: "error",
        message: err instanceof WriterError ? err.message : "Something went wrong while printing. Try again.",
      });
    }
  }, [key, pubkey, model, readerName, offerPublish]);

  const cancel = () => {
    abort.current?.abort();
    setRun({ state: "idle" });
  };

  // What stands between the reader and a paper: both needs, each on its own row.
  const keyStep: KeyStep =
    keys.status === "locked"
      ? { state: "locked" }
      : key
        ? { state: "done", provider: providerName(key.url) }
        : { state: "todo" };
  // `hasMywot` is the assistant the server mints at sign-in, so it says nothing about
  // scores: the scoring status says whether a calculation is running, failed or never ran.
  // The ranking is there once the search relay answers through the assistant.
  const scoring = useScoringStatus().status;
  const wotStep = wotStepOf({ hasAssistant: hasMywot, ranked: isSearchObserver && canUseMywot, scoring });
  const checking = keys.status === "loading" || (!mywot.known && mywot.isLoading);
  const blocker = checking ? "checking" : keyStep.state !== "done" || wotStep.state !== "done" ? "setup" : null;
  const setupShown = blocker === "setup";

  const picker = key && blocker === null && (
    <ModelPicker keyUrl={key.url} models={models} model={model} onChoose={chooseModel} />
  );
  const publishSwitch = <PublishSwitch on={publish} onChange={choosePublish} />;
  const printedHint = todays && (
    <PrintedTodayHint
      printedAt={todays.printedAt}
      onOpen={() => {
        setSelectedDay(todays.day);
        setPrintOpen(false);
      }}
    />
  );
  const observerLinks = pubkey && (site?.exists || publishState.state === "published") ? pubkey : null;
  // Reader-first: once there is a paper, it leads and the controls step back into a
  // header and a dialog. The hero is for the first print and for setup.
  const showHero = !shown || blocker !== null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-page flex-col bg-background">
        {user && <AppHeader user={user} onLogout={() => logout()} />}
        <main className={cn(pageWidth("wide"), "flex-1 py-6 sm:py-8")}>
          {/* The header lines up with the paper's edges once there is one; the hero keeps the
              narrower column the rest of the app reads in. */}
          <div className={cn("space-y-5", showHero && "mx-auto max-w-5xl")}>
            {showHero ? (
              <Hero
                ready={blocker === null}
                busy={run.state === "running"}
                onPrint={print}
                picker={picker}
                publishSwitch={publishSwitch}
                printedHint={printedHint}
                hint={models.status === "unlisted" && !model}
                canPrint={!!model}
              />
            ) : (
              shown && (
                <PaperHeader
                  page={shown}
                  busy={run.state === "running"}
                  observer={observerLinks}
                  onPrintAgain={() => setPrintOpen(true)}
                  onFullScreen={() => setFullScreen(true)}
                />
              )
            )}

            {publishState.state === "confirm" && pubkey && (
              <ObserverNotice
                pubkey={pubkey}
                onPublish={() => {
                  markNoticeSeen(pubkey);
                  void publishPaper(publishState.paper);
                }}
                onNotNow={() => setPublishState({ state: "idle" })}
              />
            )}
            {!showHero && publishState.state !== "idle" && publishState.state !== "confirm" && (
              <PublishStatus state={publishState} onRetry={() => page && offerPublish(page)} />
            )}

            {(setupShown || run.state === "pending") && (
              <SetupChecklist
                keyStep={keyStep}
                // A print the relay turned away says the ranking isn't there yet, whatever
                // the gate above it answered.
                wot={run.state === "pending" ? wotStepOf({ hasAssistant: hasMywot, ranked: false, scoring }) : wotStep}
                hasEditions={days.length > 0}
                onUnlock={keys.reveal}
              />
            )}
            {blocker === "checking" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="front-page-checking">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking…
              </div>
            )}

            {pubkey && <MorningSchedule schedule={scheduleState} />}

            <AnimatePresence mode="wait">
              {run.state === "running" && (
                <Fade key="running">
                  <Progress step={run.step} pull={run.pull} onCancel={cancel} />
                </Fade>
              )}
              {run.state === "error" && (
                <Fade key="error">
                  <Alert variant="destructive" data-testid="front-page-error">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>No paper today</AlertTitle>
                    <AlertDescription>{run.message}</AlertDescription>
                  </Alert>
                </Fade>
              )}
              {run.state === "refused" && (
                <Fade key="refused">
                  <Refused violations={run.violations} changes={run.changes} />
                </Fade>
              )}
            </AnimatePresence>
          </div>

          {/* The days the reader's Observer holds, right above the paper they switch. */}
          {shown && days.length > 1 && <DayTabs days={days} day={day!} onChange={setSelectedDay} />}

          {/* Wider than the controls: a newspaper wants the width a wide window has. */}
          {shown && (
            <Fade key={`paper-${day}-${shown.printedAt}`}>
              <PaperFrame page={shown} failed={shownFailed} />
            </Fade>
          )}
        </main>
        <Footer />

        <Dialog open={printOpen} onOpenChange={setPrintOpen}>
          <DialogContent className="sm:max-w-md" data-testid="front-page-print-dialog">
            <DialogHeader>
              <DialogTitle>Print again</DialogTitle>
            </DialogHeader>
            <PrintControls
              picker={picker}
              publishSwitch={publishSwitch}
              printedHint={printedHint}
              hint={models.status === "unlisted" && !model}
              busy={run.state === "running"}
              canPrint={!!model}
              again
              onPrint={print}
            />
          </DialogContent>
        </Dialog>

        {shown?.html && <FullScreenPaper page={shown} open={fullScreen} onClose={() => setFullScreen(false)} />}
      </div>
    </TooltipProvider>
  );
}

function Fade({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function Hero({
  ready,
  busy,
  onPrint,
  picker,
  publishSwitch,
  printedHint,
  hint,
  canPrint,
}: {
  ready: boolean;
  busy: boolean;
  onPrint: () => void;
  picker: React.ReactNode;
  publishSwitch: React.ReactNode;
  printedHint: React.ReactNode;
  hint: boolean;
  canPrint: boolean;
}) {
  return (
    <Card accent className="relative overflow-hidden p-5 sm:p-6" data-testid="front-page-hero">
      {/* The page's one bespoke surface: two soft Aurora glows behind neutral copy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-accent/20 blur-3xl dark:bg-brand-accent/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-brand-primary/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-accent text-white shadow-lg shadow-brand-primary/30">
            <Newspaper className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Your front page
            </h1>
            <p className="text-sm text-muted-foreground">Today on Nostr, through your web of trust.</p>
          </div>
        </div>
        {ready && (
          <div className="sm:w-64">
            <PrintControls
              picker={picker}
              publishSwitch={publishSwitch}
              printedHint={printedHint}
              hint={hint}
              busy={busy}
              canPrint={canPrint}
              onPrint={onPrint}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Model, the reason Print is off when it is, and Print: in the hero and in the dialog. */
function PrintControls({
  picker,
  publishSwitch,
  printedHint,
  hint,
  busy,
  canPrint,
  again = false,
  onPrint,
}: {
  picker: React.ReactNode;
  publishSwitch: React.ReactNode;
  printedHint: React.ReactNode;
  hint: boolean;
  busy: boolean;
  canPrint: boolean;
  again?: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {picker}
      {hint && (
        <p className="text-xs text-muted-foreground" data-testid="front-page-model-hint">
          Name a model to print, e.g. llama3.3
        </p>
      )}
      {printedHint}
      <Button
        size="lg"
        className="w-full"
        onClick={onPrint}
        disabled={busy || !canPrint}
        data-testid="front-page-print"
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {again ? "Print" : "Print today's paper"}
      </Button>
      {publishSwitch}
    </div>
  );
}

/** Today's paper exists already: say so above Print, with the way to read it. Print stays on. */
function PrintedTodayHint({ printedAt, onOpen }: { printedAt?: number; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="front-page-printed-today">
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="min-w-0 flex-1">
        Already printed today{printedAt !== undefined ? `, ${formatClock(printedAt * 1000)}` : ""}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2"
        onClick={onOpen}
        data-testid="front-page-printed-today-open"
      >
        Open
      </Button>
    </div>
  );
}

/** Publish each clean paper to the reader's public Observer site; on unless turned off. */
function PublishSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 pt-1 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5" /> Publish to my Observer
      </span>
      <Switch checked={on} onCheckedChange={onChange} data-testid="front-page-publish-switch" />
    </label>
  );
}

function PublishStatus({ state, onRetry }: { state: PublishState; onRetry: () => void }) {
  if (state.state === "idle" || state.state === "confirm") return null;
  return (
    // Wraps on a phone: the message takes the rest of the line and the action drops below it,
    // rather than cutting the message off.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="front-page-publish-status">
      {state.state === "publishing" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Publishing to your Observer…</span>
        </>
      )}
      {state.state === "published" && (
        <>
          <Globe className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-muted-foreground">On your Observer</span>
        </>
      )}
      {state.state === "failed" && state.reason === "no-servers" && (
        <>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-muted-foreground">Your Observer needs a file server</span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            data-testid="front-page-publish-add-server"
          >
            <Link href={FILE_SERVERS_SETTINGS}>Add a Blossom server</Link>
          </Button>
        </>
      )}
      {state.state === "failed" && state.reason !== "no-servers" && (
        <>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-muted-foreground">{state.message}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            onClick={onRetry}
            data-testid="front-page-publish-retry"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Before the first publish, not after: the site is public, and this is where that's
 * turned off. Nothing is uploaded until the reader says Publish.
 */
function ObserverNotice({
  pubkey,
  onPublish,
  onNotNow,
}: {
  pubkey: string;
  onPublish: () => void;
  onNotNow: () => void;
}) {
  return (
    <Card
      className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5"
      data-testid="front-page-observer-notice"
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Globe className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-foreground">Publish to your public Observer?</p>
          <p className="text-sm text-muted-foreground">
            Anyone can read{" "}
            <a
              href={observerUrl(pubkey)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              your Observer
            </a>
            . Turn off “Publish to my Observer” in Print to keep papers to yourself.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 sm:self-center">
        <Button size="sm" variant="ghost" onClick={onNotNow} data-testid="front-page-observer-notice-later">
          Not now
        </Button>
        <Button size="sm" onClick={onPublish} data-testid="front-page-observer-notice-ok">
          Publish
        </Button>
      </div>
    </Card>
  );
}

/** Today / Yesterday / a weekday: the editions the reader's Observer holds. */
function DayTabs({ days, day, onChange }: { days: string[]; day: string; onChange: (day: string) => void }) {
  const today = utcDay(Date.now());
  const yesterday = utcDay(Date.now() - 86_400_000);
  const label = (d: string) =>
    d === today
      ? "Today"
      : d === yesterday
        ? "Yesterday"
        : new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${d}T12:00:00Z`));
  return (
    <Tabs value={day} onValueChange={onChange} className="mt-5">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList data-testid="front-page-day-tabs">
          {days.slice(0, 14).map((d) => (
            <TabsTrigger key={d} value={d} data-testid={`front-page-day-${d}`}>
              {label(d)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

const editionDate = (at: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(at));
/** The phone's form: "Wed, Nov 11" fits where the long date gets cut off. */
const editionDateShort = (at: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(at));

function IconAction({
  label,
  onClick,
  disabled,
  testId,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The returning reader's header: the edition's date, one quiet line of facts, and the
 * actions as icons. The rest (edition number, model, tokens, what the check removed) is
 * one tap away in the info popover, not chips in the reader's way.
 */
function PaperHeader({
  page,
  busy,
  observer,
  onPrintAgain,
  onFullScreen,
}: {
  page: Printed;
  busy: boolean;
  /** The reader's pubkey once they have an Observer site to link to. */
  observer: string | null;
  onPrintAgain: () => void;
  onFullScreen: () => void;
}) {
  const removed = noteworthy(page.changes).length;
  const facts = [
    page.events !== undefined ? `${page.events.toLocaleString()} posts` : null,
    page.quotes !== undefined ? `${page.quotes} ${page.quotes === 1 ? "quote" : "quotes"} verified` : null,
    removed > 0 ? `${removed} removed` : null,
    page.unanswered ? `${page.unanswered} ${page.unanswered === 1 ? "desk" : "desks"} didn't answer` : null,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3" data-testid="front-page-header">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <span className="sm:hidden">{editionDateShort(page.printedAt)}</span>
          <span className="hidden sm:inline">{editionDate(page.printedAt)}</span>
        </h1>
        {facts.length > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="front-page-facts">
            {facts.join(" · ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        <IconAction label="Print again" onClick={onPrintAgain} disabled={busy} testId="front-page-print-again">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </IconAction>
        <IconAction label="Download" onClick={() => download(page)} disabled={!page.html} testId="front-page-download">
          <Download className="h-4 w-4" />
        </IconAction>
        <IconAction
          label="Read full screen"
          onClick={onFullScreen}
          disabled={!page.html}
          testId="front-page-fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </IconAction>
        <EditionInfo page={page} observer={observer} />
      </div>
    </div>
  );
}

function EditionInfo({ page, observer }: { page: Printed; observer: string | null }) {
  const tokens = page.usage ? (page.usage.promptTokens ?? 0) + (page.usage.completionTokens ?? 0) : null;
  const rows: [string, string][] = page.code ? [["Edition", `No. ${page.code}`]] : [];
  if (page.model) rows.push(["Model", page.model]);
  if (tokens) rows.push(["Tokens", tokens.toLocaleString()]);
  if (page.rounds === 2) rows.push(["Check", "Fixed once"]);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="About this edition"
              data-testid="front-page-info"
            >
              <Info className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>About this edition</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-3" data-testid="front-page-info-panel">
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate text-right font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <Changes changes={page.changes} />
        {observer && <ObserverLinks pubkey={observer} />}
      </PopoverContent>
    </Popover>
  );
}

/** Open, copy or share the reader's Observer site. */
function ObserverLinks({ pubkey }: { pubkey: string }) {
  const [copied, setCopied] = useState(false);
  const url = observerUrl(pubkey);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="space-y-2 border-t border-border pt-3" data-testid="front-page-observer-links">
      <Button asChild size="sm" variant="secondary" className="w-full justify-start">
        <a href={url} target="_blank" rel="noopener noreferrer" data-testid="front-page-observer-open">
          <ExternalLink className="mr-2 h-4 w-4" /> Open my Observer
        </a>
      </Button>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 justify-start"
          onClick={async () => {
            if (await copyToClipboard(observerNaddr(pubkey))) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
          data-testid="front-page-observer-copy"
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy naddr"}
        </Button>
        {canShare && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 justify-start"
            onClick={() => void navigator.share({ title: "My Observer", url }).catch(() => undefined)}
            data-testid="front-page-observer-share"
          >
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        )}
      </div>
    </div>
  );
}

function ModelPicker({
  keyUrl,
  models,
  model,
  onChoose,
}: {
  keyUrl: string;
  models: Models;
  model: string;
  onChoose: (id: string) => void;
}) {
  if (models.status === "loading") {
    return (
      <div className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {providerName(keyUrl)}
      </div>
    );
  }
  if (models.status === "unlisted") {
    return (
      <Input
        value={model}
        onChange={(e) => onChoose(e.target.value.trim())}
        placeholder={`Model id on ${providerName(keyUrl)}`}
        aria-label="Model"
        data-testid="front-page-model-input"
      />
    );
  }
  return (
    <Select value={model} onValueChange={onChoose}>
      <SelectTrigger aria-label="Model" data-testid="front-page-model">
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {models.ids.map((id) => (
          <SelectItem key={id} value={id}>
            {id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type KeyStep = { state: "done"; provider: string } | { state: "todo" } | { state: "locked" };

/**
 * What a first paper needs, both at once: the reader's AI key and their web of trust.
 * A done row stays a link, to change it; a to-do row carries the one action that
 * clears it. The web of trust says what it is waiting for (calculating, publishing, search
 * catching up), or what to do when nothing is coming: a calculation that never ran or failed.
 */
function SetupChecklist({
  keyStep,
  wot,
  hasEditions,
  onUnlock,
}: {
  keyStep: KeyStep;
  wot: WotStep;
  /** The reader has papers already and removed a step: it isn't their first. */
  hasEditions: boolean;
  onUnlock: () => void;
}) {
  const title = hasEditions ? "To print your paper" : "Before your first paper";
  return (
    <Card className="p-4 sm:p-5" data-testid="front-page-setup">
      <SectionHeader variant="title" kicker={title} />
      <ul className="mt-3 divide-y divide-border" aria-label={title}>
        <SetupRow
          testId="front-page-setup-key"
          label="AI key"
          state={keyStep.state === "done" ? "done" : "todo"}
          dataState={keyStep.state}
          action={
            keyStep.state === "done" ? (
              <ChangeLink
                href={AI_SETTINGS}
                label={`AI key: using ${keyStep.provider}. Change`}
                testId="front-page-setup-key-change"
              >
                Using {keyStep.provider}
              </ChangeLink>
            ) : keyStep.state === "locked" ? (
              <Button size="sm" onClick={onUnlock} aria-label="Unlock your AI key" data-testid="front-page-unlock">
                <Lock /> Unlock
              </Button>
            ) : (
              <Button asChild size="sm" data-testid="front-page-connect">
                <Link href={AI_SETTINGS} aria-label="Connect an AI key">
                  Connect <ChevronRight />
                </Link>
              </Button>
            )
          }
        />
        <SetupRow
          testId="front-page-setup-wot"
          label="Web of trust"
          state={wot.state}
          dataState={wot.state}
          reason={wot.state === "pending" ? wot.phase : wot.state === "todo" ? wot.why : undefined}
          note={wotNote(wot)}
          action={<WotAction wot={wot} />}
        />
      </ul>
    </Card>
  );
}

const WOT_PHASE_WORD = { calculating: "Calculating…", publishing: "Publishing…", indexing: "Almost ready" } as const;

/** What the reader waits for, or why there is something to do; nothing while it is done or to set up. */
function wotNote(wot: WotStep): string | undefined {
  if (wot.state === "pending") {
    return wot.phase === "indexing"
      ? "Your rankings are ready. Search picks them up in a few minutes."
      : "Your rankings are on their way. This takes a few minutes.";
  }
  if (wot.state === "todo" && wot.why === "uncalculated") return "Your rankings haven't been calculated yet.";
  if (wot.state === "todo" && wot.why === "failed") return "The last calculation didn't finish.";
  return undefined;
}

/**
 * The web of trust row's right side. A calculation is started, or retried, on the dashboard,
 * which knows the follows it needs and asks before it publishes anything.
 */
function WotAction({ wot }: { wot: WotStep }) {
  if (wot.state === "done") {
    return (
      <ChangeLink href="/setup" label="Web of trust: ready. Change" testId="front-page-setup-wot-change">
        Ready
      </ChangeLink>
    );
  }
  if (wot.state === "pending") {
    return (
      <span className="text-sm text-muted-foreground" data-testid="front-page-setup-wot-status">
        {WOT_PHASE_WORD[wot.phase]}
      </span>
    );
  }
  const [href, text, label, testId] =
    wot.why === "setup"
      ? ["/setup", "Set up", "Set up your web of trust", "front-page-setup-wot-action"]
      : wot.why === "failed"
        ? ["/dashboard", "Retry", "Retry your web of trust calculation", "front-page-setup-wot-retry"]
        : ["/dashboard", "Calculate", "Calculate your web of trust", "front-page-setup-wot-calculate"];
  return (
    <Button asChild size="sm" data-testid={testId}>
      <Link href={href} aria-label={label}>
        {text} <ChevronRight />
      </Link>
    </Button>
  );
}

const STEP_STATE_WORD = { done: "Done", todo: "To do", pending: "In progress" } as const;

function SetupRow({
  testId,
  label,
  state,
  dataState,
  reason,
  note,
  action,
}: {
  testId: string;
  label: string;
  state: "done" | "todo" | "pending";
  dataState: string;
  /** Why it is to do or pending, for tests and the curious; not shown. */
  reason?: string;
  note?: string;
  action: React.ReactNode;
}) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0" data-testid={testId} data-state={dataState} data-reason={reason}>
      <div className="flex min-h-9 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full",
            state === "done" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            state === "pending" && "bg-brand-primary/15 text-brand-primary",
            state === "todo" && "border-2 border-slate-300 dark:border-slate-600",
          )}
        >
          {state === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : state === "pending" ? (
            <Hourglass className="h-3.5 w-3.5" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {label}
          <span className="sr-only">: {STEP_STATE_WORD[state]}</span>
        </span>
        <span className="flex min-w-0 shrink-0 justify-end">{action}</span>
      </div>
      {note && (
        <p className="mt-1 pl-9 text-xs text-muted-foreground" role="status">
          {note}
        </p>
      )}
    </li>
  );
}

/** A done row's way back in: its status, quiet, as the link that changes it. */
function ChangeLink({
  href,
  label,
  testId,
  children,
}: {
  href: string;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="-mr-2 max-w-[11rem] gap-1 px-2 font-normal text-muted-foreground sm:max-w-xs"
    >
      <Link href={href} aria-label={label} data-testid={testId}>
        <span className="truncate">{children}</span>
        <ChevronRight />
      </Link>
    </Button>
  );
}

const STEPS = ["probe", "pull", "write", "check"] as const;

function Progress({ step, pull, onCancel }: { step: PrintStep; pull: PullProgress | null; onCancel: () => void }) {
  const at = STEPS.indexOf(step.step);
  const repair = (step.step === "write" || step.step === "check") && step.round === 2;
  const label: Record<(typeof STEPS)[number], string> = {
    probe: "Checking your ranking",
    pull: pull ? `Reading the desks · ${pull.events.toLocaleString()} posts` : `Reading ${DESKS.length} desks`,
    write:
      step.step === "write" && step.chars > 0
        ? `${repair ? "Fixing the page" : "Writing"} · ${(step.chars / 1000).toFixed(1)}k characters`
        : repair
          ? "Fixing the page"
          : "Writing",
    check: "Checking quotes, pictures and links",
  };
  return (
    <Card className="p-4 sm:p-5" data-testid="front-page-progress">
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "todo";
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full",
                  state === "done" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  state === "now" && "bg-brand-primary/15 text-brand-primary",
                  state === "todo" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : state === "now" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn(state === "todo" ? "text-muted-foreground" : "text-foreground")}>{label[s]}</span>
              {s === "pull" && state !== "todo" && pull && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {pull.desksDone}/{pull.desksTotal}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="front-page-cancel">
          <X className="mr-1.5 h-4 w-4" /> Cancel
        </Button>
      </div>
    </Card>
  );
}

function Changes({ changes }: { changes: ResolveChange[] }) {
  const worth = noteworthy(changes);
  if (worth.length === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="front-page-changes">
      <summary className="cursor-pointer select-none text-muted-foreground">
        {worth.length} {worth.length === 1 ? "thing" : "things"} removed from the page
      </summary>
      <ul className="mt-2 space-y-1">
        {worth.map((c, i) => (
          <li key={i} className="break-all text-xs text-muted-foreground">
            <span className="font-medium uppercase text-foreground">{c.kind}</span> · {c.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Refused({ violations, changes }: { violations: Violation[]; changes: ResolveChange[] }) {
  return (
    <div className="space-y-3" data-testid="front-page-refused">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>The page didn't pass the check</AlertTitle>
        <AlertDescription>
          It quoted, linked or showed something the corpus doesn't back, so it isn't shown.
        </AlertDescription>
      </Alert>
      <Card className="divide-y divide-border p-0">
        {violations.slice(0, 20).map((v, i) => (
          <div key={i} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-3">
            <Chip tone="danger" size="sm">
              {v.kind}
            </Chip>
            <div className="min-w-0">
              <p className="text-foreground">{v.detail}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{v.excerpt}</p>
            </div>
          </div>
        ))}
      </Card>
      <Changes changes={changes} />
    </div>
  );
}

function download(page: Printed) {
  const date = new Date(page.printedAt).toISOString().slice(0, 10);
  // Outside the app's sandbox, the CSP is the page's script barrier (idempotent).
  const url = URL.createObjectURL(new Blob([withPaperCsp(page.html)], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `front-page-${date}-${page.code}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/**
 * The paper inline. Until the frame has loaded it takes a slim placeholder, not the
 * full height: a tall empty sheet reads as broken.
 */
function PaperFrame({ page, failed = false }: { page: Printed; failed?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // An edition read back from the site: its bytes are still on their way, or no server had them.
  if (!page.html) {
    return (
      <div className="mt-5 grid h-40 place-items-center rounded-2xl border border-border bg-[#faf8f3] p-3 text-sm text-slate-600 shadow-sm">
        {failed ? (
          <span data-testid="front-page-frame-missing">None of your file servers had this edition.</span>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" data-testid="front-page-frame-loading" />
        )}
      </div>
    );
  }
  return (
    // The model writes the layout, and some pages run edge to edge: a margin of newsprint
    // (house.css --paper) keeps the rounded corners from clipping a folio's first letter.
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-[#faf8f3] p-3 shadow-sm sm:p-5">
      {!loaded && (
        <div className="grid h-24 place-items-center" data-testid="front-page-frame-loading">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}
      {/* The paper is always light, whatever the app's theme: newsprint. No scripts can run in it
          (no allow-scripts), and its links open in a new tab, outside the sandbox. */}
      <iframe
        title="Your front page"
        srcDoc={page.html}
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={cn("block w-full border-0 bg-[#faf8f3]", loaded ? "h-[85vh] min-h-[600px]" : "h-0")}
        data-testid="front-page-frame"
      />
    </div>
  );
}

/** How long after a Tab press a move into the paper's frame still counts as keyboard. */
const TAB_INTO_FRAME_MS = 400;

/**
 * The paper filling the window, for reading: same sandbox, Esc or ✕ to leave. A Radix
 * dialog, so focus is trapped inside it and returns to the button that opened it.
 *
 * Esc after clicking into the paper: the frame is sandboxed without allow-scripts or
 * allow-same-origin, so a key pressed while it has focus never reaches this document and
 * nothing here can listen inside it. So when a click or tap moves focus into the frame,
 * focus is handed straight back to the dialog: the click itself still lands in the paper
 * (links open, text can be selected), wheel and touch still scroll it, and Esc closes.
 * The cost: with the mouse, the paper can't be scrolled with the keyboard (arrows, Space,
 * PageDown), because the parent can't scroll an opaque-origin frame. A keyboard user who
 * Tabs into the paper keeps focus there instead, to reach its links and scroll it, and
 * Shift+Tab or ✕ leaves. Giving the frame allow-same-origin would fix both, but would
 * loosen the sandbox the paper boundary was reviewed under.
 */
function FullScreenPaper({ page, open, onClose }: { page: Printed; open: boolean; onClose: () => void }) {
  // What had focus when it opened (the opener has no Dialog.Trigger to return to).
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let lastTab = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") lastTab = Date.now();
    };
    // The window blurs when focus moves into the frame (it is another document).
    const onBlur = () => {
      const byKeyboard = Date.now() - lastTab < TAB_INTO_FRAME_MS;
      window.setTimeout(() => {
        if (!byKeyboard && frame.current && document.activeElement === frame.current) {
          content.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            if (opener.current?.isConnected) {
              e.preventDefault();
              opener.current.focus();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[#faf8f3] focus:outline-none"
          data-testid="front-page-fullscreen-view"
        >
          <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-slate-800">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-medium">
              {editionDate(page.printedAt)}
            </DialogPrimitive.Title>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-700 hover:bg-black/5 hover:text-slate-900"
              onClick={() => download(page)}
              aria-label="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-700 hover:bg-black/5 hover:text-slate-900"
                aria-label="Close"
                data-testid="front-page-fullscreen-close"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {/* The same margin of newsprint as inline: a page run edge to edge loses its folio's
              first letter to the window's edge otherwise. */}
          <div className="flex min-h-0 flex-1 p-2 sm:p-4">
            <iframe
              ref={frame}
              title="Your front page, full screen"
              srcDoc={page.html}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              className="block h-full w-full flex-1 border-0 bg-[#faf8f3]"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
