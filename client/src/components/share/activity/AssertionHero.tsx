/**
 * A NIP-85 trusted assertion's page (NosFabrica/protocols trusted-assertions.md):
 * whom or what it scores, its rank, and the counts beside it. Kind 30382
 * scores a person, 30383 an event, 30384 an address, 30385 anything else by
 * its NIP-73 id. A score is one observer's, computed by the provider that
 * signed it (the author above): said so, since ranks from two observers do not
 * compare, and a score's existence is not an endorsement.
 */
import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { LinkChip } from "@/components/share/LinkPreview";
import { useRefEvents } from "@/hooks/useRefEvents";
import { metricNoun, readAssertion, type ActivityEvent, type Metric } from "@/lib/activity";
import type { Tone } from "@/lib/tones";
import { ActivityHeader, PersonCard, PersonName, QuotedRef, Section } from "./parts";

/** The spec's own counts, named as it defines them. */
const NAMED: Record<string, { label: string; tone?: (n: number) => Tone }> = {
  followers: { label: "Verified followers" },
  reporters: { label: "Verified reporters", tone: (n) => (n > 0 ? "warning" : "slate") },
  muters: { label: "Verified muters", tone: (n) => (n > 0 ? "warning" : "slate") },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function MetricTile({ metric }: { metric: Metric }) {
  const named = NAMED[metric.tag];
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
  return (
    <div data-testid="assertion-hero">
      <ActivityHeader
        title={
          person && assertion.pubkey ? (
            <>
              Trust score for <PersonName pubkey={assertion.pubkey} />
            </>
          ) : person ? (
            "Trust score"
          ) : event.kind === 30385 ? (
            "Score for an identifier"
          ) : event.kind === 30384 ? (
            "Score for an address"
          ) : (
            "Score for an event"
          )
        }
        subtitle="From one observer's web of trust, as this provider computed it. Scores from different observers don't compare."
        icon={Gauge}
      />

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
    </div>
  );
}
