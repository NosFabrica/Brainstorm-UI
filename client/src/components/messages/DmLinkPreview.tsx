/**
 * A link's preview inside a private message — built so the linked site never
 * learns the reader opened it. The title and description come from our own
 * origin's `/link-preview` (brainstorm_og, which doesn't log the URLs it is
 * asked about); the picture only through our image proxy, never from the site
 * itself, and no favicon. No proxy configured: no picture. Off in Settings.
 */
import { useEffect, useRef, useState } from "react";
import { env } from "@/lib/runtimeEnv";
import { proxiedSrc } from "@/lib/imageProxy";
import { isLocalNetworkHost } from "@/lib/localNetwork";
import { fetchUnfurl, type Unfurled } from "@/services/unfurl";
import { useNearViewport } from "@/hooks/useNearViewport";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/;

/** The first link worth previewing in a message, if any. */
export function firstPreviewableLink(text: string): string | null {
  const raw = text.match(URL_RE)?.[0];
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Our server fetches it: an address on the reader's own network means nothing there.
    if (isLocalNetworkHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Only through the proxy: a direct load would hand the site the reader's address. */
export function privateImageSrc(image: string | null): string | null {
  if (!image || !env.VITE_IMG_PROXY) return null;
  const src = proxiedSrc(image, "media_640");
  return src === image ? null : src;
}

export function DmLinkPreview({ url, mine }: { url: string; mine: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const near = useNearViewport(ref, "300px");
  const [data, setData] = useState<Unfurled | null | undefined>(undefined);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    void fetchUnfurl(url).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [near, url]);

  const host = new URL(url).hostname.replace(/^www\./, "");
  const image = imageFailed ? null : privateImageSrc(data?.image ?? null);
  const hasText = !!(data?.title || data?.description);
  if (data === null || (data && !hasText && !image)) return null;

  return (
    <a
      ref={ref}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-2 block overflow-hidden rounded-xl border text-left",
        mine ? "border-white/25 bg-white/10" : "border-border bg-slate-50 dark:bg-slate-900",
      )}
      data-testid="dm-link-preview"
    >
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="max-h-48 w-full object-cover"
        />
      )}
      <span className="flex flex-col gap-0.5 px-3 py-2">
        <span className={cn("text-[11px] uppercase tracking-wide", mine ? "text-white/75" : "text-slate-500")}>
          {data?.siteName || host}
        </span>
        {data === undefined ? (
          <span
            className={cn("h-4 w-2/3 animate-pulse rounded", mine ? "bg-white/20" : "bg-slate-200 dark:bg-slate-800")}
          />
        ) : (
          <>
            {data.title && <span className="line-clamp-2 text-sm font-semibold leading-snug">{data.title}</span>}
            {data.description && (
              <span
                className={cn("line-clamp-2 text-xs", mine ? "text-white/85" : "text-slate-600 dark:text-slate-300")}
              >
                {data.description}
              </span>
            )}
          </>
        )}
      </span>
    </a>
  );
}
