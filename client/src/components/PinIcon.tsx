/**
 * Custom "pin" icon for the Featured section header. Stroke-based and uses
 * currentColor so it inherits the surrounding text color (the icon chip's brand
 * tone), matching how lucide icons behave.
 */
export function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 22V15.89" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.2196 10.33H8.76965C7.22965 10.33 5.89965 11.38 5.52965 12.87L5.37965 13.48C5.23965 14.06 5.37965 14.67 5.73965 15.14C6.10965 15.61 6.66965 15.88 7.26965 15.88H16.7196C17.3196 15.88 17.8796 15.61 18.2496 15.14C18.6196 14.67 18.7496 14.06 18.6096 13.48L18.4596 12.87C18.0996 11.37 16.7496 10.32 15.2196 10.33Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.0497 10.33L14.3297 6C14.2597 5.59 14.4297 5.18 14.7597 4.93L15.9997 4C16.3797 3.71 16.5397 3.21 16.3897 2.76C16.2397 2.31 15.8097 2 15.3397 2H8.66972C8.18972 2 7.76972 2.31 7.61972 2.76C7.46972 3.21 7.61972 3.71 8.00972 4L9.24972 4.93C9.57972 5.18 9.74972 5.59 9.67972 6L8.95972 10.33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
