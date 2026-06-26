import { nip19 } from "nostr-tools";

/** Decode an npub to lowercase hex, or "" if invalid. */
export function npubToHex(npub: string): string {
  try {
    const d = nip19.decode(npub);
    return d.type === "npub" ? (d.data as string).toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Curated accounts offered (not preselected) in the "build your network" follow
 * pickers — shared by the /welcome onboarding and the dashboard's no-follows card
 * so the two stay in sync.
 */
export const SUGGESTED_ACCOUNTS: { name: string; pubkey: string }[] = [
  { name: "jack", npub: "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m" },
  { name: "Lyn Alden", npub: "npub1a2cww4kn9wqte4ry70vyfwqyqvpswksna27rtxd8vty6c74era8sdcw83a" },
  { name: "Derek Ross", npub: "npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424" },
  { name: "Efrat Fenigson", npub: "npub1dg6es53r3hys9tk3n7aldgz4lx4ly8qu4zg468zwyl6smuhjjrvsnhsguz" },
  { name: "Vitor Pamplona", npub: "npub1gcxzte5zlkncx26j68ez60fzkvtkm9e0vrwdcvsjakxf9mu9qewqlfnj5z" },
  { name: "Ainsley Costello", npub: "npub13qrrw2h4z52m7jh0spefrwtysl4psfkfv6j4j672se5hkhvtyw7qu0almy" },
  { name: "walker", npub: "npub1cj8znuztfqkvq89pl8hceph0svvvqk0qay6nydgk9uyq7fhpfsgsqwrz4u" },
  { name: "Alex Gleason", npub: "npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p" },
]
  .map((s) => ({ name: s.name, pubkey: npubToHex(s.npub) }))
  .filter((s) => /^[0-9a-f]{64}$/.test(s.pubkey));
