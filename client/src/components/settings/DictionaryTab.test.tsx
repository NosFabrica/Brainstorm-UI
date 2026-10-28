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
const USER = "1".repeat(64);
const TA = "2".repeat(64);
const TAPESTRY = "3".repeat(64);
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
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: () => ({ event: undefined, profile: { name: "Avi Burra" }, loading: false }),
}));
/** Authors in the reader's web of trust, as the rank read would decide. */
let trustedAuthors = new Set<string>([AVI]);
// A concept's items load on their own (useConceptItems); here they're the entry's.
vi.mock("@/hooks/useConceptItems", () => ({
  useConceptItems: (entry: DictionaryEntry | undefined) => ({ data: entry?.items ?? [], isPending: false }),
}));
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
vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: "1".repeat(64), taPubkey: TA, settled: true }),
}));
/** The reader's other Assistants, beside the local one (taPubkey), and whom their Treasure Map gives Concepts to. */
let otherAssistants: string[] = [];
let mapAssistant: string | null = null;
const NAMES: Record<string, string> = { [TA]: "Local Helper", [TAPESTRY]: "Tapestry Helper" };
vi.mock("@/hooks/useDictionaryManagers", async () => {
  const { managerOptions } = await import("@/lib/managedDictionary");
  return {
    useDictionaryManagers: (me: string | null) => {
      const assistants = [...(taPubkey ? [taPubkey] : []), ...otherAssistants];
      const options = me ? managerOptions({ me, assistants, local: taPubkey, designated: mapAssistant }) : [];
      return {
        options,
        pubkeys: options.map((o) => o.pubkey).sort(),
        settled: true,
        profiles: new Map(),
        nameOf: (pubkey: string) => NAMES[pubkey] ?? pubkey.slice(0, 8),
      };
    },
  };
});
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({ data: new Map() }),
  useAvailableTemplates: () => ({ data: [], isPending: false }),
  useDraftTemplateProblems: () => [],
}));

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
  otherAssistants = [];
  mapAssistant = null;
  trustedAuthors = new Set([AVI]);
  at("/settings?tab=dictionary");
});

const openCommunity = () => userEvent.click(screen.getByTestId("dictionary-available-toggle"));

describe("the list", () => {
  it("a concept the Assistant hasn't copied is offered as the community's", async () => {
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-empty")).toHaveTextContent("Local Helper hasn't added any concepts yet.");
    await openCommunity();
    const row = within(screen.getByTestId("dictionary-available")).getByTestId("dictionary-row-github-accounts");
    expect(row).toHaveTextContent("GitHub Accounts");
    expect(row).toHaveTextContent("1 item");
    expect(row).toHaveTextContent("Not in your Dictionary yet");
  });

  it("the community's concepts wait in a closed panel that says how many it holds", async () => {
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    const toggle = screen.getByTestId("dictionary-available-toggle");
    expect(toggle).toHaveTextContent("Shared by the community · 1");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("dictionary-row-github-accounts")).toBeNull();
    await openCommunity();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("dictionary-row-github-accounts")).toBeInTheDocument();
    await openCommunity();
    expect(screen.queryByTestId("dictionary-row-github-accounts")).toBeNull();
  });

  it("the panel stays open on the way to an entry and back", async () => {
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    await openCommunity();
    await userEvent.click(screen.getByTestId("dictionary-row-github-accounts"));
    expect(screen.getByTestId("dictionary-entry")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("link-dictionary-back"));
    expect(screen.getByTestId("dictionary-available-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("dictionary-row-github-accounts")).toBeInTheDocument();
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
    // The row reads the governing definition: titled by the username, the now-declared description its summary.
    expect(screen.getByTestId("dictionary-item-title")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dictionary-item-line")).toHaveTextContent("Vinney Cavallo");
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

describe("finding an item on an entry", () => {
  const second = {
    ...item,
    id: "7".repeat(64),
    created_at: 1_790_000_100,
    tags: [
      ["d", "abc-2"],
      ["z", COMMUNITY],
      ["description", "Alice Burton"],
      ["github-username", "abc"],
    ],
  };
  const stranger = {
    ...item,
    id: "8".repeat(64),
    pubkey: "f".repeat(64),
    tags: [
      ["d", "zed-3"],
      ["z", COMMUNITY],
      ["github-username", "zed-beep"],
    ],
  };
  beforeEach(() => {
    at(`/settings?tab=dictionary&concept=${encodeURIComponent(COMMUNITY)}`);
    entries = [{ ...entryOf(null), items: [item, second, stranger] }];
  });

  it("the filter box narrows the rows to the words typed, and the count says how many of all", async () => {
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-items-kicker")).toHaveTextContent("GitHub Accounts · 2");
    await userEvent.type(screen.getByTestId("dictionary-items-filter"), "vcav");
    expect(screen.getAllByTestId("dictionary-item")).toHaveLength(1);
    expect(screen.getByTestId("dictionary-item")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dictionary-items-kicker")).toHaveTextContent("GitHub Accounts · 1 of 2");
  });

  it("when only someone outside the web of trust matches, their row is shown rather than nothing", async () => {
    renderWithProviders(<DictionaryTab />);
    await userEvent.type(screen.getByTestId("dictionary-items-filter"), "zed");
    expect(screen.queryAllByTestId("dictionary-item")).toHaveLength(0);
    expect(screen.getByTestId("dictionary-items-none")).toHaveTextContent("No github accounts match");
    expect(screen.getByTestId("dictionary-item-outside")).toHaveTextContent("zed-beep");
  });

  it("sorts newest first by default, and A to Z or oldest on a tap", async () => {
    renderWithProviders(<DictionaryTab />);
    const titles = () => screen.getAllByTestId("dictionary-item-title").map((el) => el.textContent);
    expect(titles()).toEqual(["abc", "vcavallo"]);
    await userEvent.click(screen.getByTestId("dictionary-items-sort-oldest"));
    expect(titles()).toEqual(["vcavallo", "abc"]);
    await userEvent.click(screen.getByTestId("dictionary-items-sort-name"));
    expect(titles()).toEqual(["abc", "vcavallo"]);
    expect(screen.getByTestId("dictionary-items-sort-name")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the list's count", () => {
  it("counts only items from the web of trust", async () => {
    trustedAuthors = new Set();
    entries = [entryOf(null)];
    renderWithProviders(<DictionaryTab />);
    await openCommunity();
    expect(screen.getByTestId("dictionary-row-count")).toHaveTextContent("0 items");
  });
});

describe("Managed by", () => {
  const copyBy = (pubkey: string) =>
    header(pubkey, [
      ["description", "A list of github handles/accounts"],
      ["required", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
  /** An entry as loadDictionary reads it for the managers: each one's copy kept as a candidate. */
  const managedEntryOf = (copies: Record<string, HeaderEvent>): DictionaryEntry => {
    const resolved = resolveConcept({
      community,
      communityCoordinate: COMMUNITY,
      personal: copies[USER],
      assistant: copies[TA],
    });
    return {
      communityCoordinate: COMMUNITY,
      resolved,
      inDictionary: resolved?.source === "personal" || resolved?.source === "assistant",
      items: [item],
      candidates: { community, house: null, copies },
    };
  };
  const mineRow = () => within(screen.getByTestId("dictionary-mine")).queryByTestId("dictionary-row-github-accounts");

  it("shows the Treasure Map's Concepts Assistant by default: its copy, not yours", () => {
    otherAssistants = [TAPESTRY];
    mapAssistant = TAPESTRY;
    entries = [managedEntryOf({ [USER]: copyBy(USER), [TAPESTRY]: copyBy(TAPESTRY) })];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-managed-by")).toHaveTextContent("Managed by Tapestry Helper");
    expect(mineRow()).toHaveTextContent("Added by Tapestry Helper");
  });

  it("with no Concepts duty on the Map, the local Assistant's: your own copy isn't in it", () => {
    entries = [managedEntryOf({ [USER]: copyBy(USER) })];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-managed-by")).toHaveTextContent("Managed by Local Helper");
    expect(mineRow()).toBeNull();
    expect(screen.getByTestId("dictionary-empty")).toHaveTextContent("Local Helper hasn't added any concepts yet.");
  });

  it("picking You shows your own copies, and the URL and entry links keep the choice", async () => {
    entries = [managedEntryOf({ [USER]: copyBy(USER) })];
    renderWithProviders(<DictionaryTab />);
    await userEvent.click(screen.getByTestId("dictionary-managed-by"));
    await userEvent.click(screen.getByRole("button", { name: /^You/ }));
    expect(new URLSearchParams(window.location.search).get("managedBy")).toBe("me");
    expect(screen.getByTestId("dictionary-managed-by")).toHaveTextContent("Managed by You");
    expect(mineRow()).toHaveTextContent("Your own copy");
    expect(mineRow()).toHaveAttribute("href", expect.stringContaining("managedBy=me"));
  });

  it("all of your Assistants: each concept says how many of them hold it", () => {
    otherAssistants = [TAPESTRY];
    at("/settings?tab=dictionary&managedBy=all");
    entries = [managedEntryOf({ [USER]: copyBy(USER), [TAPESTRY]: copyBy(TAPESTRY) })];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-managed-by")).toHaveTextContent("Managed by All of your Assistants");
    expect(mineRow()).toHaveTextContent("Added by Tapestry Helper");
    expect(screen.getByTestId("chip-dictionary-support")).toHaveTextContent("1 of 2 Assistants");
  });

  it("a link naming someone who isn't one of your Assistants says so, and shows the default", () => {
    at(`/settings?tab=dictionary&managedBy=${"9".repeat(64)}`);
    entries = [managedEntryOf({})];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-managed-unknown")).toHaveTextContent("this is Local Helper’s Dictionary");
    expect(screen.getByTestId("dictionary-managed-by")).toHaveTextContent("Managed by Local Helper");
  });

  it("an entry under an Assistant still lets you withdraw your own version", () => {
    at(`/settings?tab=dictionary&concept=${encodeURIComponent(COMMUNITY)}`);
    entries = [managedEntryOf({ [USER]: copyBy(USER) })];
    renderWithProviders(<DictionaryTab />);
    expect(screen.getByTestId("dictionary-entry-not-added")).toHaveTextContent(
      "Local Helper hasn't added this concept to your Dictionary yet.",
    );
    expect(screen.getByTestId("dictionary-version-withdraw")).toBeInTheDocument();
  });
});
