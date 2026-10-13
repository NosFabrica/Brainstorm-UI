/**
 * The pages of events that act on other events: a deletion (NIP-09, 5), a
 * report (NIP-56, 1984), a label (NIP-32, 1985) and a community's approval of
 * a post (NIP-72, 4550). Each says what it did and quotes what it did it to.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Flag, ShieldCheck, Tag, Trash2, Users } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SetRoster } from "@/components/share/FollowSetHero";
import { HashtagChips } from "@/components/share/ListPreview";
import { LinkChip } from "@/components/share/LinkPreview";
import { ReadingText } from "@/components/share/ReadingText";
import { useRefEvents, type ProfileLite } from "@/hooks/useRefEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import {
  approvalAuthority,
  readApproval,
  readDeletion,
  readLabel,
  readReport,
  type ActivityEvent,
  type EventRef,
} from "@/lib/activity";
import { kindTypeLabel } from "@/lib/kindLabel";
import { hostOf } from "@/lib/resultReaders";
import { describeThing } from "@/lib/thing";
import type { MinimalEvent } from "@/lib/noteRefs";
import {
  ActivityHeader,
  PersonCard,
  PersonName,
  QuotedCard,
  QuotedRef,
  QuotedRefs,
  Section,
  refHref,
  useFoldedRefs,
} from "./parts";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function DeletionHero({ event }: { event: ActivityEvent }) {
  const deletion = useMemo(() => readDeletion(event), [event]);
  // Asked for the ones on screen: a deletion of hundreds asks for five, "Show all" for the rest.
  const fold = useFoldedRefs(deletion.targets);
  const refs = useRefEvents(fold.shown);
  const n = deletion.targets.length;
  // NIP-09: only an event's own author can delete it. One by someone else is still there.
  // Counted among the ones asked for.
  const notTheirs = fold.shown.filter((t) => {
    const found = refs.get(t);
    return found && found.pubkey !== event.pubkey;
  }).length;
  return (
    <div data-testid="deletion-hero">
      <ActivityHeader
        title={n ? `Deleted ${plural(n, "event")}` : "Asked to delete"}
        subtitle={
          !notTheirs
            ? null
            : n === 1
              ? "It is someone else's, so it stays up."
              : `${notTheirs.toLocaleString()} of them ${notTheirs === 1 ? "is" : "are"} someone else's, so ${notTheirs === 1 ? "it stays" : "they stay"} up.`
        }
        icon={Trash2}
        chips={deletion.kinds.slice(0, 4).map((k) => (
          <Chip key={k} tone="slate" size="sm" data-testid="deletion-kind">
            {kindTypeLabel(k)}
          </Chip>
        ))}
      />
      {deletion.reason && (
        <Section kicker="Reason" testId="deletion-reason">
          <ReadingText text={deletion.reason} tags={event.tags} />
        </Section>
      )}
      {n > 0 && (
        <Section kicker="Deleted" testId="deletion-targets">
          <QuotedRefs
            targets={deletion.targets}
            refs={refs}
            missing="No longer available"
            open={fold.open}
            onOpenChange={fold.setOpen}
          />
        </Section>
      )}
    </div>
  );
}

/** Report types that make a quote something to choose to see, not something shown. */
const HIDDEN_REASONS = new Set(["nudity", "illegal", "malware"]);

export function ReportHero({ event }: { event: ActivityEvent }) {
  const report = useMemo(() => readReport(event), [event]);
  const targets = useMemo(() => (report.event ? [report.event] : []), [report]);
  const refs = useRefEvents(targets);
  const hide = !!report.reason && HIDDEN_REASONS.has(report.reason);
  const [shown, setShown] = useState(false);
  return (
    <div data-testid="report-hero">
      <ActivityHeader
        title={
          report.person && !report.event ? (
            <>
              Reported <PersonName pubkey={report.person} />
            </>
          ) : (
            "Reported a post"
          )
        }
        icon={Flag}
        chips={
          report.reason ? (
            <Chip tone={report.reason === "other" ? "slate" : "danger"} data-testid="report-reason">
              {cap(report.reason)}
            </Chip>
          ) : null
        }
      />
      {report.comment && (
        <ReadingText
          text={report.comment}
          tags={event.tags}
          className="mt-4 border-l-2 border-slate-200 pl-3 dark:border-slate-700"
          testId="report-comment"
        />
      )}
      {report.person && (
        <Section kicker={report.event ? "Whose post" : "Reported"} testId="report-person">
          <PersonCard pubkey={report.person} />
        </Section>
      )}
      {report.event && (
        <Section kicker="Reported post" testId="report-event">
          {hide && !shown ? (
            <button
              type="button"
              onClick={() => setShown(true)}
              className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-left text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-400"
              data-testid="report-event-reveal"
            >
              Reported as {report.reason} — show the post
            </button>
          ) : (
            <QuotedRef target={report.event} refs={refs} />
          )}
        </Section>
      )}
    </div>
  );
}

export function LabelHero({ event }: { event: ActivityEvent }) {
  const label = useMemo(() => readLabel(event), [event]);
  const fold = useFoldedRefs(label.events);
  const refs = useRefEvents(fold.shown);
  const relays = label.links.filter((l) => /^wss?:\/\//i.test(l));
  const pages = label.links.filter((l) => /^https?:\/\//i.test(l));
  const nothing = !label.people.length && !label.events.length && !label.links.length && !label.hashtags.length;
  return (
    <div data-testid="label-hero">
      <ActivityHeader
        title={label.labels.length ? "Labelled" : "A label"}
        subtitle={
          label.namespaces.length ? `In the ${label.namespaces.map((ns) => `“${ns}”`).join(", ")} namespace` : null
        }
        icon={Tag}
      />
      {label.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="label-values">
          {label.labels.map((l) => (
            <Chip
              key={JSON.stringify([l.namespace, l.value])}
              tone="brand"
              title={l.namespace ?? undefined}
              data-testid="label-value"
            >
              {l.value}
            </Chip>
          ))}
        </div>
      )}
      {label.comment && <ReadingText text={label.comment} tags={event.tags} className="mt-3" testId="label-comment" />}
      {!nothing && (
        <Section kicker="Labelled" testId="label-targets">
          {/* A label on a thousand people is a roster folded after 25, not a thousand chips. */}
          {label.people.length > 0 && (
            <div data-testid="label-people">
              <SetRoster members={label.people} />
            </div>
          )}
          {label.events.length > 0 && (
            <QuotedRefs
              targets={label.events}
              refs={refs}
              testId="label-events"
              open={fold.open}
              onOpenChange={fold.setOpen}
            />
          )}
          {pages.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="label-links">
              {pages.map((u) => (
                <LinkChip key={u} url={u} />
              ))}
            </div>
          )}
          {relays.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="label-relays">
              {relays.map((r) => (
                <Chip key={r} tone="slate">
                  {hostOf(r)}
                </Chip>
              ))}
            </div>
          )}
          {label.hashtags.length > 0 && <HashtagChips hashtags={label.hashtags} />}
        </Section>
      )}
    </div>
  );
}

export function ApprovalHero({ event }: { event: ActivityEvent }) {
  const approval = useMemo(() => readApproval(event), [event]);
  const targets = useMemo(
    () =>
      [approval.community ? { addr: approval.community } : null, approval.embedded ? null : approval.post].filter(
        (r): r is EventRef => !!r,
      ),
    [approval],
  );
  const refs = useRefEvents(targets);
  const community = approval.community ? refs.get({ addr: approval.community }) : undefined;
  // Anyone can sign a 4550: it is the community's word from its owner or a
  // moderator its definition names. Until the definition lands, a claim — the
  // page draws now, and firms up when it does.
  const authority = approvalAuthority(approval, event.pubkey, community);
  const thing = community ? describeThing(community) : null;
  const name = thing?.title ?? approval.community?.split(":").slice(2).join(":") ?? null;
  const embeddedPeople = useMemo(() => (approval.embedded ? [approval.embedded.pubkey] : []), [approval]);
  const embeddedProfiles = useLiveProfiles(embeddedPeople);
  return (
    <div data-testid="approval-hero">
      <ActivityHeader
        title={authority ? "Approved a post" : "Says it approved a post"}
        subtitle={
          name && approval.community ? (
            <>
              For the{" "}
              <Link
                href={refHref({ addr: approval.community })}
                className="font-medium text-brand-primary hover:underline dark:text-brand-link"
                data-testid="approval-community"
              >
                {thing ? <EmojiText text={name} tags={thing.emoji} /> : name}
              </Link>{" "}
              community
            </>
          ) : null
        }
        icon={thing?.image ? undefined : approval.community ? Users : ShieldCheck}
        mark={thing?.image ? <img src={thing.image} alt="" className="h-full w-full object-cover" /> : undefined}
      />
      {(approval.embedded || approval.post) && (
        <Section kicker="The post" testId="approval-post">
          {approval.embedded ? (
            <QuotedCard
              event={approval.embedded as MinimalEvent}
              profiles={embeddedProfiles as Map<string, ProfileLite>}
            />
          ) : (
            approval.post && <QuotedRef target={approval.post} refs={refs} />
          )}
        </Section>
      )}
    </div>
  );
}
