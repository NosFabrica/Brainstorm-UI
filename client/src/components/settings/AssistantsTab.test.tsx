// @vitest-environment jsdom
/**
 * Settings › Assistants & Duties, pressed: each button publishes what it says
 * — a tag, a change (the new tag, then a dispute of the old), or a dispute —
 * and taking a tag back is never offered as "Remove" (there is no delete).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MyAssistants } from "@/hooks/useMyAssistants";

const ME = "1".repeat(64);
const LOCAL = "a".repeat(64);
const ONE_TAG = "b".repeat(64);
const TWO_TAGS = "c".repeat(64);
const ON_MAP_ONLY = "d".repeat(64);
const FOUND = "e".repeat(64);
const DEFS = { brainstorm: "f".repeat(64), tapestry: "9".repeat(64) };
const NAMES: Record<string, string> = {
  [LOCAL]: "Local Helper",
  [ONE_TAG]: "Bea",
  [TWO_TAGS]: "Cy",
  [ON_MAP_ONLY]: "Dee",
  [FOUND]: "Eve",
};

const h = vi.hoisted(() => ({
  state: null as unknown as MyAssistants,
  tagAsAssistant: vi.fn(async () => {}),
  changeAssistantTag: vi.fn(async () => ({})),
  disownAssistant: vi.fn(async () => ({ failed: [] })),
}));
vi.mock("@/hooks/useMyAssistants", () => ({ useMyAssistants: () => h.state }));
vi.mock("@/services/assistants", () => ({
  tagAsAssistant: h.tagAsAssistant,
  changeAssistantTag: h.changeAssistantTag,
  disownAssistant: h.disownAssistant,
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pubkeys: string[]) => new Map(pubkeys.map((pk) => [pk, { name: NAMES[pk] }])),
}));
vi.mock("@/components/Nip05Check", () => ({ Nip05Handle: () => null }));
vi.mock("@/components/messages/usePeopleSearch", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePeopleSearch: (q: string) => ({
    people:
      q.trim().length >= 2
        ? [
            { pubkey: FOUND, npub: "", name: "Eve" },
            { pubkey: ONE_TAG, npub: "", name: "Bea" },
          ]
        : [],
    searching: false,
  }),
}));

import { AssistantsTab } from "./AssistantsTab";

const rowOf = (name: string) => screen.getAllByTestId("row-assistant").find((r) => r.textContent?.includes(name))!;
const open = (name: string) => fireEvent.click(within(rowOf(name)).getAllByRole("button")[0]);

function show(state: Partial<MyAssistants> = {}) {
  h.state = {
    rows: [
      { pubkey: LOCAL, local: true, tags: [] },
      { pubkey: ONE_TAG, local: false, tags: ["brainstorm"] },
      { pubkey: TWO_TAGS, local: false, tags: ["brainstorm", "tapestry"] },
    ],
    settled: true,
    definitions: DEFS,
    duties: [
      {
        key: "30382:rank",
        group: "scores",
        level: "Exact",
        title: "rank",
        what: "a rank.",
        assistants: [ON_MAP_ONLY],
        entries: [["30382:rank", ON_MAP_ONLY]],
        at: 0,
        seenAt: [0],
      },
    ],
    mapStatus: "found",
    ...state,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AssistantsTab viewer={ME} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/settings?tab=assistants");
});

describe("a row's actions", () => {
  it("offers a one-tag row a change and a dispute, and never “Remove”", async () => {
    show();
    open("Bea");
    const row = rowOf("Bea");
    expect(within(row).queryByText(/remove/i)).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Change to My Tapestry Assistant" }));
    await waitFor(() => expect(h.changeAssistantTag).toHaveBeenCalledWith(ONE_TAG, "brainstorm", "tapestry", DEFS));
  });

  it("disputes every tag a row carries, and offers no change when it has both", async () => {
    show();
    open("Cy");
    const row = rowOf("Cy");
    expect(within(row).queryByTestId("button-change-tag")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Not my Assistant" }));
    await waitFor(() => expect(h.disownAssistant).toHaveBeenCalledWith(TWO_TAGS, ["brainstorm", "tapestry"], DEFS));
  });

  it("lets the reader tag their untagged local Assistant", async () => {
    show();
    open("Local Helper");
    fireEvent.click(within(rowOf("Local Helper")).getByRole("button", { name: "Tag: My Brainstorm Assistant" }));
    await waitFor(() => expect(h.tagAsAssistant).toHaveBeenCalledWith(LOCAL, "brainstorm", DEFS));
  });

  it("won't apply a tag whose definition wasn't found, and says why", () => {
    show({ definitions: { brainstorm: DEFS.brainstorm } });
    open("Bea");
    expect(within(rowOf("Bea")).getByRole("button", { name: "Change to My Tapestry Assistant" })).toBeDisabled();
    expect(within(rowOf("Bea")).getByText(/My Tapestry Assistant tag hasn’t been published yet/)).toBeInTheDocument();
  });
});

describe("tagging someone new", () => {
  it("finds profiles not already listed, and tags one", async () => {
    show();
    fireEvent.change(screen.getByTestId("input-assistant-search"), { target: { value: "ev" } });
    const found = screen.getAllByTestId("row-assistant-candidate");
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveTextContent("Eve");
    fireEvent.click(within(found[0]).getByRole("button", { name: "Tag: My Tapestry Assistant" }));
    await waitFor(() => expect(h.tagAsAssistant).toHaveBeenCalledWith(FOUND, "tapestry", DEFS));
  });

  it("tags an Assistant the Treasure Map names but the list doesn't", async () => {
    show();
    const section = screen.getByTestId("card-map-only-assistants");
    expect(section).toHaveTextContent("Dee");
    fireEvent.click(within(section).getByRole("button", { name: "Tag: My Brainstorm Assistant" }));
    await waitFor(() => expect(h.tagAsAssistant).toHaveBeenCalledWith(ON_MAP_ONLY, "brainstorm", DEFS));
  });
});
