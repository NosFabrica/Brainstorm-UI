/**
 * Renders plain text with bare URLs turned into safe external links. Extracted
 * from the inline `renderLinkedText` in ProfilePage so the share page (bio,
 * short text) can reuse it without pulling in the whole profile page.
 */
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

export function LinkedText({ text }: { text: string }) {
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
              className="text-brand-link underline underline-offset-2 decoration-brand-link/[0.4] break-all"
            >
              {display}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
