import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Download,
  Hourglass,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  Newspaper,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useCanSearchMywot } from "@/hooks/useCanSearchMywot";
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
import { WriterError, fetchModels, printFrontPage, type PrintStep, type PullProgress } from "@/services/frontPage";
import type { Usage } from "@/lib/frontPage/writer";

/**
 * Today's front page: the Nostr Observer's daily paper, written from the reader's own
 * web of trust by the reader's own AI key, and shown here once. Nothing is stored or
 * published; the last page survives a reload of this tab and nothing else.
 */

const AI_SETTINGS = "/settings?tab=assistants&view=ai";

interface Printed {
  html: string;
  code: string;
  /** Which model wrote it; absent on a paper printed before this was kept. */
  model?: string;
  printedAt: number;
  events: number;
  quotes: number;
  rounds: number;
  usage: Usage | null;
  changes: ResolveChange[];
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

const lastKey = (pubkey: string) => `frontPage:last:${pubkey}`;

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

export default function FrontPagePage() {
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey ?? null;
  const readerName = user?.displayName || (pubkey ? shortNpub(pubkey) : "");
  const keys = useAgentKeys();
  const key = keys.status === "ready" ? (keys.keys[0] ?? null) : null;
  const mywot = useHasMywot();
  const { canUseMywot, hasMywot, isSearchObserver } = useCanSearchMywot();

  const [page, setPage] = useState<Printed | null>(() => (pubkey ? readLast(pubkey) : null));
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [printOpen, setPrintOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const models = useModels(key);
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!key) return;
    const remembered = readModel(key.url);
    if (models.status === "listed") {
      setModel(remembered && models.ids.includes(remembered) ? remembered : models.ids[0]);
    } else if (models.status === "unlisted") {
      setModel(remembered ?? "");
    }
  }, [key?.url, models]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseModel = (id: string) => {
    setModel(id);
    if (key) writeModel(key.url, id);
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
        setRun({ state: "pending" });
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
        };
        writeLast(pubkey, printed);
        setPage(printed);
        setRun({ state: "idle" });
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
  }, [key, pubkey, model, readerName]);

  const cancel = () => {
    abort.current?.abort();
    setRun({ state: "idle" });
  };

  // What stands between the reader and a paper, first unmet need only.
  const blocker = useMemo(() => {
    if (keys.status === "loading" || (!mywot.known && mywot.isLoading)) return "checking" as const;
    if (keys.status === "locked") return "locked" as const;
    if (keys.status === "none" || keys.status === "unreadable" || !key) return "no-key" as const;
    if (!hasMywot) return "no-wot" as const;
    if (!isSearchObserver || !canUseMywot) return "pending" as const;
    return null;
  }, [keys.status, key, mywot.known, mywot.isLoading, hasMywot, isSearchObserver, canUseMywot]);

  const picker = key && blocker === null && (
    <ModelPicker keyUrl={key.url} models={models} model={model} onChoose={chooseModel} />
  );
  // Reader-first: once there is a paper, it leads and the controls step back into a
  // header and a dialog. The hero is for the first print and for setup.
  const showHero = !page || blocker !== null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-page flex-col bg-background">
        {user && <AppHeader user={user} onLogout={() => logout()} />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {/* The header lines up with the paper's edges once there is one; the hero keeps the
              narrower column the rest of the app reads in. */}
          <div className={cn("space-y-5", showHero && "mx-auto max-w-5xl")}>
            {showHero ? (
              <Hero
                ready={blocker === null}
                busy={run.state === "running"}
                onPrint={print}
                picker={picker}
                hint={models.status === "unlisted" && !model}
                canPrint={!!model}
              />
            ) : (
              page && (
                <PaperHeader
                  page={page}
                  busy={run.state === "running"}
                  onPrintAgain={() => setPrintOpen(true)}
                  onFullScreen={() => setFullScreen(true)}
                />
              )
            )}

            {blocker && blocker !== "checking" && <Blocker kind={blocker} onUnlock={keys.reveal} />}
            {blocker === "checking" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="front-page-checking">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking…
              </div>
            )}

            <AnimatePresence mode="wait">
              {run.state === "running" && (
                <Fade key="running">
                  <Progress step={run.step} pull={run.pull} onCancel={cancel} />
                </Fade>
              )}
              {run.state === "pending" && (
                <Fade key="pending">
                  <Blocker kind="pending" onUnlock={keys.reveal} />
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

          {/* Wider than the controls: a newspaper wants the width a wide window has. */}
          {page && (
            <Fade key={`paper-${page.printedAt}`}>
              <PaperFrame page={page} />
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
              hint={models.status === "unlisted" && !model}
              busy={run.state === "running"}
              canPrint={!!model}
              again
              onPrint={print}
            />
          </DialogContent>
        </Dialog>

        {fullScreen && page && <FullScreenPaper page={page} onClose={() => setFullScreen(false)} />}
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
  hint,
  canPrint,
}: {
  ready: boolean;
  busy: boolean;
  onPrint: () => void;
  picker: React.ReactNode;
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
            <PrintControls picker={picker} hint={hint} busy={busy} canPrint={canPrint} onPrint={onPrint} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Model, the reason Print is off when it is, and Print: in the hero and in the dialog. */
function PrintControls({
  picker,
  hint,
  busy,
  canPrint,
  again = false,
  onPrint,
}: {
  picker: React.ReactNode;
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
    </div>
  );
}

const editionDate = (at: number) =>
  new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(at));

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
  onPrintAgain,
  onFullScreen,
}: {
  page: Printed;
  busy: boolean;
  onPrintAgain: () => void;
  onFullScreen: () => void;
}) {
  const removed = noteworthy(page.changes).length;
  return (
    <div className="flex items-center gap-3" data-testid="front-page-header">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {editionDate(page.printedAt)}
        </h1>
        <p className="truncate text-sm text-muted-foreground" data-testid="front-page-facts">
          {page.events.toLocaleString()} posts · {page.quotes} {page.quotes === 1 ? "quote" : "quotes"} verified
          {removed > 0 && ` · ${removed} removed`}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <IconAction label="Print again" onClick={onPrintAgain} disabled={busy} testId="front-page-print-again">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </IconAction>
        <IconAction label="Download" onClick={() => download(page)} testId="front-page-download">
          <Download className="h-4 w-4" />
        </IconAction>
        <IconAction label="Read full screen" onClick={onFullScreen} testId="front-page-fullscreen">
          <Maximize2 className="h-4 w-4" />
        </IconAction>
        <EditionInfo page={page} />
      </div>
    </div>
  );
}

function EditionInfo({ page }: { page: Printed }) {
  const tokens = page.usage ? (page.usage.promptTokens ?? 0) + (page.usage.completionTokens ?? 0) : null;
  const rows: [string, string][] = [["Edition", `No. ${page.code}`]];
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
      </PopoverContent>
    </Popover>
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

function Blocker({ kind, onUnlock }: { kind: "locked" | "no-key" | "no-wot" | "pending"; onUnlock: () => void }) {
  const content = {
    "no-key": {
      icon: KeyRound,
      title: "Connect an AI model",
      body: "Your paper is written with your own AI key.",
      action: (
        <Button asChild size="sm" data-testid="front-page-connect">
          <Link href={AI_SETTINGS}>Connect</Link>
        </Button>
      ),
    },
    locked: {
      icon: Lock,
      title: "Unlock your AI key",
      body: "It's encrypted to your account.",
      action: (
        <Button size="sm" onClick={onUnlock} data-testid="front-page-unlock">
          Unlock
        </Button>
      ),
    },
    "no-wot": {
      icon: ShieldCheck,
      title: "Calculate your web of trust",
      body: "Your paper is ranked by it.",
      action: (
        <Button asChild size="sm">
          <Link href="/setup">Finish setup</Link>
        </Button>
      ),
    },
    pending: {
      icon: Hourglass,
      title: "Your rankings are on their way",
      body: "The search relay is still preparing them. Try again in a few minutes.",
      action: null,
    },
  }[kind];
  const Icon = content.icon;
  return (
    <Card className="flex items-center gap-4 p-4 sm:p-5" data-testid={`front-page-blocked-${kind}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{content.title}</p>
        <p className="text-sm text-muted-foreground">{content.body}</p>
      </div>
      {content.action}
    </Card>
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
  const url = URL.createObjectURL(new Blob([page.html], { type: "text/html" }));
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
function PaperFrame({ page }: { page: Printed }) {
  const [loaded, setLoaded] = useState(false);
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

/** The paper filling the window, for reading: same sandbox, Esc or ✕ to leave. */
function FullScreenPaper({ page, onClose }: { page: Printed; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your front page"
      className="fixed inset-0 z-50 flex flex-col bg-[#faf8f3]"
      data-testid="front-page-fullscreen-view"
    >
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-slate-800">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{editionDate(page.printedAt)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-700 hover:bg-black/5 hover:text-slate-900"
          onClick={() => download(page)}
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-700 hover:bg-black/5 hover:text-slate-900"
          onClick={onClose}
          aria-label="Close"
          data-testid="front-page-fullscreen-close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      {/* The same margin of newsprint as inline: a page run edge to edge loses its folio's
          first letter to the window's edge otherwise. */}
      <div className="flex min-h-0 flex-1 p-2 sm:p-4">
        <iframe
          title="Your front page, full screen"
          srcDoc={page.html}
          sandbox={SANDBOX}
          referrerPolicy="no-referrer"
          className="block h-full w-full flex-1 border-0 bg-[#faf8f3]"
        />
      </div>
    </div>
  );
}
