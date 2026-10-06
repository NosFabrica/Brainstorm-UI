/**
 * Whose scores the Network page shows — the rule the profile connection lists
 * already follow (pages/ConnectionListPage): the reader's own perspective
 * when they are signed in, have a calculation, and chose it; else
 * Brainstorm's. And the words that say so under the page title, because a
 * list of scores that doesn't say whose they are isn't one a reader can judge.
 */
import type { ScorePov } from "@/components/score/TrustScorePov";

export interface NetworkPerspective {
  /** Ask the API for the house view (unauthenticated) rather than the reader's. */
  house: boolean;
  pov: ScorePov;
  label: string;
  /** The reader can switch: signed in with a calculation of their own. */
  canPersonalize: boolean;
}

export function networkPerspective({
  signedIn,
  calcDone,
  scorePov,
}: {
  signedIn: boolean;
  calcDone: boolean;
  scorePov: ScorePov;
}): NetworkPerspective {
  const canPersonalize = signedIn && calcDone;
  if (canPersonalize && scorePov === "personalized")
    return { house: false, pov: "personalized", label: "Scores from your perspective", canPersonalize };
  return {
    house: true,
    pov: "global",
    label:
      signedIn && !calcDone
        ? "Scores from Brainstorm's perspective until yours is ready"
        : "Scores from Brainstorm's perspective",
    canPersonalize,
  };
}
