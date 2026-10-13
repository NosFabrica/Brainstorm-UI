/**
 * A NIP-85 trusted assertion's page (NosFabrica/protocols trusted-assertions.md):
 * whom or what it scores, its rank, and the counts beside it. Kind 30382
 * scores a person, 30383 an event, 30384 an address, 30385 anything else by
 * its NIP-73 id. A score is one observer's, computed by the provider that
 * signed it (the author above): said so, since ranks from two observers do not
 * compare, and a score's existence is not an endorsement.
 */
import { useMemo, type ReactNode } from "react";
import { Gauge } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { LinkChip } from "@/components/share/LinkPreview";
import { useRefEvents } from "@/hooks/useRefEvents";
import { metricNoun, readAssertion, type ActivityEvent, type Metric } from "@/lib/activity";
import { kindTypeLabel } from "@/lib/kindLabel";
import { identifierName } from "@/lib/nip73";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { Tone } from "@/lib/tones";
import { ActivityHeader, PersonCard, PersonName, QuotedRef, Section } from "./parts";

/** The spec's own counts, named as it defines them. */
const NAMED: Record<string, { label: string; tone?: (n: number) => Tone }> = {
  followers: { label: "Verified followers" },
  reporters: { label: "Verified reporters", tone: (n) => (n > 0 ? "warning" : "slate") },
  muters: { label: "Verified muters", tone: (n) => (n > 0 ? "warning" : "slate") },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TITLE_MAX = 80;
const clip = (s: string) => (s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1)}…` : s);
/** "a note", "an article": a kind's label as a noun in a sentence. */
const aKind = (kind: number) => {
  const noun = kindTypeLabel(kind).toLowerCase();
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
};

/** What a scored event is called in the title: its own title, else "a note by @alice". */
function eventSubject(ev: MinimalEvent): ReactNode {
  const own = ev.tags.find((t) => ["title", "name", "subject"].includes(t[0]) && t[1]?.trim())?.[1]?.trim();
  if (own) return `“${clip(own)}”`;
  return (
    <>
      {aKind(ev.kind)} by <PersonName pubkey={ev.pubkey} />
    </>
  );
}

function MetricTile({ metric }: { metric: Metric }) {
  // Own keys only: a tag is anything an event says, `constructor` included.
  const named = Object.hasOwn(NAMED, metric.tag) ? NAMED[metric.tag] : undefined;
  return (
    <StatTile
      compact
      value={metric.value.toLocaleString()}
      label={named?.label ?? cap(metricNoun(metric.tag))}
      tone={named?.tone?.(metric.value) ?? "slate"}
      data-testid={`assertion-metric-${metric.tag}`}
    />
  );
}

export function AssertionHero({ event }: { event: ActivityEvent }) {
  const assertion = useMemo(() => readAssertion(event), [event]);
  const targets = useMemo(() => (assertion.ref ? [assertion.ref] : []), [assertion]);
  const refs = useRefEvents(targets);
  const person = event.kind === 30382;
  const rest = assertion.metrics.filter((m) => m.tag !== "rank" && m.tag !== "hops");
  const scored = assertion.ref ? refs.get(assertion.ref) : undefined;
  const identifier = identifierName(assertion.identifier ?? undefined);
  const addrKind = assertion.ref?.addr ? Number(assertion.ref.addr.split(":")[0]) : NaN;
  const subjectTitle: ReactNode = person ? (
    assertion.pubkey ? (
      <>
        Trust score for <PersonName pubkey={assertion.pubkey} />
      </>
    ) : (
      "Trust score"
    )
  ) : scored ? (
    <>Score for {eventSubject(scored)}</>
  ) : identifier ? (
    <span title={assertion.identifier ?? undefined}>Score for {clip(identifier)}</span>
  ) : event.kind === 30385 ? (
    "Score for an identifier"
  ) : Number.isFinite(addrKind) ? (
    `Score for ${aKind(addrKind)}`
  ) : (
    "Score for an event"
  );
  return (
    <div data-testid="assertion-hero">
      <ActivityHeader
        // What is scored leads the page: the title names it, and its card sits
        // right under the title, above the numbers.
        title={subjectTitle}
        subtitle="From one observer's web of trust, as this provider computed it. Scores from different observers don't compare."
        icon={Gauge}
      />

      {person && assertion.pubkey && (
        <Section kicker="About" testId="assertion-subject">
          <PersonCard pubkey={assertion.pubkey} />
        </Section>
      )}
      {assertion.ref && (
        <Section kicker="Scored" testId="assertion-subject">
          <QuotedRef target={assertion.ref} refs={refs} />
        </Section>
      )}
      {assertion.identifier && (
        <Section kicker="Scored" testId="assertion-subject">
          {/^https?:\/\//i.test(assertion.identifier) ? (
            <LinkChip url={assertion.identifier} />
          ) : (
            <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">{assertion.identifier}</p>
          )}
        </Section>
      )}

      <div className="mt-4 flex flex-wrap gap-2" data-testid="assertion-metrics">
        {assertion.rank !== null && (
          <StatTile
            compact
            value={`${assertion.rank.toLocaleString()}${person ? " / 100" : ""}`}
            label="Rank"
            tone="brand"
            data-testid="assertion-rank"
          />
        )}
        {/* An absent `hops` is no known follow path — never 0, which is the observer's own record. */}
        {person && (
          <StatTile
            compact
            value={assertion.hops !== null ? assertion.hops.toLocaleString() : "—"}
            label={assertion.hops !== null ? (assertion.hops === 1 ? "Hop away" : "Hops away") : "No known follow path"}
            tone="slate"
            data-testid="assertion-hops"
          />
        )}
        {rest.map((m) => (
          <MetricTile key={m.tag} metric={m} />
        ))}
      </div>
    </div>
  );
}
