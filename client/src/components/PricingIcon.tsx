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
          d="M7.56 18.67L7.53999 22.17L12.56 18.67H22V2H2V18.67H7.56Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
        <path
          d="M12 7.37031V6.32031"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
        <path
          d="M12 13.6299V14.6799"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
        <path
          d="M9.91 12.8804V13.6304H14.09V10.9404L11.02 10.2504C10.37 10.0804 9.91 9.96035 9.91 9.96035V7.36035H13.81V8.10035"
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
