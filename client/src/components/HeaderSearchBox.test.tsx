// @vitest-environment jsdom
/**
 * The header box is the home page's box: it asks for suggestions once typing pauses, cancels
 * what it no longer needs, draws filters as pills, offers recents and Browse under an empty
 * box, and sends a search to the home results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// People the typeahead offers — `suggestProfileHits` wraps each in the kind-0 it arrived as.
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const listingsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  suggestListings: (...args: unknown[]) => listingsMock(...args),
  suggestProfiles: (...args: unknown[]) => suggestMock(...args),
  suggestProfileHits: async (...args: unknown[]) =>
    ((await suggestMock(...args)) as { pubkey: string }[]).map((author) => ({
      event: {
        id: `k0-${author.pubkey}`,
        kind: 0,
        pubkey: author.pubkey,
        tags: [],
        content: "{}",
        created_at: 1,
        sig: "s",
      },
      author,
      rank: null,
    })),
}));
vi.mock("@/services/nostr", () => ({ fetchProfile: async () => null, fetchProfileMap: async () => new Map() }));
vi.mock("@/services/searchFaces", () => ({ fetchPillProfiles: async () => new Map() }));
vi.mock("@/services/api", () => ({ apiClient: new Proxy({}, { get: () => async () => null }) }));
const contentMock = vi.fn((_pks: string[]) => new Map<string, unknown>());
vi.mock("@/hooks/usePersonContent", () => ({ usePersonContent: (pks: string[]) => contentMock(pks) }));
const scoreMock = vi.fn((_pk: string): number | null => null);
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => (pk: string) => scoreMock(pk) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
const tagMatchesMock = vi.fn((_q: string): unknown[] => []);
// The search relay's answer. The real hook caps its own answer; the mock honours the cap it is asked for.
const carriersMock = vi.fn((_tags: unknown[]) => ({
  byPubkey: new Map<string, unknown[]>(),
  people: [] as unknown[],
  settled: true,
}));
const searchTagsAsked = vi.fn((_q: string, _opts: unknown) => {});
vi.mock("@/hooks/useSearchTags", () => ({
  useSearchTags: (q: string, opts: { max?: number }) => {
    searchTagsAsked(q, opts);
    const tags = q ? tagMatchesMock(q).slice(0, opts.max ?? 3) : [];
    return { tags, carriers: carriersMock(tags), settled: true };
  },
}));

import { HeaderSearchBox } from "./HeaderSearchBox";
import { nip19 } from "nostr-tools";
import { scopedSearchHref } from "@/lib/searchSyntax";
import { clearRecentSearches, pushRecentProfile, pushRecentQuery } from "@/lib/recentSearches";

const input = () => screen.getByTestId("input-home-search") as HTMLElement & { value: string };
const signalOf = (call: number) => (suggestMock.mock.calls[call][2] as { signal?: AbortSignal } | undefined)?.signal;
const dropdown = () => screen.queryByTestId("container-home-suggestions");

/** A keystroke, as the contenteditable field hears one. */
function type(value: string) {
  input().value = value;
  fireEvent.input(input());
}
function typeSlowly(word: string) {
  for (let i = 1; i <= word.length; i++) {
    type(word.slice(0, i));
    act(() => {
      vi.advanceTimersByTime(200);
    });
  }
}
const enter = () =>
  fireEvent(input(), new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));

beforeEach(() => {
  suggestMock.mockReset();
  suggestMock.mockImplementation(() => new Promise(() => {}));
  listingsMock.mockReset();
  listingsMock.mockResolvedValue([]);
  contentMock.mockReset();
  scoreMock.mockReset();
  scoreMock.mockReturnValue(null);
  tagMatchesMock.mockReset();
  tagMatchesMock.mockReturnValue([]);
  carriersMock.mockReset();
  carriersMock.mockReturnValue({ byPubkey: new Map(), people: [], settled: true });
  contentMock.mockImplementation(() => new Map());
  clearRecentSearches();
  window.history.replaceState({}, "", "/p/somebody");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("typing in the header search", () => {
  it("asks for suggestions once, for the whole word, when typing pauses", () => {
    render(<HeaderSearchBox />);
    typeSlowly("vitor");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(suggestMock.mock.calls[0][0]).toBe("vitor");
  });

  it("asks nobody while a filter prefix is typed — `doi:` is not a name", () => {
    render(<HeaderSearchBox />);
    typeSlowly("doi:10.1000");
    typeSlowly("sort:rec");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("completes a `from:` name with people, and picking one writes the key", async () => {
    const JOE = "e".repeat(64);
    suggestMock.mockResolvedValue([{ pubkey: JOE, npub: nip19.npubEncode(JOE), name: "Joe" }]);
    render(<HeaderSearchBox />);
    type("from:jo");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("jo");
    fireEvent.click(screen.getByTestId("home-suggestion-0"));
    expect(input().value).toContain(`from:${nip19.npubEncode(JOE)}`);
    expect(window.location.pathname).toBe("/p/somebody");
  });

  it("cancels a request that's under way when the next key lands", () => {
    render(<HeaderSearchBox />);
    type("vito");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(signalOf(0)?.aborted).toBe(false);
    type("vitor");
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("cancels it when the box goes away", () => {
    const { unmount } = render(<HeaderSearchBox />);
    type("vitor");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    unmount();
    expect(signalOf(0)?.aborted).toBe(true);
  });

  it("sends nothing when the box is closed during the pause, and it stays closed", () => {
    render(<HeaderSearchBox />);
    type("vitor");
    fireEvent.keyDown(input(), { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(dropdown()).toBeNull();
  });

  it("cancels a request when the box closes, and it stays closed", async () => {
    render(<HeaderSearchBox />);
    type("vitor");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.keyDown(input(), { key: "Escape" });
    await act(async () => {});
    expect(signalOf(0)?.aborted).toBe(true);
    expect(dropdown()).toBeNull();
  });

  const listing = (id: string, title: string, price = "21") => ({
    event: {
      id: id.repeat(64).slice(0, 64),
      kind: 30402,
      pubkey: "e".repeat(64),
      tags: [
        ["d", id],
        ["title", title],
        ["price", price, "USD"],
      ],
      content: "",
      created_at: 1,
      sig: "s",
    },
    author: null,
    rank: null,
  });
  async function shopFor(words: string) {
    render(<HeaderSearchBox />);
    type(words);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
  }

  // Google never lists single products in its suggestions — shopping is a
  // place you land on with everything for the word. So the box offers the
  // Shop page first (Benjamin, 2026-10-01: "a wider search and not a specific").
  it("offers the Shop page for the words, saying how many listings there are", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([listing("a", "Raw honey"), listing("b", "Honey soap"), listing("c", "Honeycomb")]);
    await shopFor("shop honey");

    // Asked for the thing, not the word that said "shop".
    expect(listingsMock.mock.calls[0]?.[0]).toBe("honey");
    const row = screen.getByTestId("home-shop-row");
    expect(row).toHaveTextContent("honey");
    // "3+": the box counts the listings NAMED by the words; the Shop page also
    // finds the ones that only mention them, so the number is a floor.
    expect(row).toHaveTextContent("Shop · 3+ listings");
    fireEvent.click(row);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?q=honey&t=shop");
  });

  it("adds one product as a shortcut only when its title starts with the words", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([listing("a", "Raw honey"), listing("b", "Honey", "10000")]);
    await shopFor("buy honey");

    const product = screen.getByTestId("home-product-suggestion-0");
    expect(product).toHaveTextContent("Honey");
    expect(product).toHaveTextContent("Listing · ");
    expect(screen.queryByTestId("home-product-suggestion-1")).toBeNull();
    // The Shop page comes first: browsing is the default, the product the shortcut.
    const rows = within(screen.getByTestId("home-product-suggestions")).getAllByRole("option");
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["home-shop-row", "home-product-suggestion-0"]);
    fireEvent.click(product);
    expect(window.location.pathname).toMatch(/^\/e\//);
  });

  it("offers no product when none is named by the words, and no Shop row when nothing is for sale", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([listing("a", "Raw honey")]);
    await shopFor("honey shop");
    expect(screen.getByTestId("home-shop-row")).toBeInTheDocument();
    expect(screen.queryByTestId("home-product-suggestion-0")).toBeNull();
    cleanup();

    listingsMock.mockResolvedValue([]);
    await shopFor("unicorn shop");
    expect(screen.queryByTestId("home-shop-row")).toBeNull();
    expect(screen.queryByTestId("home-product-suggestions")).toBeNull();
  });

  // The team, 2026-10-01: "developer" ended in two shop listings nobody asked
  // for. Products show when the words say shop, store, buy, price or for sale.
  it("lists no products for words that did not ask to shop", async () => {
    suggestMock.mockResolvedValue([]);
    render(<HeaderSearchBox />);
    type("satoshi");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    expect(listingsMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-product-suggestions")).toBeNull();
  });

  it("goes to the results right away on Enter", () => {
    render(<HeaderSearchBox />);
    type("vitor");
    enter();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?q=vitor");
  });

  it("a lone #topic goes straight to the topic page, not through the results page", () => {
    render(<HeaderSearchBox />);
    type("#bitcoin");
    enter();
    expect(window.location.pathname).toBe("/t/bitcoin");
  });

  it("a pasted npub or hex key goes straight to the profile", () => {
    const KEY = "a".repeat(64);
    const npub = nip19.npubEncode(KEY);
    render(<HeaderSearchBox />);
    type(npub);
    enter();
    expect(window.location.pathname).toBe(`/p/${npub}`);
    type(KEY);
    enter();
    expect(window.location.pathname).toBe(`/p/${npub}`);
  });

  it("draws a filter as a pill, and Enter searches the text as typed", () => {
    render(<HeaderSearchBox />);
    type("gm since:2026-01-02 ");
    const pill = input().querySelector("[data-token]") as HTMLElement | null;
    expect(pill?.dataset.token).toBe("since:2026-01-02");
    enter();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("gm since:2026-01-02");
  });
});

describe("the empty box", () => {
  const focusBox = () => {
    fireEvent.pointerDown(input());
    fireEvent.focus(input());
  };

  it("offers recent searches, and one re-runs on the results page", () => {
    pushRecentQuery("bitcoin meetups");
    render(<HeaderSearchBox />);
    focusBox();
    const row = screen.getByTestId("home-recent-0");
    expect(row).toHaveTextContent("bitcoin meetups");
    fireEvent.click(within(row).getByTestId("home-recent-run-0"));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("bitcoin meetups");
  });

  it("asks what a recent person publishes only once the panel is up", () => {
    const STACI = "5".repeat(64);
    pushRecentProfile({ pubkey: STACI, npub: nip19.npubEncode(STACI), label: "Staci" });
    render(<HeaderSearchBox />);
    expect(contentMock.mock.calls.flatMap(([pks]) => pks)).not.toContain(STACI);
    focusBox();
    expect(contentMock).toHaveBeenLastCalledWith([STACI]);
  });

  it("a recent row answers the keyboard: the field keeps focus on mousedown, the action rides the click", () => {
    pushRecentQuery("bitcoin meetups");
    render(<HeaderSearchBox />);
    focusBox();
    const run = screen.getByTestId("home-recent-run-0");
    // mousedown alone does nothing but keep the field's focus…
    expect(fireEvent.mouseDown(run)).toBe(false);
    expect(window.location.pathname).toBe("/p/somebody");
    // …and Enter or Space on the focused button is a click.
    fireEvent.click(run);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("bitcoin meetups");
  });

  it("offers the Browse row, and a chip opens that vertical", () => {
    render(<HeaderSearchBox />);
    focusBox();
    fireEvent.click(screen.getByTestId("browse-shop"));
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?t=shop");
  });
});

describe("what a suggested person publishes", () => {
  const STACI = "5".repeat(64);
  const STACI_NPUB = nip19.npubEncode(STACI);
  const shop = { key: "shop", label: "Shop", tab: "shop", liveNow: false };
  beforeEach(() => {
    contentMock.mockImplementation(
      (pks: string[]) => new Map(pks.map((pk) => [pk, pk === STACI ? { chips: [shop] } : undefined])),
    );
    suggestMock.mockResolvedValue([{ pubkey: STACI, npub: STACI_NPUB, name: "Staci" }]);
  });

  it("a suggested person wears chips linking to their scoped search, on a row that is not a button", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    const row = screen.getByTestId("home-suggestion-0");
    expect(row.tagName).toBe("DIV");
    expect(row).toHaveAttribute("role", "option");
    const chip = screen.getByTestId("person-content-chip-shop");
    expect(chip.getAttribute("href")).toBe(scopedSearchHref(STACI, "shop"));
    expect(chip).toHaveAttribute("aria-label", "Staci's shop");
    expect(chip.closest("button")).toBeNull();
  });

  it("picking the person opens their profile", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    fireEvent.click(screen.getByTestId("home-suggestion-0"));
    expect(window.location.pathname).toBe(`/p/${STACI_NPUB}`);
  });

  it('"staci shop" looks Staci up and offers her shop first', async () => {
    render(<HeaderSearchBox />);
    type("staci shop");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    expect(suggestMock.mock.calls.at(-1)?.[0]).toBe("staci");
    const row = screen.getByTestId("home-intent-row");
    expect(row).toHaveTextContent("Staci's shop");
    fireEvent.click(row);
    expect(dropdown()).toBeNull();
    expect(window.location.search).toMatch(/&t=shop$/);
  });

  it("a chip tap closes the list and lands on the scoped tab", async () => {
    render(<HeaderSearchBox />);
    type("staci");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    fireEvent.click(screen.getByTestId("person-content-chip-shop"));
    expect(dropdown()).toBeNull();
    expect(window.location.search).toMatch(/&t=shop$/);
  });
});

// The team, 2026-10-01, with Google's autocomplete as the reference: we cannot
// know whether "developer" means the tag or a person, so the popup offers each
// reading once, as its own kind of row, and the reader picks. The tag's people
// are behind the tag row — a people row is someone whose name matched.
describe("a query that matches a tag", () => {
  const TAG_AUTHOR = "9".repeat(64);
  const tagOf = (slug: string, name: string, people = 5) => ({
    key: `39999:${TAG_AUTHOR}:${slug}`,
    authorPubkey: TAG_AUTHOR,
    slug,
    name,
    people,
    vouches: 2,
    sharesName: 0,
    unverified: false,
  });
  const human = tagOf("verified-human", "Verified Human");
  const pk = (c: string) => c.repeat(64);
  const person = (c: string, name: string) => ({ pubkey: pk(c), npub: nip19.npubEncode(pk(c)), name });

  async function open(query: string) {
    render(<HeaderSearchBox />);
    type(query);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
  }

  it("offers the tag as its own row and lists only the people whose name matched", async () => {
    tagMatchesMock.mockReturnValue([human]);
    // Were the box still asking who carries the tag, these two would lead the list.
    carriersMock.mockReturnValue({
      byPubkey: new Map([
        [pk("a"), [human]],
        [pk("b"), [human]],
      ]),
      people: [
        { ...person("a", "Avi"), applications: 1, addedAt: 0 },
        { ...person("b", "Bill"), applications: 1, addedAt: 0 },
      ],
      settled: true,
    });
    suggestMock.mockResolvedValue([person("c", "Human Verifier")]);
    await open("verified human");

    expect(screen.getByTestId("home-tag-suggestion")).toHaveTextContent("Verified Human");
    expect(screen.getByTestId("home-suggestion-name-0")).toHaveTextContent("Human Verifier");
    expect(screen.queryByTestId("home-suggestion-1")).toBeNull();
    expect(within(dropdown()!).queryAllByTestId(/^person-tag-chip-/)).toHaveLength(0);
  });

  // A popup is read in a glance, above a phone keyboard: two tags, six people.
  it("offers at most two tags and six people", async () => {
    tagMatchesMock.mockReturnValue([tagOf("dev", "Dev"), tagOf("developer", "Developer"), tagOf("devrel", "DevRel")]);
    suggestMock.mockResolvedValue(["a", "b", "c", "d", "e", "f", "1", "2"].map((x) => person(x, `Dev ${x}`)));
    await open("dev");

    expect(screen.getAllByTestId("home-tag-suggestion").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Dev"),
      expect.stringContaining("Developer"),
    ]);
    expect(screen.getByTestId("home-suggestion-5")).toBeInTheDocument();
    expect(screen.queryByTestId("home-suggestion-6")).toBeNull();
  });

  // Tag rows used to wait on a walk of the hub's whole catalogue, about 25
  // seconds. The search relay answers by the words, after the typing pause.
  it("asks the search relay for the tags, lists only, once the typing pauses", async () => {
    searchTagsAsked.mockClear();
    tagMatchesMock.mockReturnValue([human]);
    suggestMock.mockResolvedValue([]);
    await open("verified human");

    expect(screen.getByTestId("home-tag-suggestion")).toHaveTextContent("Verified Human");
    const [words, opts] = searchTagsAsked.mock.calls.at(-1)!;
    expect(words).toBe("verified human");
    expect(opts).toMatchObject({ pov: "nosfabrica", max: 2 });
    expect((opts as { members?: boolean }).members ?? false).toBe(false);
    expect((opts as { pauseMs?: number }).pauseMs).toBeGreaterThan(0);
  });

  it("the tag row opens the tag's page — everyone who carries it", async () => {
    tagMatchesMock.mockReturnValue([human]);
    suggestMock.mockResolvedValue([]);
    await open("verified human");
    fireEvent.click(screen.getByTestId("home-tag-suggestion"));
    expect(window.location.pathname).toBe(`/tags/${nip19.npubEncode(TAG_AUTHOR)}/verified-human`);
  });
});
