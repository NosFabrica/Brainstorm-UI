// @vitest-environment jsdom
/** A person row's copy icon says what happened: a copy the browser refused is not silent. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/search/EndorsementLine", () => ({
  FlaggedChip: () => null,
  PersonCardSlot: () => null,
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const copyToClipboard = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/clipboard", () => ({ dialogOf: () => null, copyToClipboard: (text: string) => copyToClipboard(text) }));

import { PersonCard } from "./PersonCard";
import type { SearchResult } from "@/lib/profileSearch";

const PK = "266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5";
const person: SearchResult = {
  pubkey: PK,
  npub: "npub1" + PK.slice(0, 8),
  name: "hzrd149",
  wotRank: null,
  wotFollowers: null,
};

beforeEach(() => {
  toast.mockReset();
  copyToClipboard.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("PersonCard's copy icon", () => {
  it("says Copied once the copy landed", async () => {
    copyToClipboard.mockResolvedValue(true);
    render(<PersonCard result={person} idx={0} pov="nosfabrica" onOpen={() => {}} />);
    fireEvent.click(screen.getByTestId("button-copy-npub-0"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" })));
    expect(copyToClipboard).toHaveBeenCalledWith(person.npub);
  });

  it("says it couldn't copy when the browser refused", async () => {
    copyToClipboard.mockResolvedValue(false);
    render(<PersonCard result={person} idx={0} pov="nosfabrica" onOpen={() => {}} />);
    fireEvent.click(screen.getByTestId("button-copy-npub-0"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});
