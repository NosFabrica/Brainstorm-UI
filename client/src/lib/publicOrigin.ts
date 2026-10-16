import { env } from "@/lib/runtimeEnv";

/** The origin a link should carry when someone else opens it: the APK's own is 127.0.0.1. */
export function publicOrigin(): string {
  const configured = env.VITE_PUBLIC_ORIGIN.replace(/\/+$/, "");
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** This page's URL with its origin swapped for the public one. */
export function publicPageUrl(): string {
  if (typeof window === "undefined") return "";
  const { pathname, search, hash } = window.location;
  return `${publicOrigin()}${pathname}${search}${hash}`;
}
