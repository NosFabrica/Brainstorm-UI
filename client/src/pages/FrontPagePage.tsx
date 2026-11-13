import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ChevronRight,
  ExternalLink,
  Globe,
  History,
  Hourglass,
  Info,
  Loader2,
  Lock,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { copyToClipboard } from "@/lib/clipboard";
import { observerNaddr, observerUrl, type EditionEntry } from "@/lib/frontPage/observerSite";
import { observerToday, type Edition } from "@/lib/frontPage/today";
import { fetchBlob, leadHeadline } from "@/services/observerSite";
import { useObserverSite } from "@/hooks/useObserverSite";
import { useRunnerSite } from "@/hooks/useRunnerSite";
import { rememberedObserverRunner, rememberObserverRunner } from "@/lib/eventCache";
import {
  cancelPrint,
  confirmPublish,
  declinePublish,
  offerPublish,
  readLast,
  readPublish,
  settlePending,
  startPrint,
  usePrintJob,
  writePublish,
  type Printed,
  type PublishState,
  type Run,
} from "@/services/printJob";
import {
  PLANNING,
  editionDayLabel,
  editionFullDate,
  elapsed,
  statusLine,
  writeDetail,
  writeLine,
  type PrintProgress,
} from "@/lib/frontPage/printProgress";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useCanSearchMywot } from "@/hooks/useCanSearchMywot";
import { useScoringStatus } from "@/hooks/useScoringStatus";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useQueryClient } from "@tanstack/react-query";
import { wotStepOf, type WotStep } from "@/lib/frontPage/setupSteps";
import { pageWidth } from "@/lib/pageWidth";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useAgentKeys } from "@/hooks/useAgentKeys";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { logout } from "@/accounts/login-flow";
import { apiRoot, providerName, type AgentKey } from "@/lib/agentKeys";
import { keyName, sameKey } from "@/lib/assistantKeys";
import { rankModels } from "@/lib/frontPage/writer";
import { noteworthy, type ResolveChange } from "@/lib/frontPage/resolve";
import type { Violation } from "@/lib/frontPage/validate";
import { DESKS, shortNpub } from "@/lib/frontPage/desks";
import { cn } from "@/lib/utils";
import { dropUnownedModels, readModel, writeModel } from "@/lib/frontPage/modelMemory";
import { withPaperCsp } from "@/lib/frontPage/validate";
import {
  observerKeyChoice,
  observerModel,
  pickObserverKey,
  printedTodayZone,
  withObserverKey,
  withObserverModel,
  withRememberedModel,
} from "@/lib/frontPage/observerSchedule";
import { browserTimeZone, formatClock, readTask, type TaskTags } from "@/lib/scheduledTasks";
import { updateObserverSchedule } from "@/services/observerSchedule";
import { useObserverSchedule } from "@/hooks/useObserverSchedule";
import { MorningSchedule, type ScheduleSites } from "@/components/frontPage/MorningSchedule";
import { useNow } from "@/hooks/useNow";
import { fetchModelList } from "@/services/frontPage";
import { markRoutstr } from "@/services/routstr";
import { estimateSats, formatSats, textModels, type RoutstrModel } from "@/lib/routstr";
import { RoutstrPrintNote, editionEstimate } from "@/components/settings/RoutstrPanel";

/**
 * Today's front page: the Nostr Observer's daily paper, written from the reader's own
 * web of trust by the reader's own AI key. The page is about today: today's paper filling
 * the page when there is one (printed here, in Amethyst, or anywhere else), else the print
 * view. With "Publish to my Observer" on, each clean paper also goes to the reader's public
 * Observer site (quartz `plans/2026-11-11-observer-site.md`), and Past editions reads the
 * earlier ones back from it. The just-printed paper also survives a reload of this tab.
 */

const AI_SETTINGS = "/settings?tab=assistants&view=ai";

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
  /** `servers` is final; until then none is "not known yet" (`SiteView.settled`). */
  settled?: boolean;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

/** Where Brainstorm keeps the reader's Blossom servers (Settings › Messages › File servers). */
const FILE_SERVERS_SETTINGS = "/settings?tab=messages&focus=file-servers";

// --- the model list -------------------------------------------------------------

type Models =
  | { status: "loading" }
  /** `routstr`: a Routstr node's entries, with their prices in sats; null for any other endpoint. */
  | { status: "listed"; ids: string[]; routstr: Map<string, RoutstrModel> | null }
  | { status: "unlisted" };

function useModels(key: AgentKey | null): Models {
  const [models, setModels] = useState<Models>({ status: "loading" });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setModels({ status: "loading" });
    fetchModelList(key, controller.signal)
      .then(({ ids, routstr }) => {
        // A key changed mid-flight: this list is the old key's.
        if (controller.signal.aborted) return;
        if (routstr) markRoutstr(key.url);
        // A Routstr node lists embeddings beside writers: only the ones that write text.
        const writes = routstr ? new Set(textModels(routstr).map((m) => m.id)) : null;
        const ranked = rankModels(writes ? ids.filter((id) => writes.has(id)) : ids);
        const prices = routstr ? new Map(routstr.map((m) => [m.id, m])) : null;
        setModels(ranked.length ? { status: "listed", ids: ranked, routstr: prices } : { status: "unlisted" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setModels({ status: "unlisted" });
      });
    return () => controller.abort();
  }, [key?.url, key?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return models;
}

// --- the page --------------------------------------------------------------------

const IDLE_RUN: Run = { state: "idle" };
const FRONT_PAGE = "/front-page";

/** `?day=YYYY-MM-DD`: a past edition to read; anything else is no day. */
function dayParam(search: string): string | null {
  const day = new URLSearchParams(search).get("day");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
const IDLE_PUBLISH: PublishState = { state: "idle" };

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
  const mywot = useHasMywot();
  const { canUseMywot, hasMywot, isSearchObserver, observerCheckedAt } = useCanSearchMywot();
  const queryClient = useQueryClient();

  // The print is the app's (services/printJob), not this page's: it keeps running while the
  // reader is elsewhere in Brainstorm, and this page shows it, or how it ended, when open.
  const job = usePrintJob(pubkey);
  const [stored] = useState<Printed | null>(() => (pubkey ? readLast(pubkey) : null));
  const page = job ? job.paper : stored;
  const run: Run = job?.run ?? IDLE_RUN;
  const publishState: PublishState = job?.publish ?? IDLE_PUBLISH;
  const [publish, setPublish] = useState(() => (pubkey ? readPublish(pubkey) : true));
  // The reader's Observer site: today's edition when another device printed it, and the
  // past editions. From the store, and so from this device's copy on the first render;
  // asked again when the page is shown after a while away, so a paper a device printed
  // meanwhile is known before today is worked out (hooks/useObserverSite).
  const held = useObserverSite(pubkey);
  // A publish's answer is the site as it now stands: shown without waiting for the store.
  const published = job?.published;
  const site = useMemo<SiteState | null>(
    () =>
      published
        ? {
            editions: published.editions,
            servers: [...new Set([...published.servers, ...(held?.servers ?? [])])],
            exists: true,
            settled: true,
          }
        : held,
    [published, held],
  );
  // Editions fetched from the site, by sha256 (a day reprinted is other bytes): html, or
  // null when no server had them.
  const [fetched, setFetched] = useState<Record<string, string | null>>({});

  // The page is about today: today's paper (this tab's print, or one on the site printed
  // today) or, with none, the print view. An older paper is only ever a past edition. Today
  // is the spec's rule for a scheduled print, the one the "already printed today" hint uses:
  // a calendar day in the schedule's zone when there is one this account can read, else in
  // the viewer's. The schedule's read is shared with the card (one ask, one decrypt). `now`
  // ticks each minute (paused while hidden), so the page turns over at midnight.
  const now = useNow(60_000);
  const scheduleState = useObserverSchedule();
  const syncedSchedule = scheduleState.status === "ready" ? scheduleState.schedule : null;
  const todayZone = printedTodayZone(syncedSchedule, browserTimeZone());

  // The runner the reader's own signed schedule names (its one public `p`; NIP-FB, Runner):
  // their Brainstorm Assistant prints their paper as its own Observer site, which is read
  // beside theirs. A site from any other key that tags them is never asked for.
  const named =
    scheduleState.runners.length === 1 && HEX_KEY.test(scheduleState.runners[0]) && scheduleState.runners[0] !== pubkey
      ? scheduleState.runners[0]
      : null;
  // Until the schedule is read, the runner it named last time on this device: its site is
  // then in the store from boot (lib/eventCache), so their paper is on the first render.
  const scheduleLoading = scheduleState.status === "loading";
  const runner = named ?? (scheduleLoading && pubkey ? rememberedObserverRunner(pubkey) : null);
  // Remembered once the schedule says, a runner or none; a read no relay answered says nothing.
  useEffect(() => {
    if (!pubkey) return;
    if (named) rememberObserverRunner(pubkey, named);
    else if (!scheduleLoading && scheduleState.checkedAt !== null) rememberObserverRunner(pubkey, null);
  }, [pubkey, named, scheduleLoading, scheduleState.checkedAt]);
  // From the store, so a late site shows when it lands, and a silence is said (`failed`).
  const runnerSite = useRunnerSite(runner, pubkey);
  const runnerShown = runnerSite?.status === "ready" ? runnerSite.view : null;
  // Either site's files are fetched by hash from wherever they are: the runner uploads to
  // the reader's own servers, and every download is checked against its hash.
  const sites: SiteState | null = useMemo(() => {
    if (!runner) return site;
    return {
      editions: site?.editions ?? [],
      servers: [...new Set([...(site?.servers ?? []), ...(runnerShown?.servers ?? [])])],
      exists: !!site?.exists,
      settled: !!site?.settled && !!runnerShown?.settled,
    };
  }, [site, runner, runnerShown]);
  const scheduleSites: ScheduleSites = useMemo(
    () => ({
      // Null while the reader's own site is unknown: no warning rests on a silence.
      reader: site ? site.editions : null,
      runner: runner ? (runnerShown ? runnerShown.editions : null) : [],
      runnerFailed: runnerSite?.status === "failed",
    }),
    [site, runner, runnerShown, runnerSite?.status],
  );
  const { today, past } = useMemo(
    () =>
      observerToday({
        site: site?.editions ?? [],
        runnerSite: runnerShown?.editions ?? [],
        session: page,
        now,
        zone: todayZone,
      }),
    [site, runnerShown, page, now, todayZone],
  );
  const when: When = useMemo(() => ({ now, zone: todayZone }), [now, todayZone]);

  // The key to print with: the schedule's `key` (its endpoint and last four characters,
  // one choice for every app), else the first. One picked here shows at once, until the
  // schedule it was written to lands (or another device's edit does).
  const allKeys = useMemo(() => (keys.status === "ready" ? keys.keys : []), [keys]);
  const scheduleEventId = scheduleState.status === "ready" ? scheduleState.eventId : null;
  const [pickedKey, setPickedKey] = useState<{ eventId: string | null; key: AgentKey } | null>(null);
  const picked =
    pickedKey && pickedKey.eventId === scheduleEventId && allKeys.some((k) => sameKey(k, pickedKey.key))
      ? pickedKey.key
      : null;
  const key = keys.status === "ready" ? (picked ?? pickObserverKey(syncedSchedule, allKeys)) : null;
  // Whether the schedule's settings are this key's: no `key` (the default applies) or one
  // naming this key's endpoint. Another endpoint's model is not this one's.
  const keyChoice = observerKeyChoice(syncedSchedule);
  const keyFits = !!key && !picked && (!keyChoice || apiRoot(keyChoice.url) === apiRoot(key.url));
  // The plan's migration: Brainstorm's first edit writes the model this account remembered
  // in this browser, and never one remembered before the key named its account.
  useEffect(dropUnownedModels, []);
  const migrate = useMemo(
    () => (doc: TaskTags) => (pubkey ? withRememberedModel(doc, allKeys, (url) => readModel(pubkey, url)) : doc),
    [allKeys, pubkey],
  );
  // A past edition, read in the paper's place: its day is in the URL, so the browser's
  // Back returns to today and the link can be passed around the app.
  const [, navigate] = useLocation();
  const askedDay = dayParam(useSearch());
  const asked = askedDay && askedDay !== today?.day ? askedDay : null;
  const opened = asked ? (past.find((e) => e.day === asked) ?? null) : null;
  // Whether Back to today can step back in history (the reader came from today here) or
  // must replace a link that was opened directly.
  const pushedPast = useRef(false);
  const openPast = (edition: Edition<Printed>) => {
    setPastOpen(false);
    pushedPast.current = !asked || pushedPast.current;
    navigate(`${FRONT_PAGE}?day=${edition.day}`, { replace: !!asked });
  };
  const backToToday = () => {
    if (pushedPast.current) {
      pushedPast.current = false;
      window.history.back();
    } else navigate(FRONT_PAGE, { replace: true });
  };
  const [pastOpen, setPastOpen] = useState(false);
  useEditionHtml(today?.from === "site" ? today.entry : undefined, sites, fetched, setFetched);
  useEditionHtml(opened?.from === "site" ? opened.entry : undefined, sites, fetched, setFetched);
  const paperOf = (e: Edition<Printed>): Printed =>
    e.from === "session" ? e.paper : fromEntry(e.entry, fetched[e.entry.sha256] ?? "");
  // No servers to ask is not an answer: nothing is remembered, so a later load can try.
  // Only once the servers are final is "none" a failure; until then it is loading.
  const failedOf = (e: Edition<Printed>) =>
    e.from === "site" && (fetched[e.entry.sha256] === null || (!!sites?.settled && sites.servers.length === 0));
  const shown = today ? paperOf(today) : null;
  // The edition on the page: the asked past one, else today's.
  const viewing: Edition<Printed> | null = asked ? opened : today;
  const viewed = viewing ? paperOf(viewing) : null;
  // An asked day the site doesn't hold (once it has answered): said in the paper's place.
  const askedMissing = !!asked && !opened && site !== null;

  // Read by the print job when a paper is ready, not when Print was pressed: turning
  // publishing off while the paper is being written keeps that paper private.
  const choosePublish = (on: boolean) => {
    setPublish(on);
    if (!pubkey) return;
    writePublish(pubkey, on);
    if (!on) declinePublish(pubkey);
  };
  const displayName = user?.displayName ?? "";
  const [printOpen, setPrintOpen] = useState(false);

  const models = useModels(key);
  // The model is one provider's: when the key changes, the last provider's choice is
  // not sent to the new one while its list loads. The schedule's `model` (one choice for
  // every app) comes first, when it is for this key's endpoint; then what this browser
  // last used there; then the endpoint's first.
  const scheduledModel = keyFits ? observerModel(syncedSchedule) : null;
  const [chosen, setChosen] = useState<{ url: string; id: string } | null>(null);
  const model = key && chosen?.url === key.url ? chosen.id : "";
  useEffect(() => {
    if (!key) return;
    const remembered = scheduledModel ?? (pubkey ? readModel(pubkey, key.url) : null);
    if (models.status === "listed") {
      const usable = remembered && (remembered === scheduledModel || models.ids.includes(remembered));
      setChosen({ url: key.url, id: usable ? remembered : models.ids[0] });
    } else if (models.status === "unlisted") {
      setChosen({ url: key.url, id: remembered ?? "" });
    } else {
      setChosen(null);
    }
  }, [key?.url, models, scheduledModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // A choice made here goes to the schedule, so every app prints with it.
  // The pickers hold while one saves (the service runs every edit after the one before).
  const [setting, setSetting] = useState<{ saving: boolean; error: string | null }>({ saving: false, error: null });
  const saveSetting = async (change: (doc: TaskTags) => TaskTags): Promise<boolean> => {
    setSetting({ saving: true, error: null });
    const outcome = await updateObserverSchedule((d) => {
      const out = change(d);
      return out === d ? d : migrate(out);
    });
    setSetting({
      saving: false,
      error: outcome.success || outcome.cancelled ? null : (outcome.error ?? "Couldn't save it to your schedule."),
    });
    return outcome.success;
  };
  // The typed model last sent to the schedule, for this key: Enter and then leaving the
  // field are one commit, not two. Forgotten when the save fails, so it can be sent again.
  const committedModel = useRef<{ url: string; id: string } | null>(null);

  const chooseModel = (id: string) => {
    if (!key) return;
    setChosen({ url: key.url, id });
    if (pubkey) writeModel(pubkey, key.url, id);
  };
  /** The model as picked, written to the schedule (a typed id once the field is left). */
  const commitModel = (typed: string) => {
    const id = typed.trim();
    if (!key || !id || id === scheduledModel) return;
    const last = committedModel.current;
    if (last && last.url === key.url && last.id === id) return;
    const commit = { url: key.url, id };
    committedModel.current = commit;
    void saveSetting((d) => {
      const out = withObserverModel(d, id);
      // The model is the key's endpoint's: a `key` naming another endpoint goes with it.
      const choice = observerKeyChoice(readTask(out));
      return choice && apiRoot(choice.url) !== apiRoot(key.url) ? withObserverKey(out, key) : out;
    }).then((saved) => {
      if (!saved && committedModel.current === commit) committedModel.current = null;
    });
  };
  const chooseKey = (next: AgentKey) => {
    if (setting.saving || (key && sameKey(next, key))) return;
    committedModel.current = null;
    setPickedKey({ eventId: scheduleEventId, key: next });
    void saveSetting((d) => {
      const out = withObserverKey(d, next);
      // Another endpoint's model doesn't apply to this one: its default (or what this
      // browser last used there) does.
      const prev = pickObserverKey(readTask(d), allKeys);
      return prev && apiRoot(prev.url) === apiRoot(next.url) ? out : withObserverModel(out, null);
    });
  };

  // The picked model's Routstr prices, for the estimate and the balance check.
  const routstrModel = (models.status === "listed" && models.routstr?.get(model)) || null;
  // Held still between renders: the schedule card is memoized against the streamed chunks.
  const scheduleKeyNote = useMemo(
    () => <RoutstrPrintNote entry={key} model={routstrModel} variant="schedule" />,
    [key, routstrModel],
  );

  const print = () => {
    if (!key || !pubkey || !model) return;
    setPrintOpen(false);
    startPrint({ pubkey, key, model, readerName, displayName });
  };

  // The gate said yes and the relay said not yet: ask the gate again, so the row follows
  // its next answer instead of staying in progress until the next print.
  const turnedAwayAt = run.state === "pending" ? run.at : null;
  useEffect(() => {
    if (turnedAwayAt !== null && pubkey) void queryClient.invalidateQueries({ queryKey: ["search-observer", pubkey] });
  }, [turnedAwayAt, pubkey, queryClient]);

  // What stands between the reader and a paper: both needs, each on its own row.
  const keyStep: KeyStep =
    keys.status === "locked"
      ? { state: "locked" }
      : keys.status === "failed"
        ? { state: "failed" }
        : key
          ? { state: "done", provider: providerName(key.url) }
          : { state: "todo" };
  // `hasMywot` is the assistant the server mints at sign-in, so it says nothing about
  // scores: the scoring status says whether a calculation is running, failed or never ran.
  // The ranking is there once the search relay answers through the assistant.
  const scoringStatus = useScoringStatus();
  const scoring = scoringStatus.status;
  // Search ranks through the provider the reader's kind 10040 names: with none naming
  // Brainstorm, published scores never reach the paper, so "almost ready" would wait forever.
  const provider = useTrustProviderStatus(pubkey, mywot.taPubkey).data;
  const activated = provider === undefined || provider === "unknown" ? undefined : provider === "brainstorm";
  const ranked = isSearchObserver && canUseMywot;
  // A print the relay turned away says the ranking isn't there yet, whatever the gate
  // answered then; the gate's next answer (asked again on the spot) stands over it.
  const turnedAway = run.state === "pending" && observerCheckedAt <= run.at;
  const wotStep = wotStepOf({ hasAssistant: hasMywot, ranked: ranked && !turnedAway, scoring, activated });
  useEffect(() => {
    if (run.state === "pending" && !turnedAway && pubkey) settlePending(pubkey);
  }, [run, turnedAway, pubkey]);
  const checking =
    keys.status === "loading" ||
    (!mywot.known && mywot.isLoading) ||
    // The scoring status decides the row only while search doesn't rank yet.
    (hasMywot && !ranked && scoringStatus.isLoading);
  const blocker = checking ? "checking" : keyStep.state !== "done" || wotStep.state !== "done" ? "setup" : null;
  // Whether the reader has papers already: unknown until the site has answered (or a paper
  // was printed here), and unknown is never read as "none".
  const hasEditions = (site?.editions.length ?? 0) > 0 || page ? true : site ? false : null;
  const setupShown = blocker === "setup";

  const picker = key && blocker === null && (
    <div className="flex flex-col gap-2">
      {allKeys.length > 1 && <KeyPicker keys={allKeys} chosen={key} disabled={setting.saving} onChoose={chooseKey} />}
      <ModelPicker
        keyUrl={key.url}
        models={models}
        model={model}
        saving={setting.saving}
        onChoose={(id) => {
          chooseModel(id);
          if (models.status === "listed") commitModel(id);
        }}
        onCommit={commitModel}
      />
      <RoutstrPrintNote entry={key} model={routstrModel} />
      <SettingNote saving={setting.saving} error={setting.error} />
    </div>
  );
  const publishSwitch = <PublishSwitch on={publish} onChange={choosePublish} />;
  // Today's paper is the hint: it shows where Print does while there is one (the dialog).
  const printedHint = today && <PrintedTodayHint printedAt={today.printedAt} onOpen={() => setPrintOpen(false)} />;
  const observerLinks = pubkey && (site?.exists || publishState.state === "published") ? pubkey : null;
  const busy = run.state === "running";

  // This tab's paper for today that never reached the site (the tab was reloaded before it
  // was published, or the reader said Not now): offered again while publishing is on.
  const unpublished =
    !!pubkey &&
    publish &&
    today?.from === "session" &&
    !today.paper.published &&
    run.state !== "running" &&
    publishState.state === "idle" &&
    !site?.editions.some((e) => e.printedAt === today.printedAt);
  const publishOffer = unpublished && page && (
    <PublishOffer onPublish={() => offerPublish(pubkey, page, displayName)} />
  );
  const notice = publishState.state === "confirm" && pubkey && (
    <ObserverNotice
      pubkey={pubkey}
      onPublish={() => confirmPublish(pubkey, displayName)}
      onNotNow={() => declinePublish(pubkey)}
    />
  );
  const runStatus = (
    <AnimatePresence mode="wait">
      {run.state === "running" && (
        <Fade key="running">
          <Progress progress={job!.progress} onCancel={cancelPrint} />
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
  );
  const setupCard = setupShown && (
    <SetupChecklist keyStep={keyStep} wot={wotStep} hasEditions={hasEditions} onUnlock={keys.reveal} />
  );
  const checkingLine = blocker === "checking" && (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="front-page-checking">
      <Loader2 className="h-4 w-4 animate-spin" /> Checking…
    </div>
  );
  const schedule = pubkey && (
    <MorningSchedule
      schedule={scheduleState}
      reader={pubkey}
      assistant={mywot.taPubkey}
      sites={scheduleSites}
      migrate={migrate}
      keyNote={scheduleKeyNote}
    />
  );
  const statusShown =
    !!notice ||
    !!publishOffer ||
    (publishState.state !== "idle" && publishState.state !== "confirm") ||
    run.state !== "idle";

  return (
    <TooltipProvider delayDuration={300}>
      {(viewed && viewing) || asked ? (
        // A paper reads like a reader: the whole space under the app header, one slim
        // toolbar above it, and the paper scrolling inside its own frame. Today's, or a past
        // edition in the same place.
        <div className="flex h-[calc(100dvh-var(--bs-bottom-chrome,0px))] flex-col bg-background">
          {user && <AppHeader user={user} onLogout={() => logout()} />}
          <main
            className="flex min-h-0 flex-1 flex-col"
            data-testid={asked ? "front-page-past-view" : "front-page-today"}
            data-day={viewing?.day}
          >
            <div className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4">
              <PaperHeader
                when={when}
                page={viewed}
                busy={busy}
                observer={observerLinks}
                hasPast={past.length > 0}
                past={!!asked}
                missingDay={askedMissing ? asked : null}
                onPrintAgain={() => setPrintOpen(true)}
                onPast={() => setPastOpen(true)}
                onBackToToday={backToToday}
              />
            </div>
            {statusShown && (
              <div className={cn(pageWidth("wide"), "max-h-[45%] shrink-0 space-y-3 overflow-y-auto py-3")}>
                {notice}
                {publishOffer}
                <PublishStatus
                  state={publishState}
                  onRetry={() => page && pubkey && offerPublish(pubkey, page, displayName)}
                />
                {runStatus}
              </div>
            )}
            {viewed && viewing ? (
              <PaperFrame
                key={`${viewing.day}-${viewed.code}-${viewed.printedAt}`}
                page={viewed}
                zone={when.zone}
                failed={failedOf(viewing)}
              />
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center bg-[#faf8f3] p-4 text-sm text-slate-600">
                {askedMissing ? (
                  <span data-testid="front-page-day-missing">There's no edition for that day.</span>
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" data-testid="front-page-frame-loading" />
                )}
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="flex min-h-page flex-col bg-background">
          {user && <AppHeader user={user} onLogout={() => logout()} />}
          <main className={cn(pageWidth("wide"), "flex-1 py-6 sm:py-8")} data-testid="front-page-print-view">
            <div className="mx-auto max-w-5xl space-y-5">
              <Hero
                ready={blocker === null}
                busy={busy}
                onPrint={print}
                picker={picker}
                publishSwitch={publishSwitch}
                printedHint={printedHint}
                hint={models.status === "unlisted" && !model}
                canPrint={!!model}
              />
              {past.length > 0 && <PastEditionsLink count={past.length} onOpen={() => setPastOpen(true)} />}
              {notice}
              {setupCard}
              {checkingLine}
              {schedule}
              {runStatus}
            </div>
          </main>
          <Footer />
        </div>
      )}

      {/* Print again, over today's paper: the controls (or what setup still needs) and the
          morning schedule, which the paper's view has no room for. Shut when the page turns
          back into the print view (midnight), which shows them itself. */}
      <Dialog open={printOpen && !!shown && !asked} onOpenChange={setPrintOpen}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
          aria-describedby={undefined}
          data-testid="front-page-print-dialog"
        >
          <DialogHeader>
            <DialogTitle>Print again</DialogTitle>
          </DialogHeader>
          {setupCard}
          {checkingLine}
          {blocker === null && (
            <PrintControls
              picker={picker}
              publishSwitch={publishSwitch}
              printedHint={printedHint}
              hint={models.status === "unlisted" && !model}
              busy={busy}
              canPrint={!!model}
              again
              onPrint={print}
            />
          )}
          {schedule}
        </DialogContent>
      </Dialog>

      <PastEditions when={when} open={pastOpen} onOpenChange={setPastOpen} editions={past} onOpen={openPast} />
    </TooltipProvider>
  );
}

/** Fetches a site edition's html once, into `fetched`; a later site answer can try again. */
function useEditionHtml(
  entry: EditionEntry | undefined,
  site: SiteState | null,
  fetched: Record<string, string | null>,
  setFetched: React.Dispatch<React.SetStateAction<Record<string, string | null>>>,
) {
  const sha = entry?.sha256;
  const known = sha !== undefined && fetched[sha] !== undefined;
  // Keyed on the servers' names, not the list's identity: every new site object (a store
  // update, a publish) is a new list, and the download it restarted had to begin again.
  const serversKey = site?.servers.join("\n") ?? "";
  useEffect(() => {
    if (!sha || known || !serversKey) return;
    const controller = new AbortController();
    fetchBlob(sha, serversKey.split("\n"), { signal: controller.signal })
      .catch(() => null)
      .then((html) => {
        if (!controller.signal.aborted) setFetched((m) => ({ ...m, [sha]: html }));
      });
    return () => controller.abort();
  }, [sha, known, serversKey, setFetched]);
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
              The Observer
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
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Already printed today{printedAt !== undefined ? `, ${formatClock(printedAt * 1000)}` : ""}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2"
        onClick={onOpen}
        aria-label="Open today's paper"
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

/** Today's paper, printed in this tab, isn't on the reader's Observer: the way to put it there. */
function PublishOffer({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="front-page-publish-offer">
      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-muted-foreground">Not on your Observer yet</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2"
        onClick={onPublish}
        data-testid="front-page-publish-offer-ok"
      >
        Publish
      </Button>
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

/** The way to the papers before today's, on the print view. */
function PastEditionsLink({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground hover:text-foreground"
      onClick={onOpen}
      data-testid="front-page-past-editions-open"
    >
      <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
      Past editions
      <span className="ml-1.5 tabular-nums text-muted-foreground">{count}</span>
    </Button>
  );
}

/** When the page reads the time: now (ticking), and the zone today is a calendar day in. */
interface When {
  now: number;
  zone: string;
}

/** An edition's moment: when it was printed, else midday of the UTC day that names it. */
const editionAt = (edition: Edition<Printed>) =>
  edition.printedAt !== undefined ? edition.printedAt * 1000 : Date.parse(`${edition.day}T12:00:00Z`);

function pastHeadline(edition: Edition<Printed>): string | null {
  if (edition.from === "site") return edition.entry.headline?.trim() || null;
  return leadHeadline(edition.paper.html) || null;
}

/** The reader's earlier papers, newest first: the day and its headline, each opening in the paper's place. */
function PastEditions({
  when,
  open,
  onOpenChange,
  editions,
  onOpen,
}: {
  when: When;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editions: Edition<Printed>[];
  onOpen: (edition: Edition<Printed>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
        data-testid="front-page-past-editions"
      >
        <DialogHeader>
          <DialogTitle>Past editions</DialogTitle>
        </DialogHeader>
        {editions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No earlier papers yet.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {editions.map((edition) => {
              const headline = pastHeadline(edition);
              const code = edition.from === "site" ? edition.entry.code : edition.paper.code;
              const at = editionAt(edition);
              return (
                <li key={`${edition.from}-${edition.day}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(edition)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`front-page-past-edition-${edition.day}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-xs text-muted-foreground"
                        title={editionFullDate(at, when.zone)}
                        data-testid="front-page-past-edition-day"
                      >
                        <span aria-hidden="true">{editionDayLabel(at, when.now, when.zone)}</span>
                        <span className="sr-only">{editionFullDate(at, when.zone)}</span>
                      </span>
                      <span
                        className={cn(
                          "line-clamp-2 text-sm",
                          headline ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {headline ?? (code ? `Edition No. ${code}` : "No headline")}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
 * The paper's toolbar: the edition's day and the actions as
 * icons. The rest (edition number, model, tokens, what the check removed) is one tap away
 * in the info popover, not chips in the reader's way. A past edition trades Print again for
 * the way back to today.
 */
function PaperHeader({
  when,
  page,
  busy,
  observer,
  hasPast,
  past,
  missingDay,
  onPrintAgain,
  onPast,
  onBackToToday,
}: {
  when: When;
  /** Null while an asked past edition loads, or when there is none for its day. */
  page: Printed | null;
  busy: boolean;
  /** The reader's pubkey once they have an Observer site to link to. */
  observer: string | null;
  hasPast: boolean;
  /** A past edition is on show, not today's. */
  past: boolean;
  /** An asked day with no edition: named in the title all the same. */
  missingDay: string | null;
  onPrintAgain: () => void;
  onPast: () => void;
  onBackToToday: () => void;
}) {
  const at = page ? page.printedAt : missingDay ? Date.parse(`${missingDay}T12:00:00Z`) : null;
  return (
    <div className="flex items-center gap-2" data-testid="front-page-header">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {at !== null ? (
            <>
              <span aria-hidden="true" title={editionFullDate(at, when.zone)} data-testid="front-page-day">
                {editionDayLabel(at, when.now, when.zone)}
              </span>
              <span className="sr-only">{editionFullDate(at, when.zone)}</span>
            </>
          ) : (
            "The Observer"
          )}
        </h1>
      </div>
      {past && (
        <Button
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 rounded-full px-3"
          onClick={onBackToToday}
          aria-label="Back to today"
          data-testid="front-page-back-today"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {/* On a phone the arrow says "back": the day's name keeps its room. */}
          <span className="sm:hidden">Today</span>
          <span className="hidden sm:inline">Back to today</span>
        </Button>
      )}
      <div className="flex shrink-0 items-center">
        {!past && (
          <IconAction label="Print again" onClick={onPrintAgain} disabled={busy} testId="front-page-print-again">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </IconAction>
        )}
        {hasPast && (
          <IconAction label="Past editions" onClick={onPast} testId="front-page-past">
            <History className="h-4 w-4" />
          </IconAction>
        )}
        {page && (
          <IconAction
            label="Download"
            onClick={() => download(page)}
            disabled={!page.html}
            testId="front-page-download"
          >
            <Download className="h-4 w-4" />
          </IconAction>
        )}
        {page && <EditionInfo page={page} observer={observer} zone={when.zone} />}
      </div>
    </div>
  );
}

function EditionInfo({ page, observer, zone }: { page: Printed; observer: string | null; zone: string }) {
  const tokens = page.usage ? (page.usage.promptTokens ?? 0) + (page.usage.completionTokens ?? 0) : null;
  const rows: [string, string][] = [["Date", editionFullDate(page.printedAt, zone)]];
  if (page.code) rows.push(["Edition", `No. ${page.code}`]);
  // The counts live here, not over the paper: they aren't what the reader came for.
  if (page.events !== undefined) rows.push(["Posts", page.events.toLocaleString()]);
  if (page.quotes !== undefined) rows.push(["Quotes verified", String(page.quotes)]);
  if (page.unanswered) rows.push(["Desks that didn't answer", String(page.unanswered)]);
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

/** Which of the reader's keys prints, when they have more than one: provider and last four characters only. */
function KeyPicker({
  keys,
  chosen,
  disabled = false,
  onChoose,
}: {
  keys: AgentKey[];
  chosen: AgentKey;
  /** A choice is being saved: the next waits for it. */
  disabled?: boolean;
  onChoose: (key: AgentKey) => void;
}) {
  const index = keys.findIndex((k) => sameKey(k, chosen));
  return (
    <Select
      value={String(index)}
      disabled={disabled}
      onValueChange={(v) => keys[Number(v)] && onChoose(keys[Number(v)])}
    >
      <SelectTrigger aria-label="AI key" data-testid="front-page-key">
        <SelectValue placeholder="AI key" />
      </SelectTrigger>
      <SelectContent>
        {keys.map((k, i) => (
          // The index, never the key, names the option.
          <SelectItem key={i} value={String(i)}>
            {keyName(k)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Saving a choice to the schedule, or why it stayed in this browser. */
function SettingNote({ saving, error }: { saving: boolean; error: string | null }) {
  if (saving) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="front-page-setting-saving">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving for your other apps…
      </p>
    );
  }
  if (!error) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="front-page-setting-error">
      Used here only: {error}
    </p>
  );
}

function ModelPicker({
  keyUrl,
  models,
  model,
  saving = false,
  onChoose,
  onCommit,
}: {
  keyUrl: string;
  models: Models;
  model: string;
  /** A choice is being saved: the field holds still (and keeps focus) until it is. */
  saving?: boolean;
  onChoose: (id: string) => void;
  /** A typed model id, once the field is left or Enter pressed. */
  onCommit?: (id: string) => void;
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
        readOnly={saving}
        aria-busy={saving || undefined}
        onChange={(e) => onChoose(e.target.value.trim())}
        onBlur={(e) => onCommit?.(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit?.(e.currentTarget.value.trim());
        }}
        placeholder={`Model id on ${providerName(keyUrl)}`}
        aria-label="Model"
        data-testid="front-page-model-input"
      />
    );
  }
  return (
    <Select value={model} onValueChange={onChoose} disabled={saving}>
      <SelectTrigger aria-label="Model" data-testid="front-page-model">
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {/* The schedule's model, when the endpoint's list doesn't name it: still the reader's choice. */}
        {(model && !models.ids.includes(model) ? [model, ...models.ids] : models.ids).map((id) => {
          const sats = models.routstr ? estimateSats(models.routstr.get(id), editionEstimate()) : null;
          return (
            <SelectItem key={id} value={id}>
              {id}
              {sats !== null && (
                <span className="ml-2 text-xs text-muted-foreground" data-testid="front-page-model-sats">
                  ≈ {formatSats(sats)}
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

type KeyStep = { state: "done"; provider: string } | { state: "todo" } | { state: "locked" } | { state: "failed" };

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
  /**
   * The reader has papers already and removed a step: it isn't their first. Null while
   * that isn't known (the site not read yet, or not readable): the neutral title.
   */
  hasEditions: boolean | null;
  onUnlock: () => void;
}) {
  const title = hasEditions === false ? "Before your first paper" : "To print your paper";
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
            ) : keyStep.state === "failed" ? (
              // The signer didn't answer: the key is there, so asking again is the fix, not Connect.
              <Button
                size="sm"
                onClick={onUnlock}
                aria-label="Retry reading your AI key"
                data-testid="front-page-setup-key-retry"
              >
                <RotateCcw /> Retry
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
  if (wot.state === "todo" && wot.why === "activate") {
    return "Your rankings are published. Activate Brainstorm so search can rank through them.";
  }
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
        : wot.why === "activate"
          ? [
              "/setup/activate",
              "Activate",
              "Activate Brainstorm for your web of trust",
              "front-page-setup-wot-activate",
            ]
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

const STEPS = ["probe", "pull", "plan", "write", "check"] as const;

function Progress({ progress, onCancel }: { progress: PrintProgress; onCancel: () => void }) {
  // Each second while the model is quiet, so the wait's clock moves; each minute otherwise.
  const waiting = progress.step === "write" && progress.write?.phase === "waiting";
  const now = useNow(waiting ? 1_000 : 60_000);
  const at = STEPS.indexOf(progress.step);
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const pull = progress.pull;
  const label: Record<(typeof STEPS)[number], string> = {
    probe: "Checking your ranking",
    pull: pull ? `Reading the desks · ${pull.events.toLocaleString()} posts` : `Reading ${DESKS.length} desks`,
    plan: PLANNING,
    write: progress.step === "write" ? writeLine(progress, now) : progress.round > 1 ? "Fixing the page" : "Writing",
    check: "Checking quotes, pictures and links",
  };
  const secondary = progress.step === "write" ? writeDetail(progress) : null;
  return (
    <Card className="p-4 sm:p-5" data-testid="front-page-progress">
      {/* The one line read out as it changes: the step, never the clock or the log. */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="front-page-progress-status">
        {statusLine(progress, now, false)}
      </p>
      <ol className="space-y-3" aria-hidden="true">
        {STEPS.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "todo";
          return (
            <li
              key={s}
              className="flex items-center gap-3 text-sm"
              data-testid={`front-page-step-${s}`}
              data-state={state}
            >
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
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  state === "todo" ? "text-muted-foreground" : "text-foreground",
                )}
                data-testid={s === "write" ? "front-page-write-line" : undefined}
              >
                {label[s]}
              </span>
              {s === "pull" && state !== "todo" && pull && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {pull.desksDone}/{pull.desksTotal}
                </span>
              )}
              {s === "write" && state === "now" && secondary && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{secondary}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground" data-testid="front-page-keep-browsing">
        You can keep browsing Brainstorm. Keep this tab open.
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
          data-testid="front-page-details-toggle"
        >
          <ChevronRight className={cn("mr-1 h-4 w-4 transition-transform", open && "rotate-90")} aria-hidden="true" />
          {open ? "Hide details" : "Show details"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} data-testid="front-page-cancel">
          <X className="mr-1.5 h-4 w-4" /> Cancel
        </Button>
      </div>
      <div id={detailsId} hidden={!open}>
        {open && <PrintLog progress={progress} />}
      </div>
    </Card>
  );
}

/**
 * The print, line by line, and the model's thinking as it streams: for the curious and for
 * a print that seems stuck. Not a live region: read when the reader goes to it.
 */
function PrintLog({ progress }: { progress: PrintProgress }) {
  const thinkingRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const el = thinkingRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [progress.thinking]);
  const since = (at: number) => `+${elapsed(at - progress.startedAt)}`;
  return (
    <div className="mt-2 space-y-3 border-t border-border pt-3" aria-live="off" data-testid="front-page-details">
      <ol className="space-y-1 text-xs" aria-label="Print log">
        {progress.log.map((line, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{since(line.at)}</span>
            <span className="min-w-0 break-words text-foreground">{line.text}</span>
          </li>
        ))}
      </ol>
      {progress.thinking && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Thinking</p>
          <pre
            ref={thinkingRef}
            tabIndex={0}
            aria-label="The model's thinking"
            className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
            data-testid="front-page-thinking"
          >
            {progress.thinking}
          </pre>
        </div>
      )}
    </div>
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
 * The paper on show (today's or a past edition), filling the space under the toolbar: it
 * scrolls inside its own frame, so the page itself never does (one scrollbar, on a phone
 * too). An edition read back from the site shows a spinner while its bytes are on their
 * way, and says so when no server had them.
 */
function PaperFrame({ page, zone, failed = false }: { page: Printed; zone: string; failed?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // The model writes the layout, and some pages run edge to edge: a margin of newsprint
    // (house.css --paper) keeps the window's edge from clipping a folio's first letter.
    <div className="relative flex min-h-0 flex-1 bg-[#faf8f3] p-2 sm:p-4">
      {!page.html ? (
        <div className="grid flex-1 place-items-center p-3 text-sm text-slate-600">
          {failed ? (
            <span data-testid="front-page-frame-missing">None of your file servers had this edition.</span>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" data-testid="front-page-frame-loading" />
          )}
        </div>
      ) : (
        <>
          {!loaded && (
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center"
              data-testid="front-page-frame-loading"
            >
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}
          {/* The paper is always light, whatever the app's theme: newsprint. No scripts can run
              in it (no allow-scripts), and its links open in a new tab, outside the sandbox. */}
          <iframe
            title={`The Observer, ${editionFullDate(page.printedAt, zone)}`}
            srcDoc={page.html}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            className="block h-full w-full flex-1 border-0 bg-[#faf8f3]"
            data-testid="front-page-frame"
          />
        </>
      )}
    </div>
  );
}
