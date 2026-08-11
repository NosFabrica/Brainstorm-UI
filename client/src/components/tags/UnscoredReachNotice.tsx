import { EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * "Your tags don't reach anyone yet."
 *
 * Since issue #41 B1 an asserter with no published trust score is filtered out,
 * and most accounts have none — 90 of the 105 on the live tag hub. Their tagging
 * is still published, still signed, and still visible TO THEM (the viewer's own
 * stance is read before the trust filter — `services/tags.ts` `groupByTag`), but
 * it sits at zero support and looks exactly like a tag nobody has agreed with
 * yet. Those two states mean completely different things.
 *
 * Without this line, the honest reading of the feature for a new account is
 * "broken". With it, the reading is "not yet" — which is true, and names the
 * thing that changes it.
 *
 * Deliberately not a warning colour and deliberately not blocking: nothing has
 * gone wrong, and tagging is one of the actions most likely to get someone
 * noticed in the first place. Stated once, then out of the way.
 */
export function UnscoredReachNotice({
  /** Singular on a row about one tag; plural above a list. */
  one = false,
  className = "",
}: {
  one?: boolean;
  className?: string;
}) {
  return (
    <Alert variant="info" className={className} data-testid="viewer-unscored-notice">
      <EyeOff className="h-4 w-4" />
      <AlertDescription className="text-sm">
        {one ? "Only you can see this one for now." : "Only you can see these for now."}{" "}
        Other people start seeing your tags once your account is part of the
        network — that happens as people follow you.
      </AlertDescription>
    </Alert>
  );
}
