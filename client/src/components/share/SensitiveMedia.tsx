/**
 * What stands in for a video its creator marked sensitive (a NIP-36
 * `content-warning`, read by `contentWarningOf` in lib/nip36). Where the video
 * would play, a cover says so and asks before showing it; where only a
 * thumbnail would be, a neutral tile says "Sensitive". Neither asks for the
 * poster or a frame of the video. The caller holds the "shown" state, and
 * moves focus to the video once it is shown: the button that had it is gone.
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

/** In place of the player. The caller sizes it (`className`) and swaps it for the video on `onShow`. */
export function SensitiveCover({
  reason,
  onShow,
  className,
}: {
  reason?: string;
  onShow: () => void;
  className?: string;
}) {
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
        The creator marked this video as sensitive{reason ? `: ${clip(reason, REASON_CHARS)}` : ""}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onShow} data-testid="sensitive-show">
        Show video
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
