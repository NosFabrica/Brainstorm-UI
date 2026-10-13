import { Suspense, lazy, type ComponentProps } from "react";

// Plain `lazy`, not the route loader: a feed of notes need not load the poll
// card (its tally, its relay asks, its vote) until a poll is in it.
const PollCard = lazy(() => import("@/components/share/PollCard").then((m) => ({ default: m.PollCard })));

/** A poll's card (components/share/PollCard), fetched the first time a poll is shown. */
export function LazyPollCard(props: ComponentProps<typeof PollCard>) {
  return (
    <Suspense fallback={<div className="mt-3 h-10" aria-hidden="true" data-testid="poll-card-loading" />}>
      <PollCard {...props} />
    </Suspense>
  );
}
