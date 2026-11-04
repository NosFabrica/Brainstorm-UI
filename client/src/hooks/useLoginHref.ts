import { useLocation, useSearch } from "wouter";
import { loginHref } from "@/lib/loginHref";

/** The sign-in link for the page the reader is on, query included (lib/loginHref). */
export function useLoginHref(): string {
  const [location] = useLocation();
  return loginHref(location, useSearch());
}
