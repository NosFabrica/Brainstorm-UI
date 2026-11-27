import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { npubFromPubkey } from "@/lib/shareId";
import type { LiveHostClaim } from "@/lib/liveStream";
import { nameIn } from "@/lib/displayName";

const npubOf = (pk: string): string => {
  try {
    return npubFromPubkey(pk);
  } catch {
    return "";
  }
};

/**
 * "Host: Alice" under a live event's, a space's or a meeting's byline, when the
 * host it names is not who signed it (NIP-53: platforms publish for their
 * streamers). The page stays the signer's: naming someone a host is the
 * signer's word, so it says "unconfirmed" until the host's own proof
 * (lib/liveStream `liveHostClaim`) says they agreed.
 */
export function LiveHostLine({ host, className }: { host: LiveHostClaim; className?: string }) {
  const { profile } = useLiveProfile(host.pubkey);
  const npub = npubOf(host.pubkey);
  if (!npub) return null;
  const name = nameIn(profile) || `${npub.slice(0, 12)}…`;
  return (
    <p
      className={`flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300 ${className ?? ""}`}
      data-testid="live-host"
    >
      <span>Host:</span>
      <Link href={`/p/${npub}`} className="font-semibold text-slate-900 hover:underline dark:text-slate-100">
        {name}
      </Link>
      {!host.confirmed && (
        <Chip
          tone="amber"
          size="sm"
          title="Named by whoever published this, without the host's signature that they agreed (NIP-53 proof)"
          data-testid="live-host-unconfirmed"
        >
          unconfirmed
        </Chip>
      )}
    </p>
  );
}
