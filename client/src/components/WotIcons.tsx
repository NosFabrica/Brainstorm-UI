import { motion } from 'framer-motion';

interface IconProps {
  className?: string;
  animate?: boolean;
}

export function SpamFilterIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M4 6h16M4 12h10M4 18h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      <motion.circle
        cx="18" cy="15" r="4"
        stroke="currentColor"
        strokeWidth="2"
        initial={animate ? { scale: 0, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ delay: 0.5, duration: 0.3 }}
      />
      <motion.path
        d="M16 15l1.5 1.5L20 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ delay: 0.8, duration: 0.3 }}
      />
    </svg>
  );
}

export function DiscoveryIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.circle
        cx="12" cy="12" r="3"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ duration: 0.5 }}
      />
      <motion.circle
        cx="12" cy="12" r="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 2"
        initial={animate ? { rotate: 0, opacity: 0 } : undefined}
        animate={animate ? { rotate: 360, opacity: 1 } : undefined}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
        initial={animate ? { rotate: 0 } : undefined}
        animate={animate ? { rotate: -360 } : undefined}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />
      <motion.path
        d="M12 2v2M22 12h-2M12 22v-2M2 12h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export function CommunityIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <motion.circle cx="6" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
      <motion.circle cx="18" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
      <motion.path
        d="M12 11v2M9 13l-2 1M15 13l2 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.circle
        cx="12" cy="18" r="2"
        fill="currentColor"
        fillOpacity="0.3"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.3, 1] } : undefined}
        transition={{ delay: 0.6, duration: 0.4 }}
      />
    </svg>
  );
}

export function SecureScanIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.94 19.61L21.8 19.87C20.98 20.06 20.34 20.7 20.15 21.52L19.88 22.66C19.85 22.78 19.68 22.78 19.65 22.66L19.39 21.52C19.2 20.7 18.56 20.06 17.74 19.87L16.6 19.6C16.48 19.57 16.48 19.4 16.6 19.37L17.74 19.11C18.56 18.92 19.2 18.28 19.39 17.46L19.66 16.32C19.69 16.2 19.86 16.2 19.89 16.32L20.15 17.46C20.34 18.28 20.98 18.92 21.8 19.11L22.94 19.38C23.06 19.41 23.06 19.58 22.94 19.61Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" />
      <path d="M5.33 2H4.22C2.99 2 2 2.99 2 4.22V5.33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 18.67V19.78C2 21.01 2.99 22 4.22 22H5.33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 5.33V4.22C22 2.99 21.01 2 19.78 2H18.67" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.54 12.1301C14.18 11.5701 14.52 10.6701 14.27 9.71005C14.06 8.92005 13.42 8.28005 12.63 8.08005C11.06 7.67005 9.65002 8.85005 9.65002 10.3501C9.65002 11.0601 9.97002 11.7001 10.46 12.1301C10.6 12.2501 10.67 12.4301 10.62 12.6001L9.97003 14.8601C9.81003 15.4301 10.23 15.9901 10.83 15.9901H13.18C13.77 15.9901 14.2 15.4201 14.04 14.8601L13.39 12.5901C13.34 12.4101 13.41 12.2401 13.55 12.1201H13.54V12.1301Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KeyControlIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19.79 14.9303C17.73 16.9803 14.78 17.6103 12.19 16.8003L7.48002 21.5003C7.14002 21.8503 6.47002 22.0603 5.99002 21.9903L3.81002 21.6903C3.09002 21.5903 2.42002 20.9103 2.31002 20.1903L2.01002 18.0103C1.94002 17.5303 2.17002 16.8603 2.50002 16.5203L7.20002 11.8203C6.40002 9.22031 7.02002 6.27031 9.08002 4.22031C12.03 1.27031 16.82 1.27031 19.78 4.22031C22.74 7.17031 22.74 11.9803 19.79 14.9303Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.89001 17.4902L9.19001 19.7902" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 11C15.3284 11 16 10.3284 16 9.5C16 8.67157 15.3284 8 14.5 8C13.6716 8 13 8.67157 13 9.5C13 10.3284 13.6716 11 14.5 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VerifyIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M12 3L4 7v6c0 5.5 3.4 10 8 11 4.6-1 8-5.5 8-11V7l-8-4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.1"
        initial={animate ? { scale: 0.8, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.4 }}
      />
      <motion.path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ delay: 0.4, duration: 0.5 }}
      />
    </svg>
  );
}

export function ShowEyeIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        opacity="0.4"
        d="M15.5799 11.9999C15.5799 13.9799 13.9799 15.5799 11.9999 15.5799C10.0199 15.5799 8.41992 13.9799 8.41992 11.9999C8.41992 10.0199 10.0199 8.41992 11.9999 8.41992C13.9799 8.41992 15.5799 10.0199 15.5799 11.9999Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={{ delay: 0.2, duration: 0.3 }}
      />
      <motion.path
        d="M11.9998 20.2707C15.5298 20.2707 18.8198 18.1907 21.1098 14.5907C22.0098 13.1807 22.0098 10.8107 21.1098 9.4007C18.8198 5.8007 15.5298 3.7207 11.9998 3.7207C8.46984 3.7207 5.17984 5.8007 2.88984 9.4007C1.98984 10.8107 1.98984 13.1807 2.88984 14.5907C5.17984 18.1907 8.46984 20.2707 11.9998 20.2707Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 0.5 }}
      />
    </svg>
  );
}

export function TellSpeechIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M4 4h16v12H8l-4 4V4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.1"
        initial={animate ? { scale: 0.8, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.3 }}
      />
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <circle cx="8" cy="10" r="1" fill="currentColor" />
        <circle cx="12" cy="10" r="1" fill="currentColor" />
        <circle cx="16" cy="10" r="1" fill="currentColor" />
      </motion.g>
    </svg>
  );
}

export function NormalModeIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
      <motion.path
        d="M12 8c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function TechModeIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <motion.path
        d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export function SparkleStarIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"
        fill="currentColor"
        initial={animate ? { scale: 0, rotate: -180 } : undefined}
        animate={animate ? { scale: 1, rotate: 0 } : undefined}
        transition={{ duration: 0.5, ease: "backOut" }}
      />
      <motion.circle
        cx="18" cy="18" r="2"
        fill="currentColor"
        fillOpacity="0.6"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ delay: 0.3, duration: 0.3 }}
      />
      <motion.circle
        cx="6" cy="18" r="1.5"
        fill="currentColor"
        fillOpacity="0.4"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ delay: 0.4, duration: 0.3 }}
      />
    </svg>
  );
}

export function CommunityCircleIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
      <motion.path
        d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 0.6 }}
      />
      <motion.circle
        cx="12" cy="7" r="1.5"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={{ delay: 0.2 }}
      />
      <motion.circle
        cx="16.5" cy="14" r="1.5"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={{ delay: 0.3 }}
      />
      <motion.circle
        cx="7.5" cy="14" r="1.5"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={{ delay: 0.4 }}
      />
    </svg>
  );
}

export function TrendingGraphIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <motion.path
        d="M4 16l5-4 4 4 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 0.8 }}
      />
      <motion.path
        d="M19 9V5h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: 1 } : undefined}
        transition={{ delay: 0.8 }}
      />
    </svg>
  );
}

export function CompareIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M6 8l-2 4 2 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 8l2 4-2 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="12" r="2" fill="currentColor" fillOpacity="0.3" />
      <circle cx="18" cy="12" r="2" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

export function CheckPulseIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.circle
        cx="12" cy="12" r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.2"
      />
      <motion.path
        d="M8 12l2.5 2.5L16 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ duration: 0.4 }}
      />
    </svg>
  );
}

export function CrossFragmentIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronPulseIcon({ className = "w-6 h-6", isOpen = false }: IconProps & { isOpen?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        style={{ transformOrigin: 'center' }}
      />
    </svg>
  );
}

export function QuestionBubbleIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
      <path
        d="M9 9.5c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5c0 1.2-.8 2-2 2.5-.5.2-1 .5-1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function NetworkWebIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.circle
        cx="12" cy="12" r="3"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: 1 } : undefined}
        transition={{ duration: 0.3 }}
      />
      <motion.circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <motion.circle cx="20" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
      <motion.circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
      <motion.circle cx="12" cy="20" r="2" stroke="currentColor" strokeWidth="1.5" />
      <motion.path
        d="M6 12h3M15 12h3M12 6v3M12 15v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ delay: 0.2, duration: 0.5 }}
      />
      <motion.circle
        cx="6" cy="6" r="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <motion.circle
        cx="18" cy="6" r="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <motion.circle
        cx="6" cy="18" r="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <motion.circle
        cx="18" cy="18" r="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <motion.path
        d="M8 8l2.5 2.5M16 8l-2.5 2.5M8 16l2.5-2.5M16 16l-2.5-2.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeOpacity="0.4"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ delay: 0.4, duration: 0.4 }}
      />
    </svg>
  );
}

export function TunerIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 6h4M12 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h10M18 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 18h2M10 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="6" r="2" fill="currentColor" />
      <circle cx="16" cy="12" r="2" fill="currentColor" />
      <circle cx="8" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

export function TrustPropagationIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.circle
        cx="4" cy="12" r="2"
        fill="currentColor"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ duration: 0.3 }}
      />
      <motion.circle
        cx="12" cy="12" r="2"
        fill="currentColor"
        fillOpacity="0.7"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ delay: 0.2, duration: 0.3 }}
      />
      <motion.circle
        cx="20" cy="12" r="2"
        fill="currentColor"
        fillOpacity="0.4"
        initial={animate ? { scale: 0 } : undefined}
        animate={animate ? { scale: [0, 1.2, 1] } : undefined}
        transition={{ delay: 0.4, duration: 0.3 }}
      />
      <motion.path
        d="M6 12h4M14 12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 2"
        initial={animate ? { pathLength: 0 } : undefined}
        animate={animate ? { pathLength: 1 } : undefined}
        transition={{ delay: 0.1, duration: 0.5 }}
      />
      <motion.path
        d="M8 10l2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.6"
      />
      <motion.path
        d="M16 10l2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.4"
      />
    </svg>
  );
}

export function InsightBulbIcon({ className = "w-6 h-6", animate = false }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <motion.path
        d="M12 2C8 2 5 5 5 9c0 2.5 1.5 4.6 3.5 5.5.5.2 1 .8 1 1.5v2h5v-2c0-.7.5-1.3 1-1.5C17.5 13.6 19 11.5 19 9c0-4-3-7-7-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.1"
        initial={animate ? { scale: 0.8, opacity: 0 } : undefined}
        animate={animate ? { scale: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.4 }}
      />
      <motion.path
        d="M9 21h6M10 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <motion.g
        initial={animate ? { opacity: 0 } : undefined}
        animate={animate ? { opacity: [0, 1, 0.5, 1] } : undefined}
        transition={{ delay: 0.4, duration: 0.8 }}
      >
        <path d="M12 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M9.5 8l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14.5 8l-1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

export function FollowHeartIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ZapBoltIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RepostIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M17 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path 
        d="M3 11V9a4 4 0 014-4h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path 
        d="M7 22l-4-4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path 
        d="M21 13v2a4 4 0 01-4 4H3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuoteBubbleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 10h.01M12 10h.01M16 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function StarRatingIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TagLabelIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function ActionProofIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path 
        d="M22 11.08V12a10 10 0 11-5.93-9.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path 
        d="M22 4L12 14.01l-3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExplicitContextIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8h8M8 12h8M8 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SortTrustIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
      <path d="M12 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function SortTimeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.8" />
      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

export function SortActivityIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function SortAlphaIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.8" />
      <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
      <path d="M14 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M14 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 13l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      <path d="M14.5 13.5L18.2 15.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
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
      <path d="M10.8 13.5L15.8 13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M12 3L10 7.5h4L12 3z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
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
      <circle cx="17" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="2.5 1.5" />
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
      <path d="M16 8h4.5c0 0 0 3-2.25 4H16" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" />
    </svg>
  );
}

export function NodeSignIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="14" r="1.2" fill="currentColor" fillOpacity="0.3" />
      <path d="M11 14h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M15 16l2-4.5 2-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 11.5l4.5-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.7" />
      <path d="M13 18c1 1.5 3 2 5.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function NodeShieldIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3l-7 3.5v5c0 4.5 3 8.5 7 9.5 4-1 7-5 7-9.5v-5L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="11" r="1" fill="currentColor" fillOpacity="0.4" />
      <circle cx="7.5" cy="9" r="1.2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <circle cx="16.5" cy="9" r="1.2" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <path d="M8.7 9h0.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.4" />
      <path d="M14.5 10.5l0.8-0.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.4" />
      <circle cx="12" cy="16" r="1" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" />
      <path d="M12 13.5v1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.4" />
    </svg>
  );
}

export function NodeBroadcastIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" fillOpacity="0.4" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" strokeOpacity="0.7" />
      <path d="M6 6a8.5 8.5 0 0 0 0 12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" strokeOpacity="0.4" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" strokeOpacity="0.4" />
      <circle cx="5" cy="5" r="1" fill="currentColor" fillOpacity="0.25" />
      <circle cx="19" cy="5" r="1" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}
