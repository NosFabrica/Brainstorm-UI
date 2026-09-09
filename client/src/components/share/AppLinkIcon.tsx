import { Globe, Smartphone } from "lucide-react";
import amethystLogoImg from "@/assets/amethyst-logo.png";
import nostriaIconImg from "@/assets/nostria-icon.png";
import dittoLogoImg from "@/assets/ditto-logo.png";
import primalLogoImg from "@/assets/primal-logo.png";
import type { AppLinkId } from "@/lib/openInApp";

// No asset for nostr.band — it falls back to a globe; the default app is a phone.
const LOGO: Partial<Record<Exclude<AppLinkId, "default">, string>> = {
  amethyst: amethystLogoImg,
  ditto: dittoLogoImg,
  nostria: nostriaIconImg,
  primal: primalLogoImg,
};

/** The 16px mark for one "Open in" offer — the same wherever the offer is shown. */
export function AppLinkIcon({ id }: { id: AppLinkId }) {
  if (id === "default") return <Smartphone className="h-4 w-4" />;
  const logo = LOGO[id];
  return logo ? <img src={logo} alt="" className="h-4 w-4 rounded object-contain" /> : <Globe className="h-4 w-4" />;
}
