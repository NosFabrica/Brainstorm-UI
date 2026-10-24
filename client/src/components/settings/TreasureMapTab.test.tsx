// @vitest-environment jsdom
/**
 * Settings › Treasure Map, read and pressed: the cards say who each category
 * goes to, and Edit → Assign to all → Save hands the edited Map to the save,
 * the reader's own Assistant naming the relays this deployment publishes to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";
import type { SaveOutcome } from "@/services/treasureMap";

const ME = "1".repeat(64);
const AVA = "a".repeat(64);
const BEA = "b".repeat(64);
const NAMES: Record<string, string> = { [AVA]: "Ava", [BEA]: "Bea" };
const NIP85 = "wss://nip85.test";

const h = vi.hoisted(() => ({
  event: undefined as NostrEvent | undefined,
  save: vi.fn(),
}));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderList: () => ({ event: h.event, loading: false, settled: true }),
}));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ taPubkey: AVA }) }));
vi.mock("@/hooks/useMyAssistants", () => ({
  useMyAssistants: () => ({
    rows: [
      { pubkey: AVA, local: true, tags: [] },
      { pubkey: BEA, local: false, tags: ["tapestry"] },
    ],
    settled: true,
    definitions: {},
    duties: [],
    mapStatus: "found",
  }),
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pubkeys: string[]) => new Map(pubkeys.map((pk) => [pk, { name: NAMES[pk] }])),
}));
vi.mock("@/services/treasureMap", () => ({ saveTreasureMap: h.save }));
vi.mock("@/services/nostr", () => ({ getNip85RelayUrl: () => NIP85 }));

import { TreasureMapTab } from "./TreasureMapTab";
import { tagRelays } from "@/config/tagging";

const mapOf = (tags: string[][]) =>
  ({ id: "e".repeat(64), pubkey: ME, created_at: 100, kind: 10040, tags, content: "", sig: "" }) as NostrEvent;
const card = (category: string) => screen.getByTestId(`card-category-${category}`);

function show(event: NostrEvent | undefined) {
  h.event = event;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TreasureMapTab viewer={ME} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.save.mockResolvedValue({ outcome: "saved", accepted: 3, total: 3 } satisfies SaveOutcome);
});

describe("the cards", () => {
  it("say who each category goes to: one Assistant, several, or no one", () => {
    show(
      mapOf([
        ["30382:rank", AVA, NIP85],
        ["3038x", BEA, ""],
        ["30392", AVA, NIP85],
      ]),
    );
    expect(card("scores")).toHaveTextContent("Mixed");
    expect(card("scores")).toHaveTextContent("· 2 Assistants");
    expect(card("lists")).toHaveTextContent("Assigned to");
    expect(card("lists")).toHaveTextContent("Ava");
    expect(card("concepts")).toHaveTextContent("Not assigned yet");
    expect(within(card("concepts")).getByText("Needs attention")).toBeInTheDocument();
  });

  it("show every entry behind a card, its relay, and which are backups", () => {
    show(
      mapOf([
        ["30382:rank", AVA, NIP85],
        ["30382:rank", BEA, ""],
      ]),
    );
    fireEvent.click(within(card("scores")).getByRole("button", { name: "Show details" }));
    const details = within(card("scores")).getByRole("region", { name: "Scores details" });
    expect(details).toHaveTextContent("30382:rank");
    expect(details).toHaveTextContent(NIP85);
    expect(details).toHaveTextContent("No relay");
    expect(within(details).getAllByText("Backup")).toHaveLength(1);
  });
});

describe("Edit mode", () => {
  it("assigns everything to the reader's own Assistant and saves the edited Map", async () => {
    const before = mapOf([["30382:rank", BEA, ""]]);
    show(before);
    fireEvent.click(screen.getByTestId("button-treasure-map-edit"));
    expect(screen.getByTestId("button-treasure-map-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("picker-all"));
    fireEvent.click(within(await screen.findByRole("list", { name: "Your Assistants" })).getByText("Ava"));
    expect(screen.getByText("All duties → Ava")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-treasure-map-save"));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    const [{ viewer, base, draft }] = h.save.mock.calls[0];
    expect(viewer).toBe(ME);
    expect(base).toBe(before);
    expect(draft.tags).toEqual([
      ["30382:rank", AVA, NIP85],
      ["3038x", AVA, NIP85],
      ["3039x", AVA, NIP85],
      ["39998", AVA, tagRelays()[0]],
      ["39999", AVA, tagRelays()[0]],
      ["*", AVA, ""],
    ]);
    await waitFor(() => expect(screen.getByTestId("button-treasure-map-edit")).toHaveTextContent("Edit"));
  });

  it("keeps Edit mode and the changes when a newer Map turned up", async () => {
    h.save.mockResolvedValue({ outcome: "changed" } satisfies SaveOutcome);
    show(mapOf([["30392", BEA, ""]]));
    fireEvent.click(screen.getByTestId("button-treasure-map-edit"));
    fireEvent.click(screen.getByTestId("picker-lists"));
    fireEvent.click(within(await screen.findByRole("list", { name: "Your Assistants" })).getByText("Ava"));
    fireEvent.click(screen.getByTestId("button-treasure-map-save"));
    expect(await screen.findByText(/Your Treasure Map changed since this page read it/)).toBeInTheDocument();
    expect(screen.getByTestId("button-treasure-map-edit")).toHaveTextContent("Editing");
    expect(within(card("lists")).getByText("Will be assigned to Ava")).toBeInTheDocument();
  });

  it("warns that saving with no Map found publishes a new one", () => {
    show(undefined);
    fireEvent.click(screen.getByTestId("button-treasure-map-edit"));
    expect(screen.getByText(/so saving will publish a new one/)).toBeInTheDocument();
  });
});
