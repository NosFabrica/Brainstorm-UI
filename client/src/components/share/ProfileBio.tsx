import { useState } from "react";
import { ShareBio } from "@/components/share/ShareBio";

type ProfileLite = { name?: string; display_name?: string; picture?: string };

/**
 * The bio on the public profile: three lines at rest, the whole text on a
 * tap. Paragraph breaks are kept only when open — clamped, a blank line
 * would spend one of the three on nothing but the ellipsis (megistus's bio
 * did). The toggle appears only when there is more
 * to read — judged by length or line count, since the page cannot measure
 * a clamp before it paints (and jsdom never does). Erring toward showing
 * the toggle costs a needless tap; erring the other way hides the bio,
 * which was the complaint.
 */
const LONG_ENOUGH = 160;

export function ProfileBio({ text, profiles, collapsedLines = 3 }: { text: string; profiles?: Map<string, ProfileLite>; collapsedLines?: 2 | 3 | 4 }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n").length;
  const hasMore = text.length > LONG_ENOUGH || lines > collapsedLines;
  const clamp = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" }[collapsedLines];
  return (
    <div className="mt-2" data-testid="share-bio">
      <p
        className={`text-sm text-slate-600 dark:text-slate-300 leading-snug break-words ${expanded || !hasMore ? "whitespace-pre-line" : `whitespace-normal ${clamp}`}`}
        data-testid="share-bio-text"
      >
        <ShareBio text={text} profiles={profiles} />
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-link transition-colors"
          data-testid="share-bio-toggle"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
