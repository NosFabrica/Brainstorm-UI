/**
 * Renders plain text with bare URLs turned into safe external links. Extracted
 * from the inline `renderLinkedText` in ProfilePage so the share page (bio,
 * short text) can reuse it without pulling in the whole profile page.
 */
import { EmojiText } from "@/components/ui/custom-emoji";

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

/** `tags`: the event's, when the text is one — its NIP-30 emoji are drawn. */
export function LinkedText({ text, tags }: { text: string; tags?: string[][] }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        URL_REGEX.lastIndex = 0;
        if (URL_REGEX.test(part)) {
          const display = part.replace(/^https?:\/\//, "").replace(/\/$/, "");
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener"
              className="break-all text-brand-link underline decoration-brand-link/[0.4] underline-offset-2"
            >
              {display}
            </a>
          );
        }
        return (
          <span key={i}>
            <EmojiText text={part} tags={tags} />
          </span>
        );
      })}
    </>
  );
}
