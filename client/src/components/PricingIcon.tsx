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
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g clipPath="url(#pricing-icon-clip)">
        <path
          d="M9.86996 10C9.86996 10.5523 9.42225 11 8.86996 11C8.31768 11 7.86996 10.5523 7.86996 10C7.86996 9.44772 8.31768 9 8.86996 9C9.42225 9 9.86996 9.44772 9.86996 10Z"
          fill="currentColor"
        />
        <path
          d="M21.23 15.22L13.55 22.91L3.66 13.02V5.33L10.99 5L21.23 15.22Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
        <path
          d="M20.33 9.78L12.45 2H6.98999"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
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
