// The explainer videos the app points people at: one list, so the page that
// plays a video and the rows that lead to it can't name different files.
//
// The file ships with the app and is served from our own origin: there is no
// media host in the estate, and a third-party one would put somebody else's
// player, tracking or retention policy between us and the page. That costs its
// size in the image and the Android app, so keep it web-sized (1080p H.264,
// `-crf 31 -movflags +faststart`: about 9 MB for three minutes). The service
// worker leaves video to the network (sw.ts), so it is never cached with the
// shell.
//
// `src` may be null for a video with no file yet; then nothing offers it.
import tagsPoster from "@/assets/tags-explainer-poster.webp";
import tagsVideo from "@/assets/tags-explainer.mp4";

export interface ExplainerVideo {
  /** The MP4's URL, or null while there is no file. */
  src: string | null;
  /** The still shown until someone presses play. */
  poster: string;
  title: string;
  /** How long it runs, as people say it: "3 min". */
  length: string;
}

/** "Tags, explained": the walkthrough of what a tag is and who can say what. It has sound. */
export const TAGS_EXPLAINER: ExplainerVideo = {
  src: tagsVideo,
  poster: tagsPoster,
  title: "How tags work",
  length: "3 min",
};
