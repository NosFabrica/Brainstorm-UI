import { useEffect } from "react";

interface ShareMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

/**
 * STOPGAP per-profile Open Graph meta injection. A static SPA can't serve
 * crawler-visible meta tags, so authoritative OG rendering must be done
 * server-side (backend team). This hook updates the document title + og/twitter
 * tags client-side so previews work for crawlers that DO execute JS and so the
 * in-app title is correct. It restores the originals on unmount.
 */
export function useShareMeta(meta: ShareMeta | null) {
  useEffect(() => {
    if (!meta) return;

    const prevTitle = document.title;
    const managed: HTMLMetaElement[] = [];

    const setMeta = (key: "property" | "name", value: string, content: string) => {
      if (!content) return;
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${value}"]`);
      let created = false;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(key, value);
        document.head.appendChild(el);
        created = true;
      }
      // remember previous content so we can restore
      el.dataset.prevContent = el.getAttribute("content") ?? "";
      el.dataset.managedCreated = created ? "1" : "0";
      el.setAttribute("content", content);
      managed.push(el);
    };

    if (meta.title) document.title = meta.title;
    if (meta.title) {
      setMeta("property", "og:title", meta.title);
      setMeta("name", "twitter:title", meta.title);
    }
    if (meta.description) {
      setMeta("name", "description", meta.description);
      setMeta("property", "og:description", meta.description);
      setMeta("name", "twitter:description", meta.description);
    }
    if (meta.image) {
      setMeta("property", "og:image", meta.image);
      setMeta("name", "twitter:image", meta.image);
      setMeta("name", "twitter:card", "summary_large_image");
    }
    if (meta.url) setMeta("property", "og:url", meta.url);
    setMeta("property", "og:type", "profile");

    return () => {
      document.title = prevTitle;
      for (const el of managed) {
        if (el.dataset.managedCreated === "1") {
          el.remove();
        } else {
          el.setAttribute("content", el.dataset.prevContent ?? "");
          delete el.dataset.prevContent;
          delete el.dataset.managedCreated;
        }
      }
    };
  }, [meta?.title, meta?.description, meta?.image, meta?.url]);
}
