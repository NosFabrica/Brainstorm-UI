import { useEffect, useState, type RefObject } from "react";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useConnectionSpeed } from "@/lib/connection";
import { fetchUnfurl, type Unfurled } from "@/services/unfurl";

/** Start asking a little before the row is read, so it is usually filled. */
const NEAR_VIEWPORT = "400px";

/**
 * A page's metadata for a link result — title, description, picture, site
 * name — from the link-preview proxy. Asked only once the row is near the
 * viewport and the connection is normal; the service memoises per URL for
 * the session, so a row that scrolls in twice asks once. Null until the
 * page answers, and null for good when it has nothing to say.
 */
export function useLinkMetadata(url: string | null, ref: RefObject<Element | null>): Unfurled | null {
  const [meta, setMeta] = useState<Unfurled | null>(null);
  const near = useNearViewport(ref, NEAR_VIEWPORT);
  const speed = useConnectionSpeed();
  const wanted = !!url && near && speed === "normal";
  useEffect(() => {
    if (!wanted || !url) return;
    let alive = true;
    setMeta(null);
    void fetchUnfurl(url).then((m) => {
      // A link that is itself a picture or a clip is not a page; the row shows nothing for it.
      if (alive) setMeta(m && m.kind !== "image" && m.kind !== "video" ? m : null);
    });
    return () => {
      alive = false;
    };
  }, [url, wanted]);
  return meta;
}
