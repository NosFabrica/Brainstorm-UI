import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlarmClock, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ObserverSchedule } from "@/hooks/useObserverSchedule";
import { useNow } from "@/hooks/useNow";
import { emptyObserverSchedule } from "@/lib/frontPage/observerSchedule";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  WEEK_ORDER,
  browserTimeZone,
  describeCron,
  describeDays,
  editSimpleSchedule,
  formatClock,
  formatNext,
  formatTimeOfDay,
  lastDue,
  lastRun,
  localSimple,
  missedRun,
  nextRunAt,
  readTask,
  relativeDay,
  runsBeforeNoon,
  setEnabled,
  setSimpleSchedule,
  taskStatus,
  weekdayName,
  zoneLabel,
  type LocalSimple,
  type ScheduledTask,
  type TaskTags,
} from "@/lib/scheduledTasks";
import { updateObserverSchedule } from "@/services/observerSchedule";

/** What turning it on from nothing schedules: every morning at six, on the reader's clock. */
const FIRST_SCHEDULE: LocalSimple = { time: "06:00", days: [...WEEKDAYS] };

/** No event yet is a schedule that is off: turning it on writes the first one. */
const NONE = emptyObserverSchedule();

/** A save on its way: what it will make the schedule, and, once written, the event it wrote. */
interface Pending {
  doc: TaskTags;
  wrote?: { id: string; createdAt: number };
}

/**
 * The Observer's morning paper, a NIP-FB scheduled task (quartz
 * `plans/2026-11-11-observer-site.md`): when it prints, who printed it last, and whether
 * a morning was missed. Whichever of the reader's Amethyst devices has "Print from this
 * device" on claims each morning; Brainstorm never does.
 *
 * Calm by default: one sentence, the last run, the switch. Tapping the card (or Edit)
 * opens the time and weekdays when the schedule is that simple, or what was written when
 * it isn't (NIP-FB: a simple editor edits only what it can show again).
 *
 * Memoized, and handed the page's one read of the schedule (`useObserverSchedule` keeps
 * its answer's identity until it changes): the page re-renders on every streamed chunk
 * while it prints, and none of that is this card's. What it shows is worked out once a
 * minute.
 */
export const MorningSchedule = memo(function MorningSchedule({ schedule: state }: { schedule: ObserverSchedule }) {
  const now = useNow(60_000);
  const zone = browserTimeZone();
  const held = state.status === "ready" ? state.doc : state.status === "none" ? NONE : null;
  const heldEvent = state.status === "ready" ? { id: state.eventId, createdAt: state.createdAt } : null;

  // What a save in flight will make it (lib/listEdits' idea: an overlay, never a cache
  // write). It stays until the update resolves AND the hook shows the event it wrote, or
  // a newer one: the save's own read adds events to the store, and an overlay that
  // dropped on any change would let a second save start mid-save.
  const [pending, setPending] = useState<Pending | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const landed =
    !!pending?.wrote &&
    !!heldEvent &&
    (heldEvent.id === pending.wrote.id || heldEvent.createdAt > pending.wrote.createdAt);
  useEffect(() => {
    if (landed) setPending(null);
  }, [landed]);
  const doc = (!landed && pending?.doc) || held;
  const schedule = useMemo(() => (doc ? readTask(doc) : null), [doc]);
  // The editor starts from what the relays hold, never from the overlay: a save that
  // fails leaves the reader's draft where it was.
  const heldSchedule = useMemo(() => (held ? readTask(held) : null), [held]);

  /** Applies `change`, returning whether it was saved. One at a time. */
  const save = async (change: (doc: TaskTags) => TaskTags): Promise<boolean> => {
    if (!doc || saving.current) return false;
    let optimistic: TaskTags;
    try {
      optimistic = change(doc);
    } catch (err) {
      setError(err instanceof RangeError ? err.message : null);
      return false;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    setPending({ doc: optimistic });
    try {
      const outcome = await updateObserverSchedule(change);
      if (outcome.success) {
        setPending(
          outcome.id
            ? { doc: outcome.doc ?? optimistic, wrote: { id: outcome.id, createdAt: outcome.createdAt ?? 0 } }
            : null,
        );
        return true;
      }
      setPending(null);
      if (!outcome.cancelled) setError(outcome.error ?? "Couldn't save your schedule.");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const turn = (on: boolean) =>
    void save((d) => {
      const at = Date.now();
      const next = setEnabled(d, on, at);
      // On, with nothing to go by: every morning at six on this clock, to change from there.
      return on && readTask(d).cron === null ? setSimpleSchedule(next, FIRST_SCHEDULE, browserTimeZone(), at) : next;
    });

  const view = useMemo(
    () => (schedule ? describe(schedule, zone, now) : null),
    // `now` is a minute tick: this is worked out once a minute, not once a render.
    [schedule, zone, now],
  );

  // NIP-FB's missed-run warning, from what the relays said when they last answered: a
  // device that printed since then hasn't been heard from yet. When a morning comes due
  // after that, ask again before saying it was missed.
  const checkedAt = state.checkedAt;
  const missed = useMemo(() => {
    if (!schedule || checkedAt === null || taskStatus(schedule, now) !== "scheduled") return null;
    return missedRun(schedule, Math.min(now, checkedAt));
  }, [schedule, now, checkedAt]);
  const { refresh } = state;
  useEffect(() => {
    if (!schedule || checkedAt === null || checkedAt >= now) return;
    if (lastDue(schedule, now) !== lastDue(schedule, checkedAt)) refresh();
  }, [schedule, now, checkedAt, refresh]);

  const ids = useId();
  const panelId = `${ids}-panel`;
  const zoneId = `${ids}-zone`;
  // Open only on a schedule that runs and that this account read. A time on some weekdays
  // (or none yet) opens the editor; anything else opens what was written.
  const canOpen = !!schedule && schedule.enabled && (state.status === "ready" || state.status === "none");
  const editable = canOpen && (!!view?.simple || schedule.cron === null);
  const base = useMemo(() => (heldSchedule ? localSimple(heldSchedule, zone, now) : null), [heldSchedule, zone, now]);
  const zoneNote =
    schedule?.tz && schedule.tz !== zone
      ? `Set on ${zoneLabel(schedule.tz)}${schedule.cron ? ` (${schedule.cron})` : ""}`
      : null;

  return (
    <Card
      className={cn("p-4", canOpen && !open && "cursor-pointer")}
      data-testid="front-page-schedule"
      onClick={(e) => {
        // The card opens on a tap anywhere but its own controls.
        if (!canOpen || open || (e.target as Element).closest("button, input, a, [role=switch], [role=group]")) return;
        setOpen(true);
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <AlarmClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground" data-testid="front-page-schedule-title">
            {view?.morning === false ? "Paper" : "Morning paper"}
          </p>
          <p
            role="status"
            className="break-words text-sm text-muted-foreground"
            title={zoneNote ?? undefined}
            aria-describedby={zoneNote ? zoneId : undefined}
            data-testid="front-page-schedule-status"
          >
            <StatusLine state={state} view={view} />
          </p>
          {zoneNote && (
            <span id={zoneId} className="sr-only">
              {zoneNote}
            </span>
          )}
          {schedule && state.status === "ready" && <RunLine schedule={schedule} missed={missed} now={now} />}
          <p
            role="status"
            className="text-xs text-muted-foreground empty:hidden"
            data-testid="front-page-schedule-saving"
          >
            {busy && (
              <span className="mt-1 inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </span>
            )}
          </p>
          {canOpen && !open && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-brand-primary hover:underline focus-visible:underline focus-visible:outline-none"
              aria-expanded={false}
              aria-controls={panelId}
              onClick={() => setOpen(true)}
              data-testid="front-page-schedule-edit"
            >
              {editable ? "Edit" : "Details"}
            </button>
          )}
        </div>
        {state.status === "locked" && (
          <Button size="sm" variant="secondary" onClick={state.reveal} data-testid="front-page-schedule-unlock">
            Unlock
          </Button>
        )}
        {state.status === "failed" && (
          <Button size="sm" variant="secondary" onClick={state.reveal} data-testid="front-page-schedule-retry">
            Retry
          </Button>
        )}
        {schedule && state.status !== "unreadable" && (
          <Switch
            checked={schedule.enabled}
            onCheckedChange={turn}
            disabled={busy}
            aria-label={view?.morning === false ? "Print on this schedule" : "Print each morning"}
            className="mt-1.5"
            data-testid="front-page-schedule-switch"
          />
        )}
      </div>

      {open && schedule?.enabled && (
        <div id={panelId} className="mt-3 space-y-2 sm:pl-12" data-testid="front-page-schedule-panel">
          {editable ? (
            <ScheduleEditor
              base={base}
              busy={busy}
              onSave={async (simple) => {
                const ok = await save((d) => editSimpleSchedule(d, simple, browserTimeZone(), Date.now()));
                if (ok) setOpen(false);
              }}
              onCancel={() => {
                setOpen(false);
                setError(null);
              }}
            />
          ) : (
            <ScheduleDetails schedule={schedule} now={now} onDone={() => setOpen(false)} />
          )}
          {/* The details name the zone themselves; the editor's times are on this clock. */}
          {zoneNote && editable && <p className="text-xs text-muted-foreground">{zoneNote}</p>}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground sm:pl-12"
          data-testid="front-page-schedule-error"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          {error}
        </p>
      )}
      {state.status === "failed" && !error && (
        <p className="mt-2 text-xs text-muted-foreground sm:pl-12" data-testid="front-page-schedule-failed">
          {state.error}
        </p>
      )}
    </Card>
  );
});

/** What the card says about a schedule, worked out once per schedule and minute. */
interface View {
  status: ReturnType<typeof taskStatus>;
  /** On the reader's clock, when the schedule is a time on some weekdays. */
  simple: LocalSimple | null;
  /** A schedule that isn't simple, in words; null when it can't be said plainly. */
  words: string | null;
  /** Every run before noon on the reader's clock; null when that can't be told. */
  morning: boolean | null;
}

function describe(schedule: ScheduledTask, zone: string, now: number): View {
  const status = taskStatus(schedule, now);
  const simple = schedule.tz ? localSimple(schedule, zone, now) : null;
  const readable = !!schedule.tz && status !== "unreadable-schedule" && status !== "no-schedule";
  const words = readable && !simple ? describeCron(schedule.cron, schedule.tz!, zone, now) : null;
  let morning: boolean | null = null;
  if (simple) morning = Number(simple.time.slice(0, 2)) < 12;
  else if (readable) morning = runsBeforeNoon(schedule.cron, schedule.tz!, zone, now);
  else if (status === "unreadable-schedule") morning = false;
  return { status, simple, words, morning };
}

function Raw({ cron }: { cron: string }) {
  return (
    <code
      className="break-all rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
      data-testid="front-page-schedule-cron"
    >
      {cron}
    </code>
  );
}

function StatusLine({ state, view }: { state: ObserverSchedule; view: View | null }) {
  if (state.status === "loading") return <>Checking…</>;
  if (state.status === "locked") return <>Encrypted to your account</>;
  if (state.status === "failed") return <>Couldn&apos;t open your schedule</>;
  if (state.status === "unreadable") return <>This account can&apos;t read the schedule</>;
  const schedule = state.status === "ready" ? state.schedule : null;
  if (!view) return <>Not scheduled</>;
  if (view.status === "off") return <>{schedule?.cron ? "Paused" : "Not scheduled"}</>;
  if (view.status === "no-schedule") return <>Choose a time</>;
  const cron = state.status === "ready" ? (state.schedule.cron ?? "") : "";
  if (view.status === "unreadable-schedule")
    return (
      <>
        On a schedule this app can&apos;t read: <Raw cron={cron} />
      </>
    );
  if (view.status === "never")
    return (
      <>
        On a schedule that never comes round: <Raw cron={cron} />
      </>
    );
  if (view.words) return <>{view.words}</>;
  if (!view.simple)
    return (
      <>
        On its own schedule: <Raw cron={cron} />
      </>
    );
  const time = <span className="whitespace-nowrap text-foreground">{formatTimeOfDay(view.simple.time)}</span>;
  const days = describeDays(view.simple.days);
  if (days === "every")
    return (
      <>
        Printed each {view.morning ? "morning" : "day"} at {time}
      </>
    );
  if (days === "weekdays") return <>Printed each weekday at {time}</>;
  if (days === "weekends") return <>Printed on weekends at {time}</>;
  return (
    <>
      Printed at {time} on {days}
    </>
  );
}

/**
 * Who printed it last and when (or that it never has), from what the printing device
 * wrote (`claim`, `ran`), and, unless paused, NIP-FB's warning for a missed morning.
 * Brainstorm writes neither.
 */
function RunLine({ schedule, missed, now }: { schedule: ScheduledTask; missed: { ran: number } | null; now: number }) {
  if (missed) {
    return (
      <p
        className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground"
        data-testid="front-page-schedule-missed"
      >
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        Not printed since {relativeDay(missed.ran, now)}
      </p>
    );
  }
  const last = lastRun(schedule);
  if (last) {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground" data-testid="front-page-schedule-ran">
        Last printed{last.by ? ` by ${last.by}` : ""} {relativeDay(last.at, now)}, {formatClock(last.at)}
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-xs text-muted-foreground" data-testid="front-page-schedule-ran">
      Not printed yet.
      {schedule.enabled && schedule.claim === null && (
        <span data-testid="front-page-schedule-device-hint">
          {" "}
          Turn on “Print from this device” in Amethyst to print it.
        </span>
      )}
    </p>
  );
}

/** A schedule set elsewhere, shown as written (NIP-FB: a client that can't show a cron leaves it unchanged). */
function ScheduleDetails({ schedule, now, onDone }: { schedule: ScheduledTask; now: number; onDone: () => void }) {
  const next = nextRunAt(schedule, now);
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {schedule.cron && (
        <p>
          Written as <Raw cron={schedule.cron} />
          {schedule.tz ? <> in {schedule.tz}</> : <>, with no time zone this app knows</>}
        </p>
      )}
      {next !== null && <p>Next: {formatNext(next, now)}</p>}
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span>Set in another app: change it there.</span>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onDone} data-testid="front-page-schedule-done">
          Done
        </Button>
      </p>
    </div>
  );
}

const sameSimple = (a: LocalSimple, b: LocalSimple) =>
  a.time === b.time && a.days.length === b.days.length && a.days.every((d) => b.days.includes(d));

/**
 * The time and weekdays on the reader's own clock, saved together with Save (each save is
 * a signed event). The draft follows the schedule only while the reader hasn't changed it:
 * a save that fails, or another device's edit landing, leaves their edit where it was.
 */
function ScheduleEditor({
  base,
  busy,
  onSave,
  onCancel,
}: {
  base: LocalSimple | null;
  busy: boolean;
  onSave: (simple: LocalSimple) => void;
  onCancel: () => void;
}) {
  const current = base ?? { time: "", days: [...WEEKDAYS] };
  const [draft, setDraft] = useState<LocalSimple>(current);
  const synced = useRef(current);
  const currentKey = `${current.time}|${current.days.join(",")}`;
  useEffect(() => {
    // Untouched: follow the schedule. Touched: it is the reader's, until they save or cancel.
    setDraft((d) => (sameSimple(d, synced.current) ? current : d));
    synced.current = current;
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !sameSimple(draft, current);
  const canSave = dirty && !!draft.time && draft.days.length > 0 && !busy;
  const commit = () => {
    if (canSave) onSave(draft);
  };
  return (
    <div className="space-y-2" data-testid="front-page-schedule-editor">
      <div className="flex items-center gap-2">
        <Input
          type="time"
          value={draft.time}
          onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          disabled={busy}
          aria-label="Time"
          className="h-10 w-32 sm:h-9"
          data-testid="front-page-schedule-time"
        />
        <Button
          size="sm"
          className="h-10 sm:h-9"
          onClick={commit}
          disabled={!canSave}
          data-testid="front-page-schedule-save"
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-10 sm:h-9" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
      <ToggleGroup
        type="multiple"
        variant="outline"
        value={draft.days}
        onValueChange={(days) => setDraft((d) => ({ ...d, days: WEEKDAYS.filter((w) => days.includes(w)) }))}
        disabled={busy}
        aria-label="Days"
        className="grid max-w-xs grid-cols-7 gap-1 sm:flex sm:max-w-none sm:justify-start"
        data-testid="front-page-schedule-days"
      >
        {WEEK_ORDER.map((day) => (
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={weekdayName(day, "long")}
            className={cn(
              "h-10 w-full min-w-0 px-0 text-xs sm:h-8 sm:w-8",
              "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              "data-[state=on]:border-brand-primary data-[state=on]:bg-brand-primary data-[state=on]:text-white",
              "data-[state=on]:hover:bg-brand-primary-hover data-[state=on]:hover:text-white",
            )}
            data-testid={`front-page-schedule-day-${day}`}
          >
            {weekdayName(day, "narrow")}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
