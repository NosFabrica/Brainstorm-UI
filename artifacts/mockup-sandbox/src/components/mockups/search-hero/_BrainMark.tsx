export function BrainMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="20" cy="22" r="3.4" fill="currentColor" />
      <circle cx="34" cy="14" r="3.4" fill="currentColor" />
      <circle cx="46" cy="24" r="3.4" fill="currentColor" />
      <circle cx="14" cy="38" r="3.4" fill="currentColor" />
      <circle cx="30" cy="34" r="3.4" fill="currentColor" />
      <circle cx="46" cy="42" r="3.4" fill="currentColor" />
      <circle cx="24" cy="50" r="3.4" fill="currentColor" />
      <circle cx="40" cy="52" r="3.4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55">
        <line x1="20" y1="22" x2="34" y2="14" />
        <line x1="34" y1="14" x2="46" y2="24" />
        <line x1="20" y1="22" x2="30" y2="34" />
        <line x1="46" y1="24" x2="30" y2="34" />
        <line x1="14" y1="38" x2="30" y2="34" />
        <line x1="30" y1="34" x2="46" y2="42" />
        <line x1="14" y1="38" x2="24" y2="50" />
        <line x1="30" y1="34" x2="24" y2="50" />
        <line x1="46" y1="42" x2="40" y2="52" />
        <line x1="24" y1="50" x2="40" y2="52" />
        <line x1="30" y1="34" x2="40" y2="52" />
      </g>
    </svg>
  );
}
