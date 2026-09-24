import { useMemo } from "react";
import { Redirect, useRoute } from "wouter";
import { nip19 } from "nostr-tools";
import { EventScreen, decodeEventId, type EventPointer } from "@/components/share/EventScreen";
import { AddressScreen } from "@/components/share/AddressScreen";
import { decodeNaddr, type AddressPointer } from "@/components/share/ArticleScreen";

/**
 * `/e/<id>` — every event, however it is named. The id says which version:
 * a `note`/`nevent` (or hex id) is one exact event, an `naddr` whatever its
 * author last published there. The event's kind then picks the layout
 * (EventScreen). A profile's id goes to `/p/`.
 */
type Target = { type: "address"; ptr: AddressPointer } | { type: "profile" } | { type: "event"; ptr: EventPointer | null };

export default function EventPage() {
  const [, params] = useRoute("/e/:id");
  const raw = (params?.id || "").replace(/^nostr:/, "");
  const target = useMemo((): Target => {
    const address = decodeNaddr(raw);
    if (address) return { type: "address", ptr: address };
    if (isProfileId(raw)) return { type: "profile" };
    return { type: "event", ptr: decodeEventId(raw) };
  }, [raw]);
  if (target.type === "address") return <AddressScreen key={raw} naddr={raw} ptr={target.ptr} />;
  if (target.type === "profile") return <Redirect to={`/p/${raw}`} replace />;
  return <EventScreen ptr={target.ptr} />;
}

/** `/a/<naddr>`, the old address route: the same page now lives on `/e/`.
 *  Links already out there keep working, query and fragment included. */
export function AddressRedirect() {
  const [, params] = useRoute("/a/:id");
  return <Redirect to={`/e/${params?.id || ""}${window.location.search}${window.location.hash}`} replace />;
}

function isProfileId(raw: string): boolean {
  try {
    const t = nip19.decode(raw).type;
    return t === "npub" || t === "nprofile";
  } catch {
    return false;
  }
}
