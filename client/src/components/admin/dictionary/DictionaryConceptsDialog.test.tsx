/**
 * Admin's "Add dictionary concepts…": what the user already holds, the
 * publish, and a server that doesn't have the endpoint yet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";

const { COMMUNITY, publish } = vi.hoisted(() => ({
  COMMUNITY: `39998:${"b".repeat(64)}:github-accounts`,
  publish: vi.fn(),
}));
const USER = "1".repeat(64);
const TA = "2".repeat(64);

vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));
// The house observer (HTTP) and its 10040: no Assistant of its own.
vi.mock("@/lib/houseObserverQuery", () => ({
  houseObserverQuery: { queryKey: ["house-observer"], queryFn: async () => "0".repeat(64), staleTime: Infinity },
}));
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: async () => undefined }));
// The relay read of the headers and copies, which lands them in the store (hooks/useDictionaryEntries).
const readHeaders = vi.hoisted(() => vi.fn());
vi.mock("@/services/dictionary", async (orig) => ({
  ...(await orig<typeof import("@/services/dictionary")>()),
  readDictionaryHeaders: (...a: unknown[]) => readHeaders(...a),
}));
vi.mock("@/services/api", async (orig) => {
  const actual = await orig<typeof import("@/services/api")>();
  return { ...actual, apiClient: { publishDictionaryConcepts: (...a: unknown[]) => publish(...a) } };
});

import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { DictionaryUnavailableError } from "@/services/api";
import { DictionaryConceptsDialog } from "./DictionaryConceptsDialog";

let n = 0;
/** The headers a read finds: the community's, and the Assistant's copy when it holds one. */
const headers = (source: "community" | "assistant") => {
  const header = (pubkey: string, tags: string[][]) =>
    ({
      id: (++n).toString(16).padStart(64, "0"),
      kind: 39998,
      pubkey,
      created_at: 100 + n,
      content: "",
      sig: "s",
      tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
    }) as NostrEvent;
  const found = [header("b".repeat(64), [])];
  if (source === "assistant") found.push(header(TA, [["b", COMMUNITY, "pointer"]]));
  return found;
};
const held: NostrEvent[] = [];
const answer = (source: "community" | "assistant") =>
  readHeaders.mockImplementation(async () => headers(source).map((e) => (held.push(e), eventStore.add(e))));

const open = () =>
  renderWithProviders(<DictionaryConceptsDialog pubkey={USER} taPubkey={TA} name="Dee" open onOpenChange={() => {}} />);

const realVerify = eventStore.verifyEvent;
beforeEach(() => {
  eventStore.verifyEvent = undefined;
  __resetAsks();
  for (const e of held.splice(0)) eventStore.remove(e);
  publish.mockReset();
  readHeaders.mockReset();
  return () => {
    eventStore.verifyEvent = realVerify;
  };
});

describe("DictionaryConceptsDialog", () => {
  it("shows which concepts the user holds, read for them and their Assistant", async () => {
    answer("community");
    open();
    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("GitHub Accounts")).toBeInTheDocument();
    // Headers and copies only — which concepts they hold needs no items — from them, their Assistant and the house.
    // Over the concepts the Dictionary shows (hooks/useDictionaryConcepts).
    expect(readHeaders).toHaveBeenCalledWith([COMMUNITY], [USER, TA, "0".repeat(64)]);
  });

  it("asks the server to copy the configured concepts, and reports each", async () => {
    answer("community");
    publish.mockResolvedValue({
      observer: USER,
      signing_pubkey: TA,
      relay: "wss://dcosl.brainstorm.world",
      concepts: [{ community: COMMUNITY, local: `39998:${TA}:github-accounts`, event_id: "e", status: "published" }],
    });
    open();
    await userEvent.click(screen.getByTestId("dictionary-concepts-run"));
    expect(publish).toHaveBeenCalledWith(USER, [COMMUNITY]);
    expect(await screen.findByTestId("dictionary-concept-result")).toHaveTextContent("Added");
    expect(screen.getByTestId("dictionary-concepts-relay")).toHaveTextContent("wss://dcosl.brainstorm.world");
    // The relay is read again: the copy now exists.
    await waitFor(() => expect(readHeaders).toHaveBeenCalledTimes(2));
  });

  it("a server without the endpoint says so, with nothing to retry", async () => {
    answer("community");
    publish.mockRejectedValue(new DictionaryUnavailableError());
    open();
    await userEvent.click(screen.getByTestId("dictionary-concepts-run"));
    const alert = await screen.findByTestId("dictionary-concepts-error");
    expect(alert).toHaveTextContent("aren't available on this server yet");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("any other failure can be tried again", async () => {
    answer("assistant");
    publish.mockRejectedValue(new Error("relay refused"));
    open();
    expect(await screen.findByText("Added by their Assistant")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("dictionary-concepts-run"));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
