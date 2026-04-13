interface HousePovIconProps {
  className?: string;
}

export function HousePovIcon({ className = "h-4 w-4" }: HousePovIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeMiterlimit="10"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 22H22" />
      <path d="M2.94995 21.9993L2.99995 9.96926C2.99995 9.35926 3.28995 8.77931 3.76995 8.39931L10.77 2.9493C11.49 2.3893 12.4999 2.3893 13.2299 2.9493L20.23 8.3893C20.72 8.7693 21 9.34926 21 9.96926V21.9993" />
      <path d="M13 17H11C10.17 17 9.5 17.67 9.5 18.5V22H14.5V18.5C14.5 17.67 13.83 17 13 17Z" />
      <path d="M9.5 13.75H7.5C6.95 13.75 6.5 13.3 6.5 12.75V11.25C6.5 10.7 6.95 10.25 7.5 10.25H9.5C10.05 10.25 10.5 10.7 10.5 11.25V12.75C10.5 13.3 10.05 13.75 9.5 13.75Z" />
      <path d="M16.5 13.75H14.5C13.95 13.75 13.5 13.3 13.5 12.75V11.25C13.5 10.7 13.95 10.25 14.5 10.25H16.5C17.05 10.25 17.5 10.7 17.5 11.25V12.75C17.5 13.3 17.05 13.75 16.5 13.75Z" />
      <path d="M18.9999 7L18.9699 4H14.5699" />
    </svg>
  );
}
