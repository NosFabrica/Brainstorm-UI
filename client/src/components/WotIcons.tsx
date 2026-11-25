export function NodeFollowersIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" fillOpacity="0.35" />
      <circle cx="5" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="19" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 7.3L9.5 10.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
      <path d="M17.5 7.3L14.5 10.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
      <path d="M6.5 16.7L9.5 13.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
      <circle cx="5" cy="6" r="0.7" fill="currentColor" fillOpacity="0.3" />
      <circle cx="19" cy="6" r="0.7" fill="currentColor" fillOpacity="0.3" />
      <circle cx="5" cy="18" r="0.7" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

export function NodeFollowingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" fillOpacity="0.35" />
      <circle cx="20" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="16" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="20" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M14.5 10.5L18.2 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
      <path
        d="M14.5 13.5L18.2 15.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
      <path d="M10 14L7.5 18.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
      <path d="M16.5 9.5l1.5-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      <path d="M16.5 14.5l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
    </svg>
  );
}

export function NodeMutedByIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="7" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="12" r="1" fill="currentColor" fillOpacity="0.3" />
      <circle cx="17" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="12" r="1" fill="currentColor" fillOpacity="0.3" />
      <path d="M9.8 12h1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M12.8 12h1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M11 10l2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 10l-2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NodeReportedByIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="14" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="14" r="1" fill="currentColor" fillOpacity="0.3" />
      <circle cx="18" cy="14" r="2.2" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.5" />
      <path
        d="M10.8 13.5L15.8 13.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <path
        d="M12 3L10 7.5h4L12 3z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M12 5v1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="0.4" fill="currentColor" />
      <path d="M10.5 8L9 11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.4" />
    </svg>
  );
}

export function NodeMutingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="7" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="12" r="1" fill="currentColor" fillOpacity="0.3" />
      <path d="M9.8 12h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <circle
        cx="17"
        cy="12"
        r="2.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.35"
        strokeDasharray="2.5 1.5"
      />
      <path d="M15.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

export function NodeReportingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="7" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="12" r="1" fill="currentColor" fillOpacity="0.3" />
      <path d="M9.8 12h4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M16 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M16 8h4.5c0 0 0 3-2.25 4H16"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
    </svg>
  );
}

export function NodeFlaggedIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="14" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="14" r="1" fill="currentColor" fillOpacity="0.3" />
      <path d="M10.8 13.5L14 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M16 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M16 5h5l-2.5 3.5L21 12h-5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      <circle cx="12" cy="5" r="1" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
      <path d="M12 6v5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.3" />
    </svg>
  );
}
