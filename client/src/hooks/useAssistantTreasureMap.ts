import { useMemo, useState } from "react";
import {
  isCancelledError,
  skipToken,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type Query,
  type QueryCache,
} from "@tanstack/react-query";
import { verifyEvent, type NostrEvent } from "nostr-tools";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import {
  missedRelays,
  readSelfEntries,
  SELF_MAP_KIND,
  selfMapStatus,
  type DutyLine,
  type RelayHolding,
  type SelfEntry,
  type SelfMapStatus,
} from "@/lib/assistantTreasureMap";
import { eventStore } from "@/lib/eventStore";
import { requestHeld } from "@/lib/relayRequest";
import { dedupeRelays } from "@/lib/relayRouting";
import {
  apiClient,
  AssistantRouteError,
  TreasureMapUnavailableError,
  type TreasureMapPublishResult,
} from "@/services/api";
import { fetchEventsByFilter } from "@/services/nostr";

const READ_MS = 8000;
/** A press gives up on a relay's read after this long (brainstorm_server step 2), and so does the probe. */
const PROBE_MS = 5000;
/** A relay's answer stands this long before the page asks it again; a press outdates it at once. */
const PROBE_STALE_MS = 60_000;
const CHECK = "assistant-treasure-map";
const CHOICE = "assistant-treasure-map-choice";
const PROBE = "assistant-treasure-map-held";
const NONE: never[] = [];

/**
 * A press's answered choice, and how many answers the check had then (its
 * `dataUpdateCount`, once any GET already out was dropped): it stands until
 * the check is answered again, by a GET asked after the press.
 */
interface Pressed {
  on: boolean;
  count: number;
}

/**
 * Each check's last failure, kept with its query until an answer arrives.
 * Asked again, a check that never loaded goes back to pending, error and all
 * (query-core's fetchState), so the query alone would hide the failure from
 * every instance for the whole re-ask: /setup's row, and the page's error and
 * Turn off. The cache keeps it, so every instance reads the same one, whether
 * it mounted before the failure, after it, or while nothing was mounted. A
 * cancel isn't a failure, and an answer clears it (nothing else writes the
 * check: a press keeps its choice beside it).
 */
const lastFailures = new WeakMap<Query, Error>();
const watched = new WeakSet<QueryCache>();
function keepFailures(cache: QueryCache): void {
  if (watched.has(cache)) return;
  watched.add(cache);
  cache.subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== CHECK) return;
    const { action } = event;
    if (action.type === "error" && !isCancelledError(action.error)) lastFailures.set(event.query, action.error);
    else if (action.type === "success") lastFailures.delete(event.query);
  });
}

/** What a relay holds, as the press reads it: the Assistant's own kind 10040, verified (brainstorm_server `is_own`). */
const ownMap = (assistant: string) => (event: NostrEvent) =>
  event.kind === SELF_MAP_KIND && event.pubkey?.toLowerCase() === assistant && verifyEvent(event);

/** A 4xx won't change by asking again: the 422 needs the reader's Map edited first. */
const refused = (err: unknown) => err instanceof AssistantRouteError && err.status >= 400 && err.status < 500;

/**
 * A failed check the POST's Turn off gets past (TREASURE-MAP-ASK.md, its step
 * 1): the GET's own 502s, for the reader's Map or follow count, and its 422,
 * for too many keys. Turn off reads neither, so it never meets them. Any other
 * failure can't be told from one that fails Turn off too: a bare 500 from the
 * scheduling reads, which Turn off doesn't make, looks like one from reading
 * the Assistant, which it does, and a request that got no answer says nothing.
 */
const passable = (err: Error | null) =>
  err instanceof AssistantRouteError && err.said && (err.status === 502 || err.status === 422);

export interface AssistantTreasureMap {
  /**
   * The server keeps Assistants' Treasure Maps: true once it has answered a
   * check, kept while a re-check fails; false when it has no route.
   */
  supported: boolean | undefined;
  /** The reader's Brainstorm Assistant, as the server names it. */
  assistant: string | null;
  /** The remembered choice: list the live duties, or none. A press's shows once it answers, until a check asked after it is back. */
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
   * Relays a press reads (the check's `writerRelays`) that it would send a
   * version to, while it would otherwise sign nothing: the newest, unchanged,
   * to one that answered without it, or a new one to them all when what they
   * hold isn't what it should list. Asked only where the caller wants it
   * (`probeRelays`); each relay counts once it has answered. While a press is
   * under way, those its button was offered for; after it, none until a check
   * asked after it is in.
   */
  missed: string[];
  /** Some of those relays are still being asked, so more of them may yet be named. */
  checkingRelays: boolean;
  /** The server couldn't answer the check, for a reason other than having no route; kept, for every instance, while it's asked again. */
  error: Error | null;
  /** That failure is one a Turn off gets past (the GET's own 502s and its 422), and no Turn off has answered since. */
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
 * from the relays the server names. A check that fails keeps its failure, for
 * every instance, until an answer arrives, so a Turn off made past it
 * (`offUnchecked`) keeps its place on the page. It's asked again where the
 * step is shown, as that opens (`askAgain`), and by a press; elsewhere a mount
 * reads it as it stands.
 *
 * A press adds the server's signed version to the store once it verifies, and
 * asks for the check again, since the choice and what is live can both have
 * moved: a GET already out was sent before the press, so it's dropped first.
 * The answer waits for that check only while the check stands, and a 4xx
 * isn't asked again unless a Turn on or Update now got through (it read the
 * Map). The press's choice is kept beside the check, not written into it (that
 * would read as a fresh answer), and shows once the press has answered, until
 * a check asked after it is back.
 *
 * Which relays hold the newest version is a relay probe (ADR 0005), asked only
 * where the caller wants it (`probeRelays`, the page): the store, holding
 * copies from anywhere, can't say. It's asked while a press would otherwise
 * sign nothing, about a version found, of exactly the relays that press reads:
 * the check's `writerRelays`, so only from a check no press has outdated,
 * since a press can change which relays those are. Each relay's own newest
 * version, the Assistant's own and verified, is set against what the press
 * would list, as the press does (`missedRelays`); the store's copy isn't. One
 * that doesn't answer isn't named: the press leaves it alone unless it signs
 * anew, and a check without `writerRelays` (a server from before the field)
 * asks none.
 */
export function useAssistantTreasureMap(
  pubkey: string | null | undefined,
  { probeRelays = false, askAgain = false }: { probeRelays?: boolean; askAgain?: boolean } = {},
): AssistantTreasureMap {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  keepFailures(cache);
  const queryKey = [CHECK, pubkey];
  const checkQuery = useQuery({
    queryKey,
    queryFn: () => apiClient.getAssistantTreasureMap(),
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: (failures, err) => !(err instanceof TreasureMapUnavailableError) && !refused(err) && failures < 1,
    // A failing check is asked again where its step is shown, as that opens
    // (`askAgain`: /setup and its page). Elsewhere (every page's header, the
    // account menu, the dashboard card) a mount reads the failure the cache
    // has: asked there, a lasting 422 would cost a read of the reader's Map per
    // page view, and a 502 two GETs.
    retryOnMount: askAgain,
    refetchOnMount: askAgain || ((query) => query.state.status !== "error"),
  });
  // Asked again, a check that never loaded goes back to pending, which would
  // swap the failure, its Turn off and the press's report for "Asking…": its
  // last failure stands until an answer (`lastFailures`).
  const query = cache.find({ queryKey, exact: true });
  const failure = checkQuery.error ?? (checkQuery.isFetching && query ? (lastFailures.get(query) ?? null) : null);
  const unsupported = failure instanceof TreasureMapUnavailableError;
  const error = failure && !unsupported ? failure : null;
  const check = checkQuery.data;
  const checkState = queryClient.getQueryState(queryKey);
  // Shared by every instance (the page, /setup's, the header's), outside the
  // check so its status and error stay the server's.
  const pressed = useQuery<Pressed>({ queryKey: [CHOICE, pubkey], queryFn: skipToken }).data;
  const choice = pressed && (checkState?.dataUpdateCount ?? 0) === pressed.count ? pressed : null;
  const on = choice ? choice.on : (check?.on ?? false);
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

  // What the relays had missed when a press was made stands while it's under
  // way, so the buttons it was made from keep their place (its choice shows
  // only once it has answered). Taken where the press is made: the mutation's
  // own callbacks see the render that has it under way.
  const [missedAtPress, setMissedAtPress] = useState<string[]>(NONE);
  const mutation = useMutation({
    mutationFn: async (choose: boolean) => {
      const result = await apiClient.setAssistantTreasureMap(choose);
      const event = result?.event;
      // Before any check has loaded, as for a Turn off past a failed one, the
      // Assistant isn't known here: the server's version, verified, is its own.
      const ours = assistant === null || event?.pubkey === assistant;
      if (event && event.kind === SELF_MAP_KIND && ours && verifyEvent(event)) eventStore.add(event);
      return result;
    },
    onSettled: async (result, err, choose) => {
      // The check is failing while a failure is kept: a press's answer isn't a check.
      const entry = cache.find({ queryKey, exact: true });
      const kept = entry ? lastFailures.get(entry) : undefined;
      // A GET already out was sent before the press and can carry the old
      // choice; with nothing cached, asking again would join it. So it's
      // dropped first (at once, back to what the check was), and any answer
      // the check gets from here on was asked after the press answered.
      void queryClient.cancelQueries({ queryKey, exact: true });
      const count = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0;
      // The choice and what is live can both have moved. A 4xx stands until the
      // reader's Map changes, which only a Turn on or Update now that got through shows.
      if (!refused(kept) || (choose && !err)) {
        const recheck = queryClient.invalidateQueries({ queryKey, exact: true });
        // Awaited only while the check stands, so the answer shows beside the
        // new state: a failing check's re-read can take as long again.
        if (!kept) await recheck;
      }
      // The server remembers the choice once a press succeeds.
      if (typeof result?.on === "boolean") {
        queryClient.setQueryData<Pressed>([CHOICE, pubkey], { on: result.on, count });
      }
    },
  });

  // The relays a press reads are the check's, for its choice, so they're asked
  // only from a check no press has outdated: not while one is under way, nor
  // while its choice stands, nor until a check asked again is in. Read from
  // the cache: react-query clears an invalidation only when a fetch succeeds.
  // Each answer is for one check (`round`): asked again, the check is a new probe.
  const checkStands = !!check && !mutation.isPending && choice === null && checkState?.isInvalidated === false;
  const round = checkState?.dataUpdateCount ?? 0;
  const writer = check?.writerRelays ?? NONE;
  // A relay's answer changes a button only while a press would otherwise sign
  // nothing (one that signs sends to them all), and only about a version
  // found: with none, a press has nothing to send.
  const probing =
    probeRelays &&
    checkStands &&
    writer.length > 0 &&
    published !== null &&
    (check?.on ? status === "current" : found.length === 0);
  const asked = probing ? writer : NONE;
  // One query per relay, so each counts as it answers and one that never does
  // holds up only itself.
  const holdings = useQueries({
    queries: useMemo(
      () =>
        asked.map((relay) => ({
          queryKey: [PROBE, assistant, round, relay],
          queryFn: async (): Promise<RelayHolding> => {
            const own = { kinds: [SELF_MAP_KIND], authors: [assistant!], limit: 1 };
            // eslint-disable-next-line no-restricted-syntax -- relay probe: what does this writer relay hold now?
            const { held, reach } = await requestHeld([relay], own, PROBE_MS, ownMap(assistant!));
            return { relay, answered: reach.answered.length > 0, newest: held };
          },
          staleTime: PROBE_STALE_MS,
        })),
      [asked, assistant, round],
    ),
  });
  // A later answer can only add a relay, never take one back, so each counts
  // once it's in. One being asked again (after its minute, or the app's
  // resume) counts once it's back.
  const answers = holdings.flatMap((q) => (q.data && q.fetchStatus === "idle" ? [q.data] : []));
  const checkingRelays = holdings.some((q) => q.isPending || q.fetchStatus !== "idle");
  const target = check?.on ? shouldSay : NONE;
  const missed: string[] = probing ? missedRelays(answers, target, assistant) : NONE;

  return {
    supported: unsupported ? false : check ? true : undefined,
    assistant,
    on,
    duties: check?.duties ?? NONE,
    shouldSay,
    published,
    found,
    status,
    settled: read.settled,
    missed: mutation.isPending ? missedAtPress : missed,
    checkingRelays,
    error,
    // After a Turn off, nothing it could take off is left.
    offUnchecked: passable(error) && choice?.on !== false,
    set: (choose) => {
      setMissedAtPress(missed);
      return mutation.mutateAsync(choose);
    },
    publishing: mutation.isPending,
  };
}
