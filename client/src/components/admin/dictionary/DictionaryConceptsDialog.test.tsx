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

vi.mock("@/config/dictionary", () => ({ DICTIONARY_CONCEPTS: [COMMUNITY] }));
vi.mock("@/services/dictionary", () => ({ loadDictionary: vi.fn() }));
vi.mock("@/services/api", async (orig) => {
  const actual = await orig<typeof import("@/services/api")>();
  return { ...actual, apiClient: { publishDictionaryConcepts: (...a: unknown[]) => publish(...a) } };
});

import { loadDictionary } from "@/services/dictionary";
import { DictionaryUnavailableError } from "@/services/api";
import { DictionaryConceptsDialog } from "./DictionaryConceptsDialog";

const entry = (source: string | null) => ({
  communityCoordinate: COMMUNITY,
  resolved: source ? { source, governing: { plural: "GitHub Accounts" } } : null,
  inDictionary: source === "assistant",
  items: [],
});

const open = () =>
  renderWithProviders(<DictionaryConceptsDialog pubkey={USER} taPubkey={TA} name="Dee" open onOpenChange={() => {}} />);

beforeEach(() => {
  publish.mockReset();
  vi.mocked(loadDictionary).mockReset();
});

describe("DictionaryConceptsDialog", () => {
  it("shows which concepts the user holds, read for them and their Assistant", async () => {
    vi.mocked(loadDictionary).mockResolvedValue([entry("community")] as never);
    open();
    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("GitHub Accounts")).toBeInTheDocument();
    expect(loadDictionary).toHaveBeenCalledWith({ pubkey: USER, taPubkey: TA });
  });

  it("asks the server to copy the configured concepts, and reports each", async () => {
    vi.mocked(loadDictionary).mockResolvedValue([entry("community")] as never);
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
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledTimes(2));
  });

  it("a server without the endpoint says so, with nothing to retry", async () => {
    vi.mocked(loadDictionary).mockResolvedValue([entry("community")] as never);
    publish.mockRejectedValue(new DictionaryUnavailableError());
    open();
    await userEvent.click(screen.getByTestId("dictionary-concepts-run"));
    const alert = await screen.findByTestId("dictionary-concepts-error");
    expect(alert).toHaveTextContent("aren't available on this server yet");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("any other failure can be tried again", async () => {
    vi.mocked(loadDictionary).mockResolvedValue([entry("assistant")] as never);
    publish.mockRejectedValue(new Error("relay refused"));
    open();
    expect(await screen.findByText("Added by their Assistant")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("dictionary-concepts-run"));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
