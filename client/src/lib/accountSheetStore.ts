import { BehaviorSubject } from "rxjs";
import { use$ } from "applesauce-react/hooks";

/**
 * Open-state for the mobile account bottom sheet, kept outside React so the
 * "You" tab in {@link MobileTabBar} and any other trigger can open it without
 * prop-drilling. A `BehaviorSubject` rather than a hand-rolled listener set —
 * the rest of the app's out-of-React state is already observables.
 */
const open$ = new BehaviorSubject(false);

export function openAccountSheet() {
  setAccountSheet(true);
}

export function closeAccountSheet() {
  setAccountSheet(false);
}

export function setAccountSheet(next: boolean) {
  if (open$.value !== next) open$.next(next);
}

export function useAccountSheetOpen(): boolean {
  return use$(open$);
}
