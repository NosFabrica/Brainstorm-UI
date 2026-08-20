import * as React from "react"

import { cn } from "@/lib/utils"

// Canonical surface for the Brainstorm Design System (brand guidelines p17
// "Card"). Uses semantic tokens so it's theme-aware by construction. The
// hover-lift is opt-in via `interactive` — static cards should stay quiet
// ("Use colour to communicate, not decorate").
//
// `accent` is the exception the principle allows: an Aurora wash + glow for a
// card that genuinely has to be noticed (the backup nag). Dark gets its own
// values — `--brand-deep` flips to a light violet there (design-system.md).
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; accent?: boolean }
>(({ className, interactive = false, accent = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none",
      accent &&
        "border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.03] to-brand-accent/[0.06] shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] dark:border-brand-accent/25 dark:from-brand-primary/[0.14] dark:to-brand-accent/[0.10] dark:shadow-[0_0_15px_rgb(var(--brand-accent)/0.10)]",
      interactive && "cursor-pointer transition-all hover:shadow-md hover:border-brand-accent/40",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xl font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
