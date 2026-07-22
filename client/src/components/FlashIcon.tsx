// Custom lightning/flash glyph (a clean filled bolt). Fill uses `currentColor`,
// so color it with a text-* class (e.g. text-[#F7931A] for Bitcoin orange) and
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
      <path d="M8.96221 23L10.3059 13.8357L4 11.6403L9.57648 1H17.7828L13.3773 8.73503L20 10.921L8.96221 23ZM6.0252 10.8556L11.8992 12.9015L11.0642 18.5907L17.4757 11.5749L11.2753 9.51975L15.3353 2.40127H10.4595L6.03479 10.8556H6.0252Z" />
    </svg>
  );
}
