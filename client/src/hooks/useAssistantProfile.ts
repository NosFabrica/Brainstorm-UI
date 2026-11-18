import { useIsMutating, useMutation } from "@tanstack/react-query";
import { useBrainstormAssistant } from "@/hooks/useBrainstormAssistant";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useLastOutcome, type PublishOutcome } from "@/hooks/useLastOutcome";
import { ensureAssistantPublished } from "@/lib/assistantPublish";

/**
 * This deployment's Assistant as Account Setup reads it. The server makes its
 * key at sign-in (`ta_pubkey`); its profile (kind 0), which the server signs,
 * is what brings it to life. `live` is that profile found on relays or
 * published from this browser; `settled` is the relays having answered.
 *
 * `publish` puts out the default profile without following the Assistant —
 * following would change the user's own kind 3 (lib/assistantPublish). Keyed,
 * so every reader sees a publish another one started (components/AutoAssistantSetup).
 */
export function useAssistantProfile(pubkey: string | undefined): {
  taPubkey: string | null;
  settled: boolean;
  live: boolean;
  publish: () => Promise<unknown>;
  publishing: boolean;
  lastPublish: PublishOutcome | null;
} {
  const { taPubkey, published } = useBrainstormAssistant();
  const read = useLiveProfile(taPubkey ?? undefined);
  const live = !!published || (!!taPubkey && read.event?.pubkey === taPubkey);

  const mutationKey = ["assistant-profile-publish", pubkey];
  const mutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (!taPubkey) throw new Error("Your Brainstorm Assistant isn't ready yet.");
      return ensureAssistantPublished({ taPubkey, follow: false });
    },
  });

  return {
    taPubkey,
    settled: !!taPubkey && !read.loading,
    live,
    publish: mutation.mutateAsync,
    publishing: useIsMutating({ mutationKey }) > 0,
    lastPublish: useLastOutcome(mutationKey),
  };
}
