import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const suggestProfiles = vi.fn(async (_q: string, _params: { pov: string }, _opts?: { limit?: number }) => [
  { pubkey: "a".repeat(64), npub: "npub1top", displayName: "NosFabrica", picture: "https://p.example/a.png" },
  { pubkey: "b".repeat(64), npub: "npub1second", displayName: "Other" },
]);
vi.mock("@/services/search", () => ({
  HOUSE_POV: "nosfabrica",
  suggestProfiles: (q: string, params: { pov: string }, opts?: { limit?: number }) => suggestProfiles(q, params, opts),
}));
const requestNav = vi.fn();
vi.mock("@/components/share/ShareNavContext", () => ({ useShareNav: () => requestNav }));

import { ShareBio } from "@/components/share/ShareBio";

describe("ShareBio — plain @Name mentions", () => {
  it("opens the top suggestion for the name, from the house Perspective", async () => {
    render(<ShareBio text={"building with @NosFabrica"} />);
    fireEvent.click(screen.getByTestId("bio-orgmention"));
    await waitFor(() => expect(requestNav).toHaveBeenCalled());
    expect(suggestProfiles).toHaveBeenCalledWith("NosFabrica", { pov: "nosfabrica" }, { limit: 5 });
    expect(requestNav).toHaveBeenCalledWith({
      kind: "profile",
      target: "npub1top",
      label: "NosFabrica",
      picture: "https://p.example/a.png",
    });
  });
});
