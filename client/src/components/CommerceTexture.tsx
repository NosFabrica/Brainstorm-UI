export function CommerceTexture() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
      data-testid="commerce-texture"
    >
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.09]"
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
            <line x1="0" y1="0" x2="70" y2="70" stroke="#7c86ff" strokeWidth="0.4" />
            <line x1="140" y1="0" x2="70" y2="70" stroke="#7c86ff" strokeWidth="0.4" />
            <line x1="0" y1="140" x2="70" y2="70" stroke="#7c86ff" strokeWidth="0.4" />
            <line x1="140" y1="140" x2="70" y2="70" stroke="#7c86ff" strokeWidth="0.4" />

            <circle cx="0" cy="0" r="1.4" fill="#7c86ff" />
            <circle cx="140" cy="0" r="1.4" fill="#7c86ff" />
            <circle cx="0" cy="140" r="1.4" fill="#7c86ff" />
            <circle cx="140" cy="140" r="1.4" fill="#7c86ff" />

            <circle cx="70" cy="70" r="2.2" fill="#333286" />
            <circle cx="70" cy="70" r="5" fill="none" stroke="#333286" strokeWidth="0.35" opacity="0.55" />
          </pattern>

          <radialGradient id="trustFade" cx="50%" cy="0%" r="120%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
          </radialGradient>
        </defs>

        <rect width="100%" height="100%" fill="url(#trustWeb)" />
        <rect width="100%" height="100%" fill="url(#trustFade)" />
      </svg>
    </div>
  );
}
