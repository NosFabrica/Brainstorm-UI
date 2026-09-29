// @vitest-environment jsdom
/**
 * The header box is the home page's box: it asks for suggestions once typing pauses, cancels
 * what it no longer needs, draws filters as pills, offers recents and Browse under an empty
 * box, and sends a search to the home results.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("@/hooks/useTags", () => ({ useTagMatches: (q: string) => tagMatchesMock(q) }));
const carriersMock = vi.fn((_tags: unknown[]) => ({
  byPubkey: new Map<string, unknown[]>(),
  people: [] as unknown[],
  settled: true,
}));
vi.mock("@/hooks/useTagCarriers", () => ({ useTagCarriers: (tags: unknown[]) => carriersMock(tags) }));
// Each person's own tags — quiet chips on every row.
const personTagsMock = vi.fn((_pks: readonly string[]) => new Map<string, unknown[] | undefined>());
vi.mock("@/hooks/usePersonTags", () => ({ usePersonTags: (pks: readonly string[]) => personTagsMock(pks) }));

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
  personTagsMock.mockReset();
  personTagsMock.mockImplementation((pks) => new Map(pks.map((pk) => [pk, []])));
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

  it("a product title under the people opens the listing itself", async () => {
    suggestMock.mockResolvedValue([]);
    listingsMock.mockResolvedValue([
      {
        event: {
          id: "t".repeat(64),
          kind: 30402,
          pubkey: "e".repeat(64),
          tags: [
            ["d", "smiley"],
            ["title", "Satoshi Smiley T-shirt"],
            ["price", "21", "USD"],
          ],
          content: "",
          created_at: 1,
          sig: "s",
        },
        author: null,
        rank: null,
      },
    ]);
    render(<HeaderSearchBox />);
    type("satoshi");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    const row = screen.getByTestId("home-product-suggestion-0");
    expect(row).toHaveTextContent("Satoshi Smiley T-shirt");
    expect(row).toHaveTextContent("$21");
    fireEvent.click(row);
    expect(window.location.pathname).toMatch(/^\/e\/(nevent1|t{64})/);
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

describe("a query that matches a tag", () => {
  const TAG_AUTHOR = "9".repeat(64);
  const human = {
    key: `39999:${TAG_AUTHOR}:verified-human`,
    authorPubkey: TAG_AUTHOR,
    slug: "verified-human",
    name: "Verified Human",
    people: 2,
    vouches: 2,
    sharesName: 0,
    unverified: false,
  };
  const pk = (c: string) => c.repeat(64);
  const person = (c: string, name: string) => ({ pubkey: pk(c), npub: nip19.npubEncode(pk(c)), name });
  const carrier = (c: string, name: string) => ({ ...person(c, name), applications: 1, addedAt: 0 });
  const carriersOf = (people: ReturnType<typeof carrier>[]) => ({
    byPubkey: new Map(people.map((p) => [p.pubkey, [human]])),
    people,
    settled: true,
  });

  async function open(query: string) {
    render(<HeaderSearchBox />);
    type(query);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
  }

  it("leads with the tag's people, best first, each wearing the tag; a name match follows without one", async () => {
    tagMatchesMock.mockReturnValue([human]);
    carriersMock.mockReturnValue(carriersOf([carrier("b", "Bill"), carrier("a", "Avi")]));
    scoreMock.mockImplementation((p) => (p === pk("a") ? 0.9 : p === pk("b") ? 0.5 : null));
    suggestMock.mockResolvedValue([person("c", "Human Verifier"), person("a", "Avi")]);
    await open("verified human");
    const names = [0, 1, 2].map((i) => screen.getByTestId(`home-suggestion-name-${i}`).textContent);
    expect(names).toEqual(["Avi", "Bill", "Human Verifier"]);
    expect(screen.queryByTestId("home-suggestion-3")).toBeNull();
    const chip = within(screen.getByTestId("home-suggestion-0")).getByTestId("person-tag-chip-verified-human");
    expect(chip.getAttribute("href")).toBe(`/tags/${nip19.npubEncode(TAG_AUTHOR)}/verified-human`);
    expect(
      within(screen.getByTestId("home-suggestion-1")).getByTestId("person-tag-chip-verified-human"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("home-suggestion-2")).queryByTestId("person-tag-chip-verified-human")).toBeNull();
  });

  it("caps the tag's people at four so the names the relay found still make the list", async () => {
    tagMatchesMock.mockReturnValue([human]);
    carriersMock.mockReturnValue(carriersOf(["1", "2", "3", "4", "5", "6"].map((x) => carrier(x, `T${x}`))));
    suggestMock.mockResolvedValue(["a", "b", "c", "d", "e"].map((x) => person(x, `R${x}`)));
    await open("verified human");
    const names = [0, 1, 2, 3, 4, 5, 6].map((i) => screen.getByTestId(`home-suggestion-name-${i}`).textContent);
    expect(names.slice(0, 4).every((n) => n?.startsWith("T"))).toBe(true);
    expect(names.slice(4)).toEqual(["Ra", "Rb", "Rc"]);
    expect(screen.queryByTestId("home-suggestion-7")).toBeNull();
  });

  it("a chip tap keeps the field's focus, closes the list and opens the tag page", async () => {
    tagMatchesMock.mockReturnValue([human]);
    carriersMock.mockReturnValue(carriersOf([carrier("a", "Avi")]));
    suggestMock.mockResolvedValue([]);
    await open("verified human");
    input().focus();
    const chip = screen.getByTestId("person-tag-chip-verified-human");
    expect(fireEvent.mouseDown(chip)).toBe(false);
    fireEvent.click(chip);
    expect(dropdown()).toBeNull();
    expect(window.location.pathname).toBe(`/tags/${nip19.npubEncode(TAG_AUTHOR)}/verified-human`);
  });
});

describe("a person's own tags on their row", () => {
  const AUTHOR = "9".repeat(64);
  const pk = (c: string) => c.repeat(64);
  const own = (slug: string, applications: number) => ({
    key: `${AUTHOR}|${slug}`,
    authorPubkey: AUTHOR,
    slug,
    name: slug,
    applications,
    disputes: 0,
    asserters: [],
    selfDeclared: false,
    subjectDisagreed: false,
    counted: true,
    sharesName: 1,
    addedAt: 0,
  });
  const human = {
    key: `39999:${AUTHOR}:verified-human`,
    authorPubkey: AUTHOR,
    slug: "verified-human",
    name: "Verified Human",
    people: 2,
    vouches: 2,
    sharesName: 0,
    unverified: false,
  };

  it("a name search shows the person's tags quietly, most applied first", async () => {
    suggestMock.mockResolvedValue([{ pubkey: pk("a"), npub: nip19.npubEncode(pk("a")), name: "Nathan Day" }]);
    personTagsMock.mockImplementation(
      (pks) => new Map(pks.map((p) => [p, p === pk("a") ? [own("verified-human", 3), own("author", 1)] : []])),
    );
    render(<HeaderSearchBox />);
    type("nathan");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    const chips = within(screen.getByTestId("home-suggestion-0")).getAllByTestId(/^person-tag-chip-/);
    expect(chips.map((c) => c.getAttribute("data-testid"))).toEqual([
      "person-tag-chip-verified-human",
      "person-tag-chip-author",
    ]);
    for (const chip of chips) expect(chip).toHaveAttribute("data-emphasis", "quiet");
  });

  it("a tag search says the matched tag loudly and the rest quietly", async () => {
    tagMatchesMock.mockReturnValue([human]);
    carriersMock.mockReturnValue({
      byPubkey: new Map([[pk("a"), [human]]]),
      people: [{ pubkey: pk("a"), npub: nip19.npubEncode(pk("a")), name: "Nathan Day", applications: 3, addedAt: 0 }],
      settled: true,
    });
    personTagsMock.mockImplementation(
      (pks) => new Map(pks.map((p) => [p, p === pk("a") ? [own("author", 5), own("verified-human", 3)] : []])),
    );
    suggestMock.mockResolvedValue([]);
    render(<HeaderSearchBox />);
    type("verified human");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await act(async () => {});
    const chips = within(screen.getByTestId("home-suggestion-0")).getAllByTestId(/^person-tag-chip-/);
    expect(chips.map((c) => [c.getAttribute("data-testid"), c.getAttribute("data-emphasis")])).toEqual([
      ["person-tag-chip-verified-human", "loud"],
      ["person-tag-chip-author", "quiet"],
    ]);
  });
});
