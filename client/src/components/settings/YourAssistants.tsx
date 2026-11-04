import type { ReactNode } from "react";
import { Link } from "wouter";
import { Bot, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { nameOf, type Profiles } from "@/components/messages/people";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { useVerifiedHost } from "@/hooks/useVerifiedHost";
import { assistantsOf, dutiesSummary, othersOf, type AssistantDuties } from "@/lib/assistantDuties";
import type { MapCategory } from "@/lib/treasureMapCards";

const LABEL: Record<MapCategory, string> = { scores: "Scores", lists: "Lists", concepts: "Concepts" };

/**
 * Settings › Assistants › Yours, growing with the User. While everything
 * happens on this site it is one card: `children`, this site's Assistant (the
 * big card, whose onboarding also carries a User with no Assistant yet). Once
 * another Assistant holds a Duty: one sentence saying where the Duties live,
 * the card, then "Also working for you" with the others only — this site's is
 * never repeated — and a link to change who does what in the Treasure Map.
 */
export function YourAssistants({ viewer, children }: { viewer: string | undefined; children: ReactNode }) {
  const { taPubkey } = useHasMywot();
  const map = useTrustProviderList(viewer ?? null).event;
  const assistants = taPubkey ? assistantsOf(map, taPubkey) : [];
  const profiles = useLiveProfiles(assistants.map((a) => a.pubkey));
  // At most four Assistants hold Duties — this deployment's, and one per
  // category — so their verified sites are read in four fixed calls.
  const sites = [
    useVerifiedHost(assistants[0]?.pubkey),
    useVerifiedHost(assistants[1]?.pubkey),
    useVerifiedHost(assistants[2]?.pubkey),
    useVerifiedHost(assistants[3]?.pubkey),
  ];
  const others = othersOf(assistants);
  if (!taPubkey || others.length === 0) return <>{children}</>;

  const siteOf = (pubkey: string) => sites[assistants.findIndex((a) => a.pubkey === pubkey)] ?? null;
  const name = (pubkey: string) => nameOf(pubkey, profiles);

  return (
    <section className="space-y-5" data-testid="your-assistants">
      <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100" data-testid="your-assistants-summary">
        {dutiesSummary(assistants, siteOf, name)}
      </p>
      {children}
      <div className="space-y-3" data-testid="also-working-for-you">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Also working for you</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((a) => (
            <AssistantCard key={a.pubkey} assistant={a} site={siteOf(a.pubkey)} profiles={profiles} />
          ))}
        </div>
        <Link
          href="/settings?tab=assistants&view=map"
          className="inline-block text-xs font-medium text-brand-link hover:underline"
          data-testid="your-assistants-change"
        >
          Change who does what in your Treasure Map →
        </Link>
      </div>
    </section>
  );
}

function AssistantCard({
  assistant,
  site,
  profiles,
}: {
  assistant: AssistantDuties;
  site: string | null;
  profiles: Profiles;
}) {
  const picture = profiles.get(assistant.pubkey)?.picture;
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={`assistant-card-${assistant.pubkey.slice(0, 8)}`}>
      <div className="flex items-center gap-3">
        {picture ? (
          <img src={picture} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <Bot className="h-5 w-5 text-slate-400" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {nameOf(assistant.pubkey, profiles)}
          </p>
          {assistant.here ? (
            <Chip tone="success" size="sm">
              This site
            </Chip>
          ) : site ? (
            <Chip tone="amber" size="sm">
              {site}
            </Chip>
          ) : (
            <Chip tone="slate" size="sm">
              Unverified
            </Chip>
          )}
        </div>
      </div>
      {/* Only its own site holds its key: change it there — and only at a site its NIP-05 proves. */}
      {!assistant.here && site && (
        <a
          href={`https://${site}/settings?tab=assistants&view=yours`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-link hover:underline"
          data-testid="assistant-open-site"
        >
          Open on {site} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {assistant.categories.length ? (
        <div className="flex flex-wrap gap-1.5">
          {assistant.categories.map((c) => (
            <Chip key={c} tone="brand" size="sm">
              {LABEL[c]}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Holds nothing on your Treasure Map yet.</p>
      )}
    </Card>
  );
}
