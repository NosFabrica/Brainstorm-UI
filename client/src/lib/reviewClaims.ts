/**
 * The two claims a review can make, in the reviewer's own words.
 *
 * A review is one of two signed statements — the wire carries a single
 * type — and it reads as the claim you make, not as two features: "I
 * recommend them" or "This is really them". What's reviewed decides the
 * pronoun. Today every review is of a person (kind 31871 is addressed to a
 * pubkey); places, software and products will use the same two claims with
 * "it" when their reviews land, so the words live here and not in the page.
 */
import type { VouchType } from "@/services/vouches";

export type ReviewSubjectKind = "person" | "thing";

export interface ReviewClaim {
  type: VouchType;
  label: string;
  help: string;
}

export function reviewClaims(kind: ReviewSubjectKind): [ReviewClaim, ReviewClaim] {
  if (kind === "thing") {
    return [
      { type: "vouch", label: "I recommend it", help: "I've used it and would send people to it." },
      { type: "identity", label: "This is the real one", help: "I can confirm this is the genuine one, not a copy." },
    ];
  }
  return [
    { type: "vouch", label: "I recommend them", help: "I know their work and would send people to them." },
    {
      type: "identity",
      label: "This is really them",
      help: "I know this person and can confirm the account is theirs.",
    },
  ];
}
