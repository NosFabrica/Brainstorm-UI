import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { verifyEvent, type NostrEvent } from "nostr-tools";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import {
  missedRelays,
  readSelfEntries,
  SELF_MAP_KIND,
  selfMapStatus,
  writerRelays,
  type DutyLine,
  type SelfEntry,
  type SelfMapStatus,
  type TreasureMapCheck,
} from "@/lib/assistantTreasureMap";
import { eventStore } from "@/lib/eventStore";
import { requestNewestWithReach } from "@/lib/relayRequest";
import { dedupeRelays } from "@/lib/relayRouting";
import {
  apiClient,
  AssistantRouteError,
  TreasureMapUnavailableError,
  type TreasureMapPublishResult,
} from "@/services/api";
import { fetchEventsByFilter, getNip85RelayUrl } from "@/services/nostr";

const READ_MS = 8000;
/** A press gives up on a relay's read after this long (brainstorm_server step 2), and so does the probe. */
const PROBE_MS = 5000;
/** A probe's answer stands this long before the page asks again; a press asks again at once. */
const PROBE_STALE_MS = 60_000;
const PROBE = "assistant-treasure-map-missed";
const NONE: never[] = [];

/** A 4xx won't change by asking again: the 422 needs the reader's Map edited first. */
const refused = (err: unknown) => err instanceof AssistantRouteError && err.status >= 400 && err.status < 500;

/**
 * A failed check the POST's Turn off gets past (TREASURE-MAP-ASK.md, its step
 * 1): the GET's own 502s, for the reader's Map or follow count, and its 422,
 * for too many keys. Anything else, a request that got no answer included,
 * would fail the POST too.
 */
const passable = (err: Error | null) =>
  err instanceof AssistantRouteError && err.said && (err.status === 502 || err.status === 422);

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
   * Relays a press reads that answered without the newest version, while a
   * press would otherwise sign nothing: it sends that version there
   * unchanged. Asked only where the caller wants it (`probeRelays`); empty
   * while they're being asked.
   */
  missed: string[];
  /** Those relays are being asked, so whether one missed it isn't known yet. */
  checkingRelays: boolean;
  /** The server couldn't answer the check, for a reason other than having no route; kept while it's asked again. */
  error: Error | null;
  /** That failure is one a Turn off gets past: the GET's own 502s and its 422. */
  offUnchecked: boolean;
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
 * what is live can both have moved. A check that fails keeps its failure
 * while it's asked again, so a Turn off made past it (`offUnchecked`) keeps
 * its place on the page.
 *
 * Which relays hold the newest version is a relay probe (ADR 0005), asked only
 * where the caller wants it (`probeRelays`, the page): the store, holding
 * copies from anywhere, can't say. It's asked while a press would otherwise
 * sign nothing, of the relays a press reads that the check tells apart
 * (`writerRelays`: the relays `shouldSay` names, and the scores relay). Each
 * gives its own newest version, as the press reads it. One that answered
 * without the newest known, theirs or the store's, is where a press sends it
 * (`missedRelays`, brainstorm_server `_missing`); one that doesn't answer is
 * left alone, as the press leaves it.
 */
export function useAssistantTreasureMap(
  pubkey: string | null | undefined,
  { probeRelays = false }: { probeRelays?: boolean } = {},
): AssistantTreasureMap {
  const queryClient = useQueryClient();
  const queryKey = ["assistant-treasure-map", pubkey];
  const checkQuery = useQuery({
    queryKey,
    queryFn: () => apiClient.getAssistantTreasureMap(),
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: (failures, err) => !(err instanceof TreasureMapUnavailableError) && !refused(err) && failures < 1,
  });
  // Asked again, a check that never loaded goes back to pending (react-query
  // resets a query without data), which would swap the failure, its Turn off
  // and the press's report for "Asking…". So a failure stands until an answer.
  const [lastFailure, setLastFailure] = useState<{ pubkey: typeof pubkey; error: Error } | null>(null);
  useEffect(() => {
    if (checkQuery.error) setLastFailure({ pubkey, error: checkQuery.error });
    else if (checkQuery.isSuccess) setLastFailure(null);
  }, [checkQuery.error, checkQuery.isSuccess, pubkey]);
  const failure =
    checkQuery.error ??
    (checkQuery.isFetching && lastFailure && lastFailure.pubkey === pubkey ? lastFailure.error : null);
  const unsupported = failure instanceof TreasureMapUnavailableError;
  const error = failure && !unsupported ? failure : null;
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
  // A relay's answer changes a button only while a press would otherwise sign nothing: one that signs sends to them all.
  const repairOnly = probeRelays && status !== null && (check?.on ? status === "current" : found.length === 0);
  const probe = useQuery({
    queryKey: [PROBE, assistant, writer],
    queryFn: async () => {
      const answers = await Promise.all(
        writer.map((relay) =>
          // eslint-disable-next-line no-restricted-syntax -- relay probe: what does each writer relay hold now?
          requestNewestWithReach([relay], { kinds: [SELF_MAP_KIND], authors: [assistant!], limit: 1 }, PROBE_MS),
        ),
      );
      return writer.map((relay, i) => ({
        relay,
        answered: answers[i].reach.answered.length > 0,
        newest: answers[i].newest,
      }));
    },
    enabled: repairOnly && writer.length > 0,
    staleTime: PROBE_STALE_MS,
  });
  const asking = repairOnly && probe.isFetching;
  const missed = useMemo(
    () => (repairOnly && !asking && probe.data ? missedRelays(probe.data, published) : NONE),
    [repairOnly, asking, probe.data, published],
  );

  const mutation = useMutation({
    mutationFn: async (on: boolean) => {
      const result = await apiClient.setAssistantTreasureMap(on);
      const event = result?.event;
      // Before any check has loaded, as for a Turn off past a failed one, the
      // Assistant isn't known here: the server's version, verified, is its own.
      const ours = assistant === null || event?.pubkey === assistant;
      if (event && event.kind === SELF_MAP_KIND && ours && verifyEvent(event)) eventStore.add(event);
      // The server remembers the choice once a press succeeds: shown before the check is back.
      if (typeof result?.on === "boolean") {
        queryClient.setQueryData<TreasureMapCheck>(queryKey, (c) => (c ? { ...c, on: result.on } : c));
      }
      return result;
    },
    onSettled: () => {
      // A repair adds no new version, so only asking the relays again shows it landed. The answer doesn't wait for them.
      void queryClient.invalidateQueries({ queryKey: [PROBE, assistant] });
      // The choice and what is live can both have moved. Awaited only while the
      // check stands, so the answer shows beside the new state: a failing
      // check's re-read can take as long again.
      const recheck = queryClient.invalidateQueries({ queryKey });
      return queryClient.getQueryState(queryKey)?.status === "success" ? recheck : undefined;
    },
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
    missed,
    checkingRelays: asking,
    error,
    offUnchecked: passable(error),
    set: mutation.mutateAsync,
    publishing: mutation.isPending,
  };
}
