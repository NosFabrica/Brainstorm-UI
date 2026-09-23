import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** Below `breakpoint` px. Default is the phone line; the search rail folds at lg (1024). */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  // Seeded from the window so the first render is already right: a component
  // that gates work on this must not start it and then change its mind.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!isMobile
}
