import { useEffect, useMemo, useState } from "react";
import { AlarmClock, AlertTriangle, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useObserverSchedule } from "@/hooks/useObserverSchedule";
import { emptyObserverSchedule } from "@/lib/frontPage/observerSchedule";
import {
  WEEKDAYS,
  WEEK_ORDER,
  browserTimeZone,
  describeDays,
  formatClock,
  formatWhen,
  lastRun,
  localSimple,
  missedRun,
  nextRunAt,
  readTask,
  relativeDay,
  setEnabled,
  setSimpleSchedule,
  taskStatus,
  weekdayName,
  type LocalSimple,
  type ScheduledTask,
  type TaskTags,
} from "@/lib/scheduledTasks";
import { updateObserverSchedule } from "@/services/observerSchedule";

/** What turning it on from nothing schedules: every morning at six, on the reader's clock. */
const FIRST_SCHEDULE: LocalSimple = { time: "06:00", days: [...WEEKDAYS] };

/**
 * The Observer's morning paper, a NIP-FB scheduled task (quartz
 * `plans/2026-11-11-observer-site.md`): when it prints, who printed it last, and whether
 * a morning was missed. Whichever of the reader's Amethyst devices has "Print from this
 * device" on claims each morning; Brainstorm never does. It edits the switch and, when
 * the schedule is a time on some weekdays, those; any other schedule is shown as written
 * (NIP-FB: a simple editor edits only what it can show again).
 */
export function MorningSchedule() {
  const state = useObserverSchedule();
  // No event yet is a schedule that is off: turning it on writes the first one.
  const held = state.status === "ready" ? state.doc : state.status === "none" ? NONE : null;
  // What a save in flight will make it (lib/listEdits' idea: an overlay, never a cache
  // write), shown until the store's copy moves past the one it was made from.
  const [pending, setPending] = useState<{ base: TaskTags | null; doc: TaskTags } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (pending && held !== pending.base) setPending(null);
  }, [held, pending]);
  const doc = pending?.doc ?? held;
  const schedule = useMemo(() => (doc ? readTask(doc) : null), [doc]);

  const save = async (change: (doc: TaskTags) => TaskTags) => {
    if (!doc || pending) return;
    let optimistic: TaskTags;
    try {
      optimistic = change(doc);
    } catch (err) {
      setError(err instanceof RangeError ? err.message : null);
      return;
    }
    setError(null);
    setPending({ base: held, doc: optimistic });
    const outcome = await updateObserverSchedule(change);
    if (!outcome.success) {
      setPending(null);
      if (!outcome.cancelled) setError(outcome.error ?? "Couldn't save your schedule.");
    }
  };

  const turn = (on: boolean) =>
    save((d) => {
      const next = setEnabled(d, on);
      // On, with nothing to go by: every morning at six on this clock, to change from there.
      return on && readTask(d).cron === null ? setSimpleSchedule(next, FIRST_SCHEDULE, browserTimeZone()) : next;
    });

  return (
    <Card className="p-4" data-testid="front-page-schedule">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <AlarmClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Morning paper</p>
          <p className="text-sm text-muted-foreground" data-testid="front-page-schedule-status">
            <StatusLine state={state} schedule={schedule} />
          </p>
          {schedule && state.status === "ready" && <RunLine schedule={schedule} />}
        </div>
        {state.status === "locked" && (
          <Button size="sm" variant="secondary" onClick={state.reveal} data-testid="front-page-schedule-unlock">
            Unlock
          </Button>
        )}
        {schedule && (
          <Switch
            checked={schedule.enabled}
            onCheckedChange={(on) => void turn(on)}
            disabled={!!pending}
            aria-label="Print each morning"
            data-testid="front-page-schedule-switch"
          />
        )}
      </div>

      {schedule?.enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-12">
          <ScheduleEditor
            schedule={schedule}
            busy={!!pending}
            onSave={(simple) => save((d) => setSimpleSchedule(d, simple, browserTimeZone()))}
          />
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
        </div>
      )}

      {schedule?.enabled && schedule.claim === null && schedule.ran === null && (
        <p
          className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground sm:pl-12"
          data-testid="front-page-schedule-device-hint"
        >
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          Turn on “Print from this device” in Amethyst to print it.
        </p>
      )}

      {error && (
        <p
          className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground sm:pl-12"
          data-testid="front-page-schedule-error"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          {error}
        </p>
      )}
    </Card>
  );
}

const NONE = emptyObserverSchedule();

function StatusLine({
  state,
  schedule,
}: {
  state: ReturnType<typeof useObserverSchedule>;
  schedule: ScheduledTask | null;
}) {
  if (state.status === "loading") return <>Checking…</>;
  if (state.status === "locked") return <>Unlock to see when it prints</>;
  if (state.status === "unreadable") return <>This account can't read the schedule</>;
  if (!schedule) return <>Not scheduled</>;
  const now = Date.now();
  const status = taskStatus(schedule, now);
  if (status === "off") return <>Not scheduled</>;
  if (status === "no-schedule") return <>Choose a time</>;
  if (status === "unreadable-schedule") return <>On a schedule this app can't read</>;
  if (status === "never") return <>Its schedule never comes round</>;

  const at = nextRunAt(schedule, now)!;
  // Set in another zone: say how it was set, where the reader can find it.
  const title = schedule.tz !== browserTimeZone() ? `${schedule.cron} (${schedule.tz})` : undefined;
  const local = localSimple(schedule, browserTimeZone(), now);
  if (!local) {
    return (
      <span title={title}>
        Printed on its own schedule · next <span className="text-foreground">{formatWhen(at)}</span>
      </span>
    );
  }
  const time = <span className="text-foreground">{formatClock(at)}</span>;
  const days = describeDays(local.days);
  const morning = Number(local.time.slice(0, 2)) < 12;
  let line: React.ReactNode;
  if (days === "every")
    line = (
      <>
        Printed each {morning ? "morning" : "day"} at {time}
      </>
    );
  else if (days === "weekdays") line = <>Printed each weekday at {time}</>;
  else if (days === "weekends") line = <>Printed on weekends at {time}</>;
  else
    line = (
      <>
        Printed at {time} on {days}
      </>
    );
  return <span title={title}>{line}</span>;
}

/**
 * Who printed it last and when (or that it never has), from what the printing device
 * wrote (`claim`, `ran`), and, unless paused, NIP-FB's warning for a missed morning: `ran`
 * older than the newest one due more than three hours ago. Brainstorm writes neither.
 */
function RunLine({ schedule }: { schedule: ScheduledTask }) {
  const now = Date.now();
  const last = lastRun(schedule);
  const missed = taskStatus(schedule, now) === "scheduled" ? missedRun(schedule, now) : null;
  if (missed) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="front-page-schedule-missed">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        Not printed since {relativeDay(missed.ran, now)}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground" data-testid="front-page-schedule-ran">
      {last
        ? `Last printed${last.by ? ` by ${last.by}` : ""} ${relativeDay(last.at, now)}, ${formatClock(last.at)}`
        : "Not printed yet"}
    </p>
  );
}

const sameSimple = (a: LocalSimple, b: LocalSimple) =>
  a.time === b.time && a.days.length === b.days.length && a.days.every((d) => b.days.includes(d));

/**
 * The time and weekdays on the reader's own clock, saved together with Save (each save is
 * a signed event). A schedule that says more than a time on some weekdays is shown as
 * written, not edited.
 */
function ScheduleEditor({
  schedule,
  busy,
  onSave,
}: {
  schedule: ScheduledTask;
  busy: boolean;
  onSave: (simple: LocalSimple) => void;
}) {
  const zone = browserTimeZone();
  const local = useMemo(() => localSimple(schedule, zone, Date.now()), [schedule, zone]);
  const editable = local !== null || schedule.cron === null;
  const current: LocalSimple = local ?? { time: "", days: [...WEEKDAYS] };
  const currentKey = `${current.time}|${current.days.join(",")}`;
  const [draft, setDraft] = useState<LocalSimple>(current);
  useEffect(() => setDraft(current), [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editable) {
    return (
      <span
        className="min-w-0 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
        title="Set in another app: edit it there"
        data-testid="front-page-schedule-cron"
      >
        {schedule.cron}
        {schedule.tz ? ` · ${schedule.tz}` : ""}
      </span>
    );
  }
  const dirty = !sameSimple(draft, current);
  const canSave = dirty && !!draft.time && draft.days.length > 0 && !busy;
  const commit = () => {
    if (canSave) onSave(draft);
  };
  return (
    <>
      <Input
        type="time"
        value={draft.time}
        onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        disabled={busy}
        aria-label="Time"
        className="w-32"
        data-testid="front-page-schedule-time"
      />
      <ToggleGroup
        type="multiple"
        size="sm"
        value={draft.days}
        onValueChange={(days) => setDraft((d) => ({ ...d, days: WEEKDAYS.filter((w) => days.includes(w)) }))}
        disabled={busy}
        aria-label="Days"
        className="gap-0.5"
        data-testid="front-page-schedule-days"
      >
        {WEEK_ORDER.map((day) => (
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={weekdayName(day, "long")}
            className="h-8 w-8 px-0 text-xs data-[state=on]:bg-brand-primary/10 data-[state=on]:text-brand-primary"
            data-testid={`front-page-schedule-day-${day}`}
          >
            {weekdayName(day, "narrow")}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {dirty && (
        <Button size="sm" onClick={commit} disabled={!canSave} data-testid="front-page-schedule-save">
          Save
        </Button>
      )}
    </>
  );
}
