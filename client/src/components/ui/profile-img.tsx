import * as React from "react"

import { useAvatarSrc } from "@/lib/avatarSrc"
import { useConnectionSpeed } from "@/lib/connection"

/**
 * A profile picture drawn as a plain image — for the places an `Avatar` would
 * be too much (a 14px mention chip). Same thumbnail and retry rule.
 */
export function ProfileImg({
  src: original,
  onError: onErrorProp,
  fallback = null,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  /** Shown once the picture is out of tries, in place of a broken image. */
  fallback?: React.ReactNode
}) {
  const speed = useConnectionSpeed()
  const { src, onError, spent } = useAvatarSrc(original, "sm", speed)
  if (speed === "very-slow" || spent) return <>{fallback}</>
  return (
    <img
      {...props}
      src={src}
      onError={(e) => {
        onError()
        onErrorProp?.(e)
      }}
    />
  )
}
