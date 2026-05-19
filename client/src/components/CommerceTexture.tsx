export function CommerceTexture() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
      data-testid="commerce-texture"
    >
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.22]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="trustWeb"
            width="140"
            height="140"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(8)"
          >
            <line x1="0" y1="0" x2="70" y2="70" stroke="#333286" strokeWidth="0.6" />
            <line x1="140" y1="0" x2="70" y2="70" stroke="#333286" strokeWidth="0.6" />
            <line x1="0" y1="140" x2="70" y2="70" stroke="#333286" strokeWidth="0.6" />
            <line x1="140" y1="140" x2="70" y2="70" stroke="#333286" strokeWidth="0.6" />

            <circle cx="0" cy="0" r="1.8" fill="#7c86ff" />
            <circle cx="140" cy="0" r="1.8" fill="#7c86ff" />
            <circle cx="0" cy="140" r="1.8" fill="#7c86ff" />
            <circle cx="140" cy="140" r="1.8" fill="#7c86ff" />

            <circle cx="70" cy="70" r="2.6" fill="#333286" />
            <circle cx="70" cy="70" r="6" fill="none" stroke="#333286" strokeWidth="0.5" opacity="0.6" />
          </pattern>

          <linearGradient id="trustFade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0" />
            <stop offset="65%" stopColor="#F8FAFC" stopOpacity="0" />
            <stop offset="100%" stopColor="#F8FAFC" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        <rect width="100%" height="100%" fill="url(#trustWeb)" />
        <rect width="100%" height="100%" fill="url(#trustFade)" />
      </svg>
    </div>
  );
}
