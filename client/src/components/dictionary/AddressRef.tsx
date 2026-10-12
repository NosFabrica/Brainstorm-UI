/**
 * An `address` field's value as what it names (the provisional `address`
 * field type, docs/dictionary/dlist-presentation-conventions.md §2.2): the
 * event at that `kind:pubkey:d`, looked up and shown by its name — a list's
 * plural, an item's title or name, else its `d` — linking to its page. Until
 * it's found, or if it can't be, the address itself shows, still a link: the
 * page can look for it too.
 *
 * Read from the tag hub, where lists and their items live, into the
 * EventStore (ADR 0005).
 */
import { nip19 } from "nostr-tools";
import { Link } from "wouter";
import { dictionaryRelays } from "@/config/dictionary";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { headerNames, parseCoordinate } from "@/lib/dlistFields";
import { fetchAddressableEvents } from "@/services/nostr";

/** What an addressable event is called: a list by its plural, anything else by its title or name. */
function nameOf(ev: { kind: number; tags: string[][] }): string | null {
  const tag = (name: string) => ev.tags.find((t) => t[0] === name)?.[1]?.trim() || null;
  if (ev.kind === 39998) return headerNames(ev).plural || null;
  return tag("title") ?? tag("name") ?? tag("d");
}

export function AddressRef({ address }: { address: string }) {
  const c = parseCoordinate(address);
  const { event } = useStoreReplaceable(
    c?.kind ?? 0,
    c?.pubkey,
    () => (c ? fetchAddressableEvents([{ ...c, identifier: c.d }], dictionaryRelays()) : Promise.resolve(null)),
    { identifier: c?.d },
  );
  if (!c) return <span className="break-all font-mono text-xs">{address}</span>;
  const href = `/e/${nip19.naddrEncode({ kind: c.kind, pubkey: c.pubkey, identifier: c.d, relays: dictionaryRelays().slice(0, 2) })}`;
  const name = event ? nameOf(event) : null;
  return (
    <Link href={href} className="text-brand-link hover:underline" data-testid="address-ref" title={address}>
      {name ?? <span className="break-all font-mono text-xs">{address}</span>}
    </Link>
  );
}
