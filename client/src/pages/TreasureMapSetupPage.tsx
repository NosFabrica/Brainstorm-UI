import { Fragment, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { TREASURE_MAP_PATH } from "@/components/assistants/shared";
import { KindChip, RawMapViewer } from "@/components/treasureMap/parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAssistantTreasureMap } from "@/hooks/useAssistantTreasureMap";
import {
  isFalseClaim,
  lineState,
  selfMapButtons,
  type DutyLine,
  type LineState,
  type SelfEntry,
  type SelfMapStatus,
} from "@/lib/assistantTreasureMap";
import { categoryOf } from "@/lib/dutyMenu";
import type { TreasureMapPublishResult } from "@/services/api";

/**
 * /setup/treasure-map — the checklist's "Publish your Assistant's Treasure
 * Map" step as a page, after Tapestry's /assistant/treasure-map: the duties the
 * reader's Map gives their Brainstorm Assistant and which are live, what the
 * Assistant's own Treasure Map should list, and the version it has published,
 * with Tapestry's Turn on / Update now / Turn off (hooks/useAssistantTreasureMap,
 * docs/assistant/TREASURE-MAP-ASK.md). The server decides what to list; this
 * only shows and compares. Words are Tapestry's (assistantTreasureMapCopy.js),
 * with "this instance" said as Brainstorm.
 */

const STATUS_LINE: Record<SelfMapStatus, string> = {
  current: "Your Assistant's Treasure Map is up to date.",
  missing: "Your Assistant's Treasure Map doesn't list its live duties yet.",
  "out-of-date": "Your Assistant's Treasure Map is out of date: it differs from the duties that are live now.",
};

// A live part the published version doesn't list isn't active yet: its reason says why.
const STATE_WORD: Partial<Record<LineState, string>> = {
  active: "Active",
  "live-unlisted": "Offered but not active",
  offered: "Offered but not active",
  "not-offered": "Not offered",
};

const REASONS: Record<string, string> = {
  "not-published-here": "Brainstorm doesn't publish these for your Assistant yet.",
  "nothing-to-publish": "Nothing to publish yet.",
  "not-landed": "Not published yet.",
  "not-scheduled": "Not kept up to date: no updates are scheduled.",
  unchecked: "Brainstorm can't check this key yet, so it isn't listed.",
};

/** A seconds timestamp as a plain date, e.g. "June 7, 2026"; null when there is none. */
function dateOf(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  return new Date(seconds * 1000).toLocaleDateString("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Why a part isn't active, word for word; none for an active one, or a reason with no words. */
function reasonLine(line: DutyLine, state: LineState): string | null {
  if (state === "live-unlisted") return "Live, but your Assistant's Treasure Map doesn't list it yet.";
  if (state !== "offered" || !line.reason) return null;
  if (line.reason === "upkeep-stopped") {
    const date = dateOf(line.lastLandedAt);
    return date ? `Not kept up to date: last published ${date}.` : null;
  }
  return REASONS[line.reason] ?? null;
}

const Dot = () => <span className="text-slate-400">·</span>;
const Key = ({ k }: { k: string }) => <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{k}</code>;
const Category = ({ k }: { k: string }) => (
  <span className="font-semibold text-slate-800 dark:text-slate-200">{categoryOf(k)}</span>
);
const Relay = ({ relay }: { relay: string }) => (
  <span className="min-w-0 break-all font-mono text-xs text-slate-500 dark:text-slate-400">{relay}</span>
);
const Note = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-slate-500 dark:text-slate-400">{children}</span>
);

function DutyLines({ duties, found }: { duties: DutyLine[]; found: SelfEntry[] }) {
  return (
    <ul className="space-y-1.5" data-testid="treasure-map-duties">
      {duties.map((line, i) => {
        const state = lineState(line, found);
        const reason = reasonLine(line, state);
        return (
          <li key={`${line.key}|${line.status}|${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Category k={line.key} /> <Dot /> <Key k={line.key} /> <Dot />{" "}
            {state === "elsewhere" ? (
              <Note>Your Treasure Map gives this to another Assistant.</Note>
            ) : (
              <span className="text-slate-700 dark:text-slate-300">{STATE_WORD[state]}</span>
            )}
            {state === "active" && line.relay && (
              <>
                {" "}
                <Dot /> <Relay relay={line.relay} />
              </>
            )}
            {reason && (
              <>
                {" "}
                <Dot /> <Note>{reason}</Note>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Entries({ entries, shouldSay, testid }: { entries: SelfEntry[]; shouldSay?: SelfEntry[]; testid: string }) {
  return (
    <ul className="space-y-1.5" data-testid={testid}>
      {entries.map((e) => (
        <li key={`${e.key}|${e.relay}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Category k={e.key} /> <Dot /> <Key k={e.key} /> <Dot /> <Relay relay={e.relay || "(no relay)"} />
          {shouldSay && isFalseClaim(e, shouldSay) && (
            <>
              {" "}
              <Dot /> <Note>Your Assistant's Treasure Map lists this, but it isn't live.</Note>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Report({ result }: { result: TreasureMapPublishResult }) {
  if (!result.published) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="treasure-map-report">
        Nothing changed, so nothing was published.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-xs" data-testid="treasure-map-report">
      {!result.on && (
        <p className="text-slate-600 dark:text-slate-300">
          Your Assistant&rsquo;s Treasure Map now lists none of its duties.
        </p>
      )}
      <ul className="space-y-1">
        {result.relays.map((r) => (
          <li key={r.url} className="flex items-center gap-1.5">
            {r.ok ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Published" />
            ) : (
              <X className="h-3.5 w-3.5 text-red-600" aria-label="Failed" />
            )}
            <span className="break-all font-mono text-slate-600 dark:text-slate-300">{r.url}</span>
            {r.message && <span className="text-slate-500 dark:text-slate-400">— {r.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelHead({ title, explainer, children }: { title: string; explainer?: string; children?: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        {children}
      </div>
      {explainer && <p className="text-xs text-slate-500 dark:text-slate-400">{explainer}</p>}
    </div>
  );
}

export default function TreasureMapSetupPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();
  const map = useAssistantTreasureMap(user?.pubkey, { probeRelays: true });
  const [pressing, setPressing] = useState<"on" | "update" | "off" | null>(null);
  const [result, setResult] = useState<TreasureMapPublishResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!user) return null;

  const press = async (which: "on" | "update" | "off") => {
    setResult(null);
    setFailure(null);
    setPressing(which);
    try {
      setResult(await map.set(which !== "off"));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setPressing(null);
    }
  };

  const buttons = selfMapButtons(map.on, map.status, map.found.length, map.missed.length);
  // A press waits for the published version to be read: its base is the newest one.
  const busy = pressing !== null || map.status === null;
  const label = (which: "on" | "update" | "off", words: string) => (
    <>
      {pressing === which && <Loader2 className="h-4 w-4 animate-spin" />}
      {pressing === which ? "Publishing…" : words}
    </>
  );
  const turnOff = (disabled: boolean) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void press("off")}
      disabled={disabled}
      data-testid="treasure-map-off"
    >
      {label("off", "Remove your Assistant's duties from its Treasure Map")}
    </Button>
  );
  const outcome = (
    <>
      {result && <Report result={result} />}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </>
  );
  const stateLine = map.on
    ? "Your Assistant's Treasure Map is set to list its live duties."
    : map.found.length > 0
      ? "Your Assistant's Treasure Map is set to list none of its duties, but the version found still lists some."
      : "Your Assistant's Treasure Map is set to list none of its duties.";

  return (
    <div className="min-h-page bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <AppHeader
        user={user}
        onLogout={() => {
          logout();
          navigate("/");
        }}
        search={false}
      />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <button
          type="button"
          onClick={() => navigate("/setup")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-link hover:underline"
          data-testid="treasure-map-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back to setup checklist
        </button>
        <div>
          <SectionHeader kicker="Account setup" className="mb-3" />
          <h1
            className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your Assistant&rsquo;s Treasure Map
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Your Assistant keeps its own Treasure Map (kind 10040), naming itself as its own Assistant, to show which
            duties it is publishing right now. If you move a duty to this Assistant and it is already publishing it, the
            switch takes effect right away instead of waiting for a first computation.
          </p>
        </div>

        {map.supported === false ? (
          <Card className="p-5 text-sm text-slate-600 dark:text-slate-300" data-testid="treasure-map-unavailable">
            Your Brainstorm server can&rsquo;t keep your Assistant&rsquo;s Treasure Map yet.
          </Card>
        ) : map.error ? (
          <>
            <Alert variant="destructive" data-testid="treasure-map-error">
              <AlertDescription>Couldn&rsquo;t reach your Assistant right now. {map.error.message}</AlertDescription>
            </Alert>
            {/* A press turns off without the check (TREASURE-MAP-ASK.md, the POST's step 1). */}
            <Card className="space-y-3 p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="treasure-map-off-unchecked">
                You can still remove your Assistant&rsquo;s duties from its Treasure Map: that doesn&rsquo;t need the
                check.
              </p>
              <div className="flex flex-wrap gap-2">{turnOff(pressing !== null)}</div>
              {outcome}
            </Card>
          </>
        ) : !map.supported ? (
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking your Assistant which duties are live…
          </p>
        ) : (
          <>
            <Card className="space-y-3 p-5">
              <PanelHead
                title="Your Assistant's duties"
                explainer="The duties your Treasure Map gives your Assistant, and which of them are live now."
              />
              {map.duties.length > 0 ? (
                <DutyLines duties={map.duties} found={map.found} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="treasure-map-no-duties">
                  Your Treasure Map gives your Assistant no duties.{" "}
                  <Link href={TREASURE_MAP_PATH} className="font-semibold text-brand-link hover:underline">
                    Your Treasure Map
                  </Link>
                </p>
              )}
            </Card>

            <Card className="space-y-3 p-5">
              <PanelHead
                title="What your Assistant's Treasure Map should list"
                explainer="Only the duties that are live now, each at the relay where it is published."
              />
              {map.shouldSay.length > 0 ? (
                <Entries entries={map.shouldSay} testid="treasure-map-should" />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="treasure-map-should-empty">
                  Nothing to list yet.
                </p>
              )}
            </Card>

            <Card className="space-y-3 p-5">
              <PanelHead title="Your Assistant's published Treasure Map">
                {map.status === "current" && (
                  <Chip tone="success" size="sm" className="uppercase tracking-wide">
                    Done
                  </Chip>
                )}
              </PanelHead>
              {map.found.length > 0 ? (
                <Entries entries={map.found} shouldSay={map.shouldSay} testid="treasure-map-published" />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="treasure-map-published-none">
                  {map.status === null ? "Checking…" : "Your Assistant's Treasure Map lists none of its duties."}
                </p>
              )}
              {map.published && (
                <div className="-mx-5 border-t border-border">
                  <RawMapViewer
                    show="Show your Assistant's raw Treasure Map"
                    hide="Hide your Assistant's raw Treasure Map"
                    chip={<KindChip>kind 10040</KindChip>}
                    label="Your Assistant's raw Treasure Map"
                  >
                    <pre>{JSON.stringify(map.published, null, 2)}</pre>
                  </RawMapViewer>
                </div>
              )}
              {map.status !== null && (
                <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="treasure-map-state">
                  {stateLine}
                </p>
              )}
              {map.checkingRelays && (
                <p
                  className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
                  data-testid="treasure-map-checking-relays"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking which relays have the newest version…
                </p>
              )}
              {map.missed.length > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="treasure-map-missed">
                  The newest version hasn&rsquo;t reached{" "}
                  {map.missed.map((relay, i) => (
                    <Fragment key={relay}>
                      {i > 0 && ", "}
                      <Relay relay={relay} />
                    </Fragment>
                  ))}{" "}
                  yet:{" "}
                  {map.on
                    ? "updating your Assistant's Treasure Map"
                    : "removing your Assistant's duties from its Treasure Map"}{" "}
                  sends it there.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {buttons.turnOn && (
                  <Button size="sm" onClick={() => void press("on")} disabled={busy} data-testid="treasure-map-on">
                    {label("on", "List your Assistant's live duties in its Treasure Map")}
                  </Button>
                )}
                {buttons.update.shown && (
                  <Button
                    size="sm"
                    onClick={() => void press("update")}
                    disabled={busy || !buttons.update.enabled}
                    data-testid="treasure-map-update"
                  >
                    {label("update", "Update your Assistant's Treasure Map now")}
                  </Button>
                )}
                {buttons.turnOff && turnOff(busy)}
              </div>
              {outcome}
            </Card>

            {/* While off, the state line says it; the status line is for a Map that is meant to list. */}
            {map.on && map.status && (
              <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="treasure-map-status">
                {STATUS_LINE[map.status]}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              What your Assistant offers:{" "}
              <Link href="/setup/duty-menu" className="font-semibold text-brand-link hover:underline">
                Duty Menu
              </Link>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The duties you give your Assistants:{" "}
              <Link href={TREASURE_MAP_PATH} className="font-semibold text-brand-link hover:underline">
                your Treasure Map
              </Link>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your Assistant&rsquo;s Treasure Map is public. Anyone can read which duties it lists as live.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
