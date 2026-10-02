/**
 * Settings › Dictionary: what's in the reader's Dictionary, what the
 * community shares that isn't yet, and one entry drawn from its governing
 * definition — the copy, not the community header, when the reader has one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import type { DictionaryEntry } from "@/services/dictionary";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const TA = "2".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1_790_000_000,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [
  ["description", "A list of github handles/accounts"],
  ["required", "github-username"],
]);
const item = {
  id: "9".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1_790_000_000,
  content: "",
  tags: [
    ["d", "vcavallo-1i6dn0p"],
    ["z", COMMUNITY],
    ["description", "Vinney Cavallo"],
    ["github-username", "vcavallo"],
  ],
};

let entries: DictionaryEntry[] = [];
let taPubkey: string | null = TA;
vi.mock("@/hooks/useDictionary", () => ({
  useDictionary: () => ({ data: entries, isPending: false, pubkey: "1".repeat(64), taPubkey }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ name: "Avi Burra" }) }));
/** Authors in the reader's web of trust, as the rank read would decide. */
let trustedAuthors = new Set<string>([AVI]);
vi.mock("@/hooks/useWotItems", () => ({
  useWotItems: <T extends { pubkey: string }>(items: T[]) => ({
    trusted: items.filter((i) => trustedAuthors.has(i.pubkey)),
    outside: items.filter((i) => !trustedAuthors.has(i.pubkey)),
    pending: false,
    source: "house",
    observer: "house",
  }),
}));

import { userEvent } from "@testing-library/user-event";
import { DictionaryTab } from "./DictionaryTab";

const entryOf = (copy: HeaderEvent | null): DictionaryEntry => {
  const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy });
  return {
    communityCoordinate: COMMUNITY,
    resolved,
    inDictionary: resolved?.source === "assistant",
    items: [item],
  };
};

const at = (url: string) => window.history.replaceState({}, "", url);

beforeEach(() => {
  taPubkey = TA;
  trustedAuthors = new Set([AVI]);
  at("/settings?tab=dictionary");
});

describe("the list", () => {
  it("a concept the Assistant hasn't copied is offered as the community's", () => {
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-empty")).toHaveTextContent("Your Assistant hasn't added any concepts yet.");
    const row = within(screen.getByTestId("dictionary-available")).getByTestId("dictionary-row-github-accounts");
    expect(row).toHaveTextContent("GitHub Accounts");
    expect(row).toHaveTextContent("1 item");
    expect(row).toHaveTextContent("Not in your Dictionary yet");
  });

  it("with no Assistant, says who adds concepts", () => {
    taPubkey = null;
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-empty")).toHaveTextContent("once you have one");
  });

  it("the Assistant's copy is in the Dictionary, agreeing with the community", () => {
    entries = [
      entryOf(
        header(TA, [
          ["description", "A list of github handles/accounts"],
          ["required", "github-username"],
          ["b", COMMUNITY, "pointer"],
        ]),
      ),
    ];
    renderWithProviders(<DictionaryTab />);
    const row = within(screen.getByTestId("dictionary-mine")).getByTestId("dictionary-row-github-accounts");
    expect(row).toHaveTextContent("Added by your Assistant");
    expect(row).toHaveTextContent("Agrees with the community");
    expect(screen.queryByTestId("dictionary-available")).toBeNull();
  });
});

describe("an entry", () => {
  beforeEach(() => at(`/settings?tab=dictionary&concept=${encodeURIComponent(COMMUNITY)}`));

  it("shows the copy's fields, not the community's, and says how they differ", () => {
    const edited = header(TA, [
      ["description", "A list of github handles/accounts"],
      ["required", "github-username"],
      ["optional", "description", "Who it belongs to"],
      ["b", COMMUNITY, "pointer"],
    ]);
    entries = [entryOf(edited)];
    renderWithProviders(<DictionaryTab />);
    const fields = screen.getByTestId("dictionary-fields");
    expect(fields).toHaveTextContent("github-username");
    expect(fields).toHaveTextContent("Who it belongs to");
    expect(screen.getByTestId("dictionary-provenance")).toHaveTextContent("differs from it in its fields");
    // The item row reads the governing fields: the username and, now declared, the description.
    expect(screen.getByTestId("dictionary-item")).toHaveTextContent("vcavallo · Vinney Cavallo");
  });

  it("the community's own definition names its author", () => {
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-provenance")).toHaveTextContent("Defined by Avi Burra");
    expect(screen.getByTestId("dictionary-item")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dictionary-item")).not.toHaveTextContent("Vinney Cavallo");
  });

  it("an unknown concept says so", () => {
    entries = [];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-entry-missing")).toBeInTheDocument();
  });

  it("shows only items from the reader's web of trust; the rest on request", async () => {
    const stranger = { ...item, id: "8".repeat(64), pubkey: "f".repeat(64), tags: [["github-username", "beep-boop"]] };
    entries = [{ ...entryOf(null), items: [item, stranger] }];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getAllByTestId("dictionary-item")).toHaveLength(1);
    expect(screen.queryByText("beep-boop")).toBeNull();
    const more = screen.getByTestId("dictionary-items-outside");
    expect(more).toHaveTextContent("Show 1 more from accounts outside your web of trust");
    await userEvent.click(more);
    expect(screen.getByTestId("dictionary-item-outside")).toHaveTextContent("beep-boop");
  });

  it("with nobody trusted, says so rather than 'no items'", () => {
    trustedAuthors = new Set();
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-items-none")).toHaveTextContent("None of these github accounts");
  });
});

describe("the list's count", () => {
  it("counts only items from the web of trust", () => {
    trustedAuthors = new Set();
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-row-count")).toHaveTextContent("0 items");
  });
});
