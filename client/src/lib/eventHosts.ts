/**
 * Who hosts a NIP-52 calendar event. NIP-52 lets a `p` tag carry a role and
 * leaves the word free: Flockstr writes "host", Formstr writes "organizer", and
 * both are read. Event Index signs each event with the calendar's own key and
 * adds a "host" `p` for every calendar that lists it, so a co-hosted event
 * names each calendar. With no such tag the signer is the host.
 */

const HOST_ROLES = new Set(["host", "organizer"]);
const HEX64 = /^[0-9a-f]{64}$/i;

/** The event's hosts, lowercased public keys in the order written, each once: the first is the host, the rest co-hosts. */
export function hostsOf(event: { pubkey: string; tags: string[][] }): string[] {
  const hosts: string[] = [];
  for (const t of event.tags) {
    if (t[0] !== "p" || !HEX64.test(t[1] ?? "")) continue;
    if (!HOST_ROLES.has((t[3] ?? "").trim().toLowerCase())) continue;
    const pk = t[1].toLowerCase();
    if (!hosts.includes(pk)) hosts.push(pk);
  }
  return hosts.length ? hosts : [event.pubkey];
}
