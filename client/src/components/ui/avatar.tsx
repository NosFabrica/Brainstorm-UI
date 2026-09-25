"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"
import { useNearViewport } from "@/hooks/useNearViewport"
import { useConnectionSpeed } from "@/lib/connection"
import { useAvatarSrc, type AvatarSize } from "@/lib/avatarSrc"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

// The fallback shows until the avatar is this close; only then is the picture fetched.
const AVATAR_NEAR_VIEWPORT = "200px"

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & { size?: AvatarSize }
>(({ className, size = "sm", src: original, onLoadingStatusChange, ...props }, ref) => {
  const marker = React.useRef<HTMLSpanElement>(null)
  const near = useNearViewport(marker, AVATAR_NEAR_VIEWPORT)
  // On a very slow connection a face costs more than it tells you: the
  // fallback stands in, and the ring and flag chip still say who this is.
  const speed = useConnectionSpeed()
  const { src, onError } = useAvatarSrc(original, size, speed)
  if (speed === "very-slow") return null
  if (!near) {
    return (
      <span
        ref={marker}
        aria-hidden
        className="pointer-events-none absolute inset-0"
      />
    )
  }
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      src={src}
      onLoadingStatusChange={(status) => {
        if (status === "error") onError()
        onLoadingStatusChange?.(status)
      }}
      {...props}
    />
  )
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
