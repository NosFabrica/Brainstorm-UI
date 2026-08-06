import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CarrierMeta } from "./CarrierMeta";
import type { TagCarrier } from "@/services/tags";

/**
 * These lock the four states a carrier row can be in. Three of them exist on
 * the live hub and were checked there; the fourth — the subject disagreeing —
 * has no live example, and manufacturing one would mean publishing a fake
 * kind-0 profile to public relays just to clear the has-a-profile gate. So it's
 * pinned here instead.
 */

const carrier = (over: Partial<TagCarrier> = {}): TagCarrier => ({
  pubkey: "a".repeat(64),
  applications: 1,
  disputes: 0,
  asserters: ["b".repeat(64)],
  selfDeclared: false,
  subjectDisagreed: false,
  ...over,
});

const profiles = new Map<string, { name?: string; display_name?: string }>([
  ["b".repeat(64), { display_name: "Avi Burra" }],
  ["c".repeat(64), { name: "david" }],
  ["d".repeat(64), { display_name: "Shawn" }],
  ["e".repeat(64), { display_name: "vinney" }],
]);
// The real map is Map<string, ProfileContent>; only the name fields are read.
const profileMap = profiles as unknown as Parameters<typeof CarrierMeta>[0]["profileMap"];

describe("CarrierMeta", () => {
  it("names who vouched rather than just counting them", () => {
    render(<CarrierMeta carrier={carrier()} profileMap={profileMap} />);
    expect(screen.getByTestId("tag-vouch-count")).toHaveTextContent("Added by Avi Burra");
  });

  it("lists several vouchers and truncates past three", () => {
    render(
      <CarrierMeta
        carrier={carrier({
          applications: 4,
          asserters: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64)],
        })}
        profileMap={profileMap}
      />,
    );
    const text = screen.getByTestId("tag-vouch-count").textContent ?? "";
    expect(text).toContain("Avi Burra");
    expect(text).toContain("david");
    expect(text).toContain("Shawn");
    // Fourth is summarised, not listed — the row has to stay one line.
    expect(text).toContain("+1");
    expect(text).not.toContain("vinney");
  });

  it("falls back to a short pubkey when a voucher has no profile", () => {
    render(<CarrierMeta carrier={carrier({ asserters: ["f".repeat(64)] })} profileMap={profileMap} />);
    expect(screen.getByTestId("tag-vouch-count")).toHaveTextContent("ffffffff");
  });

  it("marks a self-declaration as the person's own claim, not the network's", () => {
    render(
      <CarrierMeta
        carrier={carrier({ applications: 0, asserters: [], selfDeclared: true })}
        profileMap={profileMap}
      />,
    );
    expect(screen.getByTestId("tag-self-declared")).toHaveTextContent("Says this about themselves");
    // Crucially it must NOT read as though somebody vouched.
    expect(screen.getByTestId("tag-vouch-count").textContent).not.toMatch(/Added by/);
  });

  it("shows both when others vouched AND the person claims it too", () => {
    render(<CarrierMeta carrier={carrier({ selfDeclared: true })} profileMap={profileMap} />);
    const text = screen.getByTestId("tag-vouch-count").textContent ?? "";
    expect(text).toContain("Added by Avi Burra");
    expect(text).toContain("Also says it themselves");
  });

  it("surfaces the subject's objection on its own line", () => {
    render(<CarrierMeta carrier={carrier({ subjectDisagreed: true })} profileMap={profileMap} />);
    // The objection can't remove the tag, so it must be impossible to miss.
    expect(screen.getByTestId("tag-subject-disagrees")).toHaveTextContent(
      "They disagree with this tag",
    );
    // And it never suppresses the vouches — no veto.
    expect(screen.getByTestId("tag-vouch-count")).toHaveTextContent("Added by Avi Burra");
  });

  it("shows the disagreement count alongside the vouches", () => {
    render(<CarrierMeta carrier={carrier({ applications: 3, disputes: 2 })} profileMap={profileMap} />);
    expect(screen.getByTestId("tag-vouch-count")).toHaveTextContent("2 disagreed");
  });

  it("stays quiet about disagreement when there is none", () => {
    render(<CarrierMeta carrier={carrier()} profileMap={profileMap} />);
    expect(screen.getByTestId("tag-vouch-count").textContent).not.toMatch(/disagreed/);
    expect(screen.queryByTestId("tag-subject-disagrees")).toBeNull();
  });
});
