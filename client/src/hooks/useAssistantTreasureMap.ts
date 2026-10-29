import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { verifyEvent, type NostrEvent } from "nostr-tools";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import {
  readSelfEntries,
  SELF_MAP_KIND,
  selfMapStatus,
  writerRelays,
  type DutyLine,
  type SelfEntry,
  type SelfMapStatus,
} from "@/lib/assistantTreasureMap";
import { eventStore } from "@/lib/eventStore";
import { requestNewestWithReach } from "@/lib/relayRequest";
import { dedupeRelays } from "@/lib/relayRouting";
import { apiClient, TreasureMapUnavailableError, type TreasureMapPublishResult } from "@/services/api";
import { fetchEventsByFilter, getNip85RelayUrl } from "@/services/nostr";

const READ_MS = 8000;
const NONE: never[] = [];

/** Unconfigured is "no scores relay to ask", not a crash in render. */
function scoresRelay(): string {
  try {
    return getNip85RelayUrl();
  } catch {
    return "";
  }
}

export interface AssistantTreasureMap {
  /** The server keeps Assistants' Treasure Maps: true once it has answered the check, false when it has no route. */
  supported: boolean | undefined;
  /** The reader's Brainstorm Assistant, as the server names it. */
  assistant: string | null;
  /** The remembered choice: list the live duties, or none. */
  on: boolean;
  /** The duties the reader's Map gives the Assistant, and which are live. */
  duties: DutyLine[];
  /** What the Assistant's Treasure Map should list now. */
  shouldSay: SelfEntry[];
  /** The newest version found, when there is one. */
  published: NostrEvent | null;
  /** Its self-entries. */
  found: SelfEntry[];
  /** The found self-entries against `shouldSay`; null while either is still being read. */
  status: SelfMapStatus | null;
  /** The relays have answered, so "missing" or "out of date" is known rather than not-yet-loaded. */
  settled: boolean;
  /**
   * Relays a press reads that answered without the newest version found: a
   * press sends it there unchanged. Empty until they have answered.
   */
  missed: string[];
  /** The server couldn't answer the check, for a reason other than having no route. */
  error: Error | null;
  /** Turn on or Update now (`true`), or Turn off (`false`). */
  set: (on: boolean) => Promise<TreasureMapPublishResult>;
  publishing: boolean;
}

/**
 * The reader's Brainstorm Assistant's own Treasure Map, for Account Setup's
 * step and its page (/setup/treasure-map): what it should list, the version
 * it has published, and a way to have the server list its live duties or none
 * (docs/assistant/TREASURE-MAP-ASK.md).
 *
 * What it should list is the server's word, `GET /user/assistantTreasureMap`.
 * A server without the route answers 404 and `supported` is false, so the step
 * stays hidden. The published version is read into the EventStore (ADR 0005)
 * from the relays the server names. A press adds the server's signed version
 * there once it verifies, and asks for the check again, since the choice and
 * what is live can both have moved.
 *
 * Whether each relay a press reads holds that version is a relay probe (ADR
 * 0005): the store, holding copies from anywhere, can't say. A relay that
 * answers without it is where a press sends it (brainstorm_server `_missing`);
 * one that doesn't answer is left alone, as the press leaves it.
 */
export function useAssistantTreasureMap(pubkey: string | null | undefined): AssistantTreasureMap {
  const queryClient = useQueryClient();
  const queryKey = ["assistant-treasure-map", pubkey];
  const checkQuery = useQuery({
    queryKey,
    queryFn: () => apiClient.getAssistantTreasureMap(),
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: (failures, err) => !(err instanceof TreasureMapUnavailableError) && failures < 1,
  });
  const unsupported = checkQuery.error instanceof TreasureMapUnavailableError;
  const check = checkQuery.data;
  const assistant = check?.assistant ?? null;
  const relays = useMemo(
    () =>
      dedupeRelays([
        ...(check?.relays ?? []),
        ...(check?.shouldSay ?? []).map((e) => e.relay),
        ...(check?.duties ?? []).flatMap((d) => (d.relay ? [d.relay] : [])),
      ]),
    [check],
  );

  const read = useStoreReplaceable(SELF_MAP_KIND, assistant, async () => {
    if (!assistant || relays.length === 0) return;
    await fetchEventsByFilter({ kinds: [SELF_MAP_KIND], authors: [assistant] }, relays, READ_MS);
  });
  const published = read.event ?? null;
  const found = useMemo(() => readSelfEntries(published, assistant), [published, assistant]);
  const shouldSay = check?.shouldSay ?? NONE;
  const status = assistant && (published || read.settled) ? selfMapStatus(shouldSay, published, assistant) : null;

  const writer = useMemo(() => (check ? writerRelays(check, scoresRelay()) : NONE), [check]);
  // Asked once the read has settled, so a version still arriving isn't taken for the newest.
  const newestId = read.settled ? published?.id : undefined;
  const probe = useQuery({
    queryKey: ["assistant-treasure-map-missed", assistant, newestId, writer],
    queryFn: async () => {
      const answers = await Promise.all(
        writer.map((relay) =>
          // eslint-disable-next-line no-restricted-syntax -- relay probe: does this relay hold the newest version now?
          requestNewestWithReach([relay], { ids: [newestId!] }, READ_MS),
        ),
      );
      return writer.filter((_, i) => answers[i].reach.answered.length > 0 && answers[i].newest?.id !== newestId);
    },
    enabled: !!assistant && !!newestId && writer.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: 0,
  });

  const mutation = useMutation({
    mutationFn: async (on: boolean) => {
      const result = await apiClient.setAssistantTreasureMap(on);
      const event = result?.event;
      if (event && event.kind === SELF_MAP_KIND && event.pubkey === assistant && verifyEvent(event)) {
        eventStore.add(event);
      }
      return result;
    },
    // A repair sends the version already found, so only asking the relays again shows it landed.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["assistant-treasure-map-missed", assistant] }),
      ]),
  });

  return {
    supported: checkQuery.isSuccess ? true : unsupported ? false : undefined,
    assistant,
    on: check?.on ?? false,
    duties: check?.duties ?? NONE,
    shouldSay,
    published,
    found,
    status,
    settled: read.settled,
    missed: probe.data ?? NONE,
    error: checkQuery.error && !unsupported ? checkQuery.error : null,
    set: mutation.mutateAsync,
    publishing: mutation.isPending,
  };
}
