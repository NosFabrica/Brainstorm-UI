import { useMemo } from "react";
import { useRoute } from "wouter";
import { EventScreen, decodeEventId } from "@/components/share/EventScreen";

/**
 * `/e/<nevent|note|hex>` — one exact event, by id. How it reads is the
 * event's kind's business (EventScreen): an article version reads as an
 * article here, on this URL.
 */
export default function EventPage() {
  const [, params] = useRoute("/e/:id");
  const raw = (params?.id || "").replace(/^nostr:/, "");
  const ptr = useMemo(() => decodeEventId(raw), [raw]);
  return <EventScreen ptr={ptr} />;
}
