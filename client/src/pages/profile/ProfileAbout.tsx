import type { NostrEvent } from "nostr-tools";
import { EmojiText } from "@/components/ui/custom-emoji";

/** The about text with its links made clickable and its custom emoji drawn. */
function renderLinkedText(text: string, emojiTags: NostrEvent | undefined) {
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      const display = part.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener"
          className="break-all text-brand-primary underline decoration-brand-primary/25 underline-offset-2"
          data-testid={`link-about-url-${i}`}
        >
          {display}
        </a>
      );
    }
    return (
      <span key={i}>
        <EmojiText text={part} tags={emojiTags} />
      </span>
    );
  });
}

/** The about text, clamped to three lines with Show more past 140 characters. */
export function ProfileAbout({
  about,
  aboutExpanded,
  setAboutExpanded,
  emojiTags,
}: {
  about: string;
  aboutExpanded: boolean;
  setAboutExpanded: (expanded: boolean) => void;
  emojiTags: NostrEvent | undefined;
}) {
  return (
    <div className="mb-4 overflow-hidden" data-testid="text-profile-about">
      <p
        className={`overflow-wrap-anywhere whitespace-pre-line break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400 ${!aboutExpanded ? "line-clamp-3" : ""}`}
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      >
        {renderLinkedText(about, emojiTags)}
      </p>
      {about.length > 140 && (
        <button
          onClick={() => setAboutExpanded(!aboutExpanded)}
          className="mt-1 text-xs font-medium text-brand-primary"
          data-testid="button-about-toggle"
        >
          {aboutExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
