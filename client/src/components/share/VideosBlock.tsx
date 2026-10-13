import { Video as VideoIcon } from "lucide-react";
import { withMediaFacet } from "@/lib/mediaFacet";
import { SHORT_VIDEO_KINDS } from "@/lib/nip71";
import { scopedSearchHref } from "@/lib/searchSyntax";
import { eventPath } from "@/lib/shareId";
import { useLightbox, type LightboxContextInfo } from "@/components/share/Lightbox";
import { VideoGrid, type VideoItem } from "@/components/share/VideoGrid";
import { ContentTeaserBlock } from "./ContentTeaserBlock";

/** What the Media tab's Videos chip writes in the query (`kind:video`). */
const VIDEOS_CHIP = withMediaFacet("", "videos");

/**
 * A person's videos, on their public page. A tap plays the video here, in
 * full view, with who it is from and a way to its page: not a jump to the
 * page. A short loops there, as it does on its own page. "View all" is the
 * Media tab scoped to this person with its Videos chip chosen: the tab asks
 * for the video kinds alone, and its lead group of the person's own media
 * keeps to them, so their photos and picture notes stay out of it.
 */
export function VideosBlock({
  pubkey,
  videos,
  author,
  relayHints,
  className = "",
  hidden = false,
}: {
  pubkey: string;
  videos: VideoItem[];
  author: NonNullable<LightboxContextInfo["author"]>;
  relayHints: string[];
  className?: string;
  hidden?: boolean;
}) {
  const openLightbox = useLightbox();
  if (hidden || videos.length === 0) return null;
  const playable = videos.filter((v) => v.url);
  return (
    <ContentTeaserBlock
      icon={<VideoIcon className="h-4 w-4" />}
      title="Videos"
      viewAllHref={scopedSearchHref(pubkey, "media", VIDEOS_CHIP)}
      testId="share-block-videos"
      className={className}
    >
      <VideoGrid
        videos={videos}
        onOpen={(v) =>
          openLightbox(
            playable.map((x) => ({
              url: x.url!,
              kind: "video" as const,
              poster: x.poster ?? null,
              warning: x.video.contentWarning,
              loop: SHORT_VIDEO_KINDS.has(x.event.kind),
            })),
            Math.max(0, playable.indexOf(v)),
            { author, postHref: eventPath(v.event, relayHints) },
          )
        }
      />
    </ContentTeaserBlock>
  );
}
