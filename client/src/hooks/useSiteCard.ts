import { useEffect, useState } from "react";
import { useConnectionSpeed } from "@/lib/connection";
import { fetchUnfurl, type Unfurled } from "@/services/unfurl";

/**
 * What a place's own website says about itself — its Open Graph picture and
 * its name — from the link-preview proxy on our origin (services/unfurl), so
 * the reader never contacts the business. The one page a place has, asked
 * once per visit; nothing on a slow connection, nothing when the site has
 * no picture to give.
 */
export function useSiteCard(url: string | null): Pick<Unfurled, "image" | "siteName"> | null {
  const [card, setCard] = useState<Pick<Unfurled, "image" | "siteName"> | null>(null);
  const speed = useConnectionSpeed();
  const wanted = !!url && speed === "normal";
  useEffect(() => {
    if (!wanted || !url) return;
    let alive = true;
    setCard(null);
    void fetchUnfurl(url).then((m) => {
      if (alive) setCard(m && m.kind === "page" ? { image: m.image, siteName: m.siteName } : null);
    });
    return () => {
      alive = false;
    };
  }, [url, wanted]);
  return card;
}
