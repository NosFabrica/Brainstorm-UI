// Custom lightning/flash glyph (filled bolt with faded motion lines). Fills use
// `currentColor`, so color it with a text-* class (e.g. text-yellow-400) and
// size it with height/width utility classes like a lucide icon.
export function FlashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8.62988 13H13.0299V21L21.8299 11H17.4299V3L8.62988 13Z" />
      <path opacity="0.4" fillRule="evenodd" clipRule="evenodd" d="M0.75 3.25H9.25V4.75H0.75V3.25Z" />
      <path opacity="0.4" fillRule="evenodd" clipRule="evenodd" d="M0.75 19.25H8.25V20.75H0.75V19.25Z" />
      <path opacity="0.4" fillRule="evenodd" clipRule="evenodd" d="M0.75 11.25H5.25V12.75H0.75V11.25Z" />
    </svg>
  );
}
