/**
 * What `/p/:id` asks the Brainstorm API for on arrival, so a hover or a click
 * that leads there can start it early.
 *
 * Exactly the entries SharePage reads (services/queries/userReads): a prefetch
 * under any other key is a request the page then makes again. The old hover
 * prefetch warmed `GET /user/{pk}` — a heavy record nothing on the page reads.
 */
import type { QueryClient } from "@tanstack/react-query";
import { influenceOptions, statsOptions, topFollowersOptions } from "@/services/queries/userReads";

export function prefetchSharePage(queryClient: QueryClient, pubkey: string): void {
  if (!pubkey) return;
  // Signed out, the first two are one entry, and prefetchQuery asks for it once.
  // The house one fills the Trust signals memo the page's ring reads.
  const done = () => undefined;
  void queryClient.prefetchQuery(influenceOptions(pubkey, "viewer")).catch(done);
  void queryClient.prefetchQuery(influenceOptions(pubkey, "house")).catch(done);
  void queryClient.prefetchQuery(statsOptions(pubkey, "house")).catch(done);
  void queryClient.prefetchQuery(topFollowersOptions(pubkey, "house")).catch(done);
}

/**
 * Hover means intent only with a mouse: on touch the hover events fire on the
 * tap itself, beside the click, so prefetching there only doubles the work.
 */
export function finePointer(): boolean {
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return true;
  }
}
