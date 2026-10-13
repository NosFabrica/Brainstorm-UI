/**
 * What stands in for media its creator marked sensitive (a NIP-36
 * `content-warning`, read by `contentWarningOf` in lib/nip36) — a video, a
 * picture post, or the pictures in a note. Where the media would show, a cover
 * says so and asks before showing it; where only a thumbnail would be, a
 * neutral tile says "Sensitive". Neither asks for the picture, the poster or a
 * frame of the video. The caller holds the "shown" state, and moves focus to
 * the media once it is shown: the button that had it is gone.
 */
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clip } from "@/lib/resultReaders";
import { cn } from "@/lib/utils";

/** The reason is the creator's free text: this much of it, so the button stays in a short frame. */
const REASON_CHARS = 80;

/** What a flagged tile is called for a screen reader, in place of "Play …". */
export const sensitiveVideoLabel = (title?: string | null) =>
  title?.trim() ? `Sensitive video: ${title.trim()}` : "Sensitive video";

/** What the cover is covering: one video (the default), pictures, or a post's mixed media. */
export type SensitiveSubject = "video" | "photo" | "media";

/** "this video" / "Show video"; "these photos" / "Show photos"; "this post's media" / "Show media". */
function coverWords(subject: SensitiveSubject, count: number): { what: string; action: string } {
  if (subject === "media") return { what: "this post's media", action: "Show media" };
  return count > 1
    ? { what: `these ${subject}s`, action: `Show ${subject}s` }
    : { what: `this ${subject}`, action: `Show ${subject}` };
}

/** In place of the player or the picture. The caller sizes it (`className`) and swaps it for the media on `onShow`. */
export function SensitiveCover({
  reason,
  onShow,
  className,
  subject = "video",
  count = 1,
}: {
  reason?: string;
  onShow: () => void;
  className?: string;
  subject?: SensitiveSubject;
  /** How many of `subject` it covers: "these photos" past one. */
  count?: number;
}) {
  const words = coverWords(subject, count);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-slate-100 p-4 text-center dark:bg-slate-800",
        className,
      )}
      data-testid="sensitive-cover"
    >
      <EyeOff className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <p className="line-clamp-2 max-w-xs text-sm text-slate-600 dark:text-slate-300" data-testid="sensitive-reason">
        The creator marked {words.what} as sensitive{reason ? `: ${clip(reason, REASON_CHARS)}` : ""}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onShow} data-testid="sensitive-show">
        {words.action}
      </Button>
    </div>
  );
}

/** In place of a thumbnail. The caller sizes it and keeps the tap. */
export function SensitiveTile({ className, onClick }: { className?: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
        className,
      )}
      data-testid="sensitive-tile"
    >
      <EyeOff className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-none">Sensitive</span>
    </div>
  );
}
