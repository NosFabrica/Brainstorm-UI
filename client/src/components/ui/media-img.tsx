import * as React from "react"

import { useProxiedSrc, type Preset } from "@/lib/imageProxy"
import { useConnectionSpeed } from "@/lib/connection"

/**
 * A picture from a note or card, drawn at the size it is rendered.
 *
 * `src` must stay the ORIGINAL url at the call site: several surfaces hand the
 * same value to the lightbox, which is meant to show full detail. Only what
 * this element loads is resized.
 */
export function MediaImg({
  src: original,
  preset,
  mime,
  onError: onErrorProp,
  fallback = null,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  preset: Preset
  /** From imeta's `m` part, where the event declares one. */
  mime?: string
  /** Shown once the picture is out of tries, in place of a broken image. */
  fallback?: React.ReactNode
}) {
  const speed = useConnectionSpeed()
  const { src, onError, spent } = useProxiedSrc(original, preset, speed, mime)
  if (spent) return <>{fallback}</>
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
