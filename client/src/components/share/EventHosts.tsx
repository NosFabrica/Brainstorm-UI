import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

type Profile = { name?: string; display_name?: string; picture?: string };

/** Names after which the rest are a count. A co-hosted event mirrored from feeds rarely has more. */
const NAMED = 3;

const npubOf = (pk: string): string => {
  try {
    return nip19.npubEncode(pk);
  } catch {
    return "";
  }
};

/**
 * "By AI Builders and Venice Tech": the event's hosts (lib/eventHosts), ringed,
 * each name a link to its profile. One host reads as before, the whole line one
 * link. More than three: the first three by name, then "and N more".
 */
export function EventHosts({
  hosts,
  profiles,
  ringOf,
}: {
  hosts: string[];
  profiles: Map<string, Profile>;
  /** The trust ring class for a key, or "" for none. */
  ringOf: (pk: string) => string;
}) {
  const named = hosts.filter((pk) => npubOf(pk)).slice(0, NAMED);
  if (named.length === 0) return null;
  const more = hosts.length - named.length;
  const nameOf = (pk: string) => {
    const p = profiles.get(pk);
    return p?.display_name || p?.name || `${npubOf(pk).slice(0, 12)}…`;
  };
  const faces = (
    <span className="flex shrink-0 -space-x-1.5">
      {named.map((pk) => {
        const p = profiles.get(pk);
        return (
          <Avatar key={pk} className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${ringOf(pk)}`}>
            {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
        );
      })}
    </span>
  );
  const name = (pk: string) => <span className="font-medium text-slate-900 dark:text-slate-100">{nameOf(pk)}</span>;

  if (named.length === 1 && more === 0) {
    return (
      <Link
        href={`/p/${npubOf(named[0])}`}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
        data-testid="event-hero-host"
      >
        {faces}
        <span className="text-sm text-slate-600 dark:text-slate-300">By {name(named[0])}</span>
      </Link>
    );
  }

  return (
    <div className="mt-1 inline-flex items-center gap-1.5 py-0.5 pr-1.5" data-testid="event-hero-host">
      {faces}
      <span className="text-sm text-slate-600 dark:text-slate-300">
        By{" "}
        {named.map((pk, i) => (
          <span key={pk}>
            {i > 0 && (i === named.length - 1 && more === 0 ? " and " : ", ")}
            <Link href={`/p/${npubOf(pk)}`} className="rounded hover:underline" data-testid={`event-hero-host-${pk}`}>
              {name(pk)}
            </Link>
          </span>
        ))}
        {more > 0 && ` and ${more} more`}
      </span>
    </div>
  );
}
