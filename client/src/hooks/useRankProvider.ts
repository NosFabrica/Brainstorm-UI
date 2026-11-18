import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { rankProviderOf } from "@/lib/nip85Declaration";
import { shortNpub } from "@/components/messages/people";

export interface RankProvider {
  pubkey: string;
  /** Its display name once its profile has loaded; its short npub until then. */
  name: string;
  /** The relay it publishes to, as a host: "scores.brainstorm.world". Empty when the row names none. */
  host: string;
}

/**
 * Who publishes the reader's scores today: the Assistant their Treasure Map
 * gives the rank duty to, by name. Null with no Map, no rank duty, or no
 * reader. So no page has to say "another provider" — it is often Brainstorm's
 * own Assistant on another deployment, and saying so is the whole point.
 */
export function useRankProvider(pubkey: string | null | undefined): RankProvider | null {
  const provider = rankProviderOf(useTrustProviderList(pubkey ?? null).event);
  const profile = useLiveProfile(provider?.pubkey).profile;
  if (!provider) return null;
  const name = (profile?.display_name || profile?.name || "").trim() || shortNpub(provider.pubkey);
  const host = provider.relay.replace(/^wss?:\/\//, "").replace(/\/+$/, "");
  return { pubkey: provider.pubkey, name, host };
}
