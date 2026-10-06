/**
 * Whose scores a page of scored people shows (the Network page, the profile
 * connection lists): the reader's own perspective when they are signed in,
 * have a calculation, and chose it in the account menu; else Brainstorm's.
 * And the words that say so under the page title, because a list of scores
 * that doesn't say whose they are isn't one a reader can judge. The switch
 * itself lives in the menu alone; pages state the result.
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
