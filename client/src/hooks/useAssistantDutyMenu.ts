import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { verifyEvent, type NostrEvent } from "nostr-tools";
import { tagRelays } from "@/config/tagging";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import {
  DUTY_MENU_D,
  DUTY_MENU_KIND,
  isDutyMenu,
  menuRows,
  menuStatus,
  offerRows,
  type MenuRow,
  type MenuStatus,
} from "@/lib/dutyMenu";
import { eventStore } from "@/lib/eventStore";
import { dedupeRelays } from "@/lib/relayRouting";
import { apiClient, DutyMenuUnavailableError, type DutyMenuPublishResult } from "@/services/api";
import { fetchEventsByFilter } from "@/services/nostr";

const READ_MS = 8000;

export interface AssistantDutyMenu {
  /** The server can publish Duty Menus: true once it has said what it offers, false when it has no route. */
  supported: boolean | undefined;
  /** The reader's Brainstorm Assistant, as the server names it. */
  assistant: string | null;
  /** What the server offers for it now: the rows its menu should list. */
  offer: MenuRow[];
  /** The menu it has published, when one was found. */
  published: NostrEvent | null;
  publishedRows: MenuRow[];
  /** The published menu against the offer; null while either is still being read. */
  status: MenuStatus | null;
  /** The relays have answered, so "missing" or "out of date" is known rather than not-yet-loaded. */
  settled: boolean;
  /** The server couldn't say what it offers, for a reason other than having no route. */
  error: Error | null;
  publish: () => Promise<DutyMenuPublishResult>;
  publishing: boolean;
}

/**
 * The reader's Brainstorm Assistant's Duty Menu, for Account Setup's step and
 * its page (/setup/duty-menu): what the server offers it, the menu it has
 * published, and a way to have the server publish it
 * (docs/assistant/DUTY-MENU-ASK.md).
 *
 * The offer is the server's word, `GET /user/assistantDutyMenu`. A server
 * without the route answers 404 and `supported` is false, so the step stays
 * hidden. The published menu is read into the EventStore (ADR 0005) from the
 * offer's relays and the tag hub. A publish adds the server's signed event
 * there once it verifies, so the step turns done at once.
 */
export function useAssistantDutyMenu(pubkey: string | null | undefined): AssistantDutyMenu {
  const offerQuery = useQuery({
    queryKey: ["assistant-duty-menu-offer", pubkey],
    queryFn: () => apiClient.getAssistantDutyMenu(),
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    retry: (failures, err) => !(err instanceof DutyMenuUnavailableError) && failures < 1,
  });
  const unsupported = offerQuery.error instanceof DutyMenuUnavailableError;
  const assistant = offerQuery.data?.assistant?.toLowerCase() ?? null;
  const offer = useMemo(() => offerRows(offerQuery.data?.rows), [offerQuery.data]);
  const relays = useMemo(
    () => dedupeRelays([...offer.flatMap((r) => (r.relay ? [r.relay] : [])), ...tagRelays()]),
    [offer],
  );

  const read = useStoreReplaceable(
    DUTY_MENU_KIND,
    assistant,
    async () => {
      if (!assistant) return;
      await fetchEventsByFilter(
        { kinds: [DUTY_MENU_KIND], authors: [assistant], "#d": [DUTY_MENU_D] },
        relays,
        READ_MS,
      );
    },
    { identifier: DUTY_MENU_D },
  );
  // The newest event at the address speaks: if it isn't a menu, the Assistant has none (§ 8.1).
  const published = read.event && isDutyMenu(read.event, assistant) ? read.event : null;
  const publishedRows = useMemo(() => menuRows(published), [published]);
  const status = assistant && (read.event || read.settled) ? menuStatus(offer, read.event, assistant) : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.publishAssistantDutyMenu();
      if (result?.event && verifyEvent(result.event) && isDutyMenu(result.event, assistant)) {
        eventStore.add(result.event);
      }
      return result;
    },
  });

  return {
    supported: offerQuery.isSuccess ? true : unsupported ? false : undefined,
    assistant,
    offer,
    published,
    publishedRows,
    status,
    settled: read.settled,
    error: offerQuery.error && !unsupported ? offerQuery.error : null,
    publish: mutation.mutateAsync,
    publishing: mutation.isPending,
  };
}
