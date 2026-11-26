import { useQuery } from "@tanstack/react-query";
import { useCompromisedRing } from "@/hooks/useCompromised";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { lookupTrustSignals } from "@/services/trustSignals";
import { npubFromPubkey } from "@/lib/shareId";

type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string; website?: string };

/**
 * Who signed the event, as its page names them: their profile, their npub and
 * name, their trust score and the ring a Compromised author wears.
 */
export function useEventAuthor(authorPk: string, relays: string[]) {
  // The author's held profile at once; the event's own relay hints are asked
  // beside their outbox, and a newer profile replaces it as it lands.
  const authorProfile = useLiveProfile(authorPk || undefined, relays).profile;
  const compromisedRing = useCompromisedRing(authorPk || undefined);
  const trustQuery = useQuery({
    // The ring every author list draws (services/trustSignals): the house
    // overview's own influence, batched with the page's other authors and
    // asked once a session, instead of a whole overview for one number.
    queryKey: ["author-trust-signals", authorPk],
    queryFn: async () => (authorPk ? (await lookupTrustSignals(authorPk)).influence : null),
    enabled: !!authorPk,
  });

  const profile = (authorProfile ?? {}) as ProfileLite;
  const authorNpub = authorPk
    ? (() => {
        try {
          return npubFromPubkey(authorPk);
        } catch {
          return "";
        }
      })()
    : "";
  const authorName = profile.display_name || profile.name || (authorNpub ? authorNpub.slice(0, 12) + "…" : "Someone");
  const score01 = typeof trustQuery.data === "number" ? trustQuery.data : null;
  return { authorProfile, profile, compromisedRing, authorNpub, authorName, score01 };
}
