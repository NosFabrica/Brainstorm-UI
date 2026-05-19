interface PricingIconProps {
  className?: string;
  size?: number;
}

export function PricingIcon({ className, size = 16 }: PricingIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <g clipPath="url(#pricing-icon-clip)">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13.5499 22.91L21.2399 15.22H21.2299L10.9899 5L3.65991 5.33V13.02L13.5499 22.91ZM9.37854 9.40968C8.92565 8.95678 8.19076 8.95678 7.73786 9.40968C7.28497 9.86257 7.28497 10.5974 7.73786 11.0503C8.19076 11.5032 8.92565 11.5032 9.37854 11.0503C9.83143 10.5974 9.83143 9.86257 9.37854 9.40968ZM8.79852 10.4703C8.66563 10.6032 8.45077 10.6032 8.31788 10.4703C8.18499 10.3374 8.18499 10.1226 8.31787 9.98969C8.45077 9.85678 8.66563 9.85678 8.79852 9.98968C8.93141 10.1226 8.93141 10.3374 8.79853 10.4703Z"
        />
        <path
          opacity="0.4"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.23999 1.25H12.7579L21.3906 9.77323L20.3368 10.8406L12.1422 2.75H6.23999V1.25Z"
        />
      </g>
      <defs>
        <clipPath id="pricing-icon-clip">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
