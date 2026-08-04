// The Nostr clients Brainstorm's trust scores show up in (NIP-85), and where to
// get them. Brainstorm is a trust + search layer, not a client, so pointing at
// real apps is part of the answer rather than a competitor plug.
//
// ONE list, several surfaces: the /nostr page's "Get a Nostr app" grid, and the
// dashboard's client shelf + its collapsed "Works with …" one-liner. Adding a
// fifth client here updates all of them, which is the whole point of the file —
// the same four names used to be hardcoded in two places and could drift.
import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";
import dittoLogoImg from "@/assets/ditto-logo.png";
import primalLogoImg from "@/assets/primal-logo.png";

export interface SupportedClient {
  name: string;
  /** Platforms, shown under the name. */
  note: string;
  /** The app's own download/home page. Outbound — always a new tab. */
  href: string;
  logo: string;
}

export const SUPPORTED_CLIENTS: SupportedClient[] = [
  { name: "Amethyst", note: "Android", href: "https://github.com/vitorpamplona/amethyst", logo: amethystLogoImg },
  { name: "Ditto", note: "Web", href: "https://ditto.pub", logo: dittoLogoImg },
  { name: "Nostria", note: "Web", href: "https://nostria.app", logo: nostriaIconImg },
  { name: "Primal", note: "iOS · Android · Web", href: "https://primal.net/downloads", logo: primalLogoImg },
];

/** The one-line form — "Amethyst · Ditto · Nostria · Primal". */
export const SUPPORTED_CLIENT_NAMES = SUPPORTED_CLIENTS.map((c) => c.name).join(" · ");
