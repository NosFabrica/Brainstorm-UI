/**
 * A NIP-71 video event (kinds 21 / 22, and the addressable 34235 / 34236 —
 * DiVine publishes shorts as 34236) as the post page's hero: the video with
 * native controls and its poster, upright when the imeta says it's portrait,
 * then title and summary. The URL often carries no file extension — the
 * imeta's `m video/*` is what makes it a video, not the URL's tail.
 */
import { extractVideoPoster, extractVideoUrls } from "@/lib/noteContent";
import type { MinimalEvent } from "@/lib/noteRefs";

export function VideoHero({ event }: { event: MinimalEvent }) {
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1];
  const url = extractVideoUrls(event.content ?? "", event.tags)[0] ?? tag("url");
  const poster = extractVideoPoster(event.content ?? "", event.tags);
  const title = tag("title") || "";
  const summary = (tag("summary") || event.content || "").trim();
  // Portrait when the imeta's dim says so (a 1080x1920 short), else wide.
  const dim = event.tags.flatMap((t) => (t[0] === "imeta" ? t.slice(1) : [])).find((p) => p.startsWith("dim "));
  const [w, h] = dim ? dim.slice(4).split("x").map(Number) : [0, 0];
  const portrait = w > 0 && h > w;

  return (
    <div data-testid="video-hero">
      <div
        className={`mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-slate-800 ${portrait ? "aspect-[9/16] max-h-[36rem]" : "aspect-video w-full"}`}
        data-testid="video-hero-frame"
      >
        {url ? (
          <video src={url} poster={poster} controls playsInline preload="metadata" className="h-full w-full object-contain" data-testid="video-hero-player" />
        ) : poster ? (
          <img src={poster} alt="" className="h-full w-full object-contain" />
        ) : null}
      </div>
      {title && (
        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }} data-testid="video-hero-title">
          {title}
        </h1>
      )}
      {summary && summary !== title && (
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{summary}</p>
      )}
    </div>
  );
}
