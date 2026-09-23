// @vitest-environment jsdom
/**
 * The box: pills over the value, and the two popups the Filters panel cannot express.
 * The value is always the plain text — every assertion here reads it back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { nip19 } from "nostr-tools";
import { SearchField } from "./SearchField";
import { forgetGroupNames } from "@/lib/nip29";

const suggestGroupsMock = vi.fn();
const nameGroupsMock = vi.fn();
vi.mock("@/services/groups", () => ({
  suggestGroups: (...a: unknown[]) => suggestGroupsMock(...a),
  nameGroups: (...a: unknown[]) => nameGroupsMock(...a),
}));

// The faces behind `from:`, `to:` and `observer:`. The real one asks the search relay under
// `include:spam` and the person's own write relays at once; here it answers from this map.
const profiles = new Map<string, { displayName?: string; picture?: string }>();
const pillProfilesMock = vi.fn((keys: string[]) =>
  Promise.resolve(new Map(keys.filter((k) => profiles.has(k)).map((k) => [k, profiles.get(k)]))),
);
vi.mock("@/services/searchFaces", () => ({
  fetchPillProfiles: (keys: string[]) => pillProfilesMock(keys),
}));
vi.mock("@/lib/profileSearch", () => ({
  getDisplayLabel: (p: { displayName?: string }) => p.displayName ?? "",
}));

const JOE = "e".repeat(64);
const npub = nip19.npubEncode(JOE);

/** The box, and the keystroke a contenteditable understands. */
const box = () => screen.getByTestId("search-field") as HTMLElement & { value: string };
function type(text: string) {
  const el = box();
  el.value = text;
  fireEvent.input(el);
}

/** Typing, with the caret left at the end of what was typed — on the word, as a keyboard leaves it. */
function typeAtEnd(text: string) {
  const el = box();
  el.value = text;
  const last = el.lastChild as Node;
  const range = document.createRange();
  range.setStart(last, last.nodeType === 3 ? (last.textContent ?? "").length : last.childNodes.length);
  range.collapse(true);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.input(el);
}

function mount(props: Partial<Parameters<typeof SearchField>[0]> = {}) {
  const onChange = vi.fn();
  const onEnter = vi.fn();
  const view = render(<SearchField value="" onChange={onChange} onEnter={onEnter} {...props} />);
  return { onChange, onEnter, view };
}

beforeEach(() => {
  cleanup();
  profiles.clear();
  forgetGroupNames();
  suggestGroupsMock.mockReset().mockResolvedValue([]);
  nameGroupsMock.mockReset().mockResolvedValue(0);
  pillProfilesMock.mockClear();
});

describe("pills over the value", () => {
  it("draws a token as a pill and keeps the value as typed", () => {
    mount({ value: "gm #nostr since:2026-01-02" });
    expect(box().value).toBe("gm #nostr since:2026-01-02");
    const pills = box().querySelectorAll("[data-token]");
    expect([...pills].map((p) => (p as HTMLElement).dataset.token)).toEqual(["#nostr", "since:2026-01-02"]);
  });

  it("the day pill respells the ISO day the reader's way, and says which second it bounds", () => {
    mount({ value: "until:2026-03-04" });
    const pill = box().querySelector('[data-type="date"]') as HTMLElement;
    expect(pill.textContent).toContain("2026");
    expect(pill.title).toContain("written up to 23:59");
  });

  it("a person pill draws a skeleton until the name lands — never the key", async () => {
    mount({ value: `from:${npub}` });
    expect(box().textContent).not.toContain("npub1");
    expect(box().querySelector('[aria-label="Loading who this is"]')).not.toBeNull();
    await waitFor(() => expect(pillProfilesMock).toHaveBeenCalledWith([JOE]));
    // Nobody had a kind-0 for them, so the skeleton stays — and the key still never shows.
    expect(box().textContent).not.toContain("npub1");
  });

  it("the name and face replace it in place once they arrive", async () => {
    profiles.set(JOE, { displayName: "Joe Martin", picture: "https://img/joe.jpg" });
    mount({ value: `from:${npub}` });
    await waitFor(() => expect(box().textContent).toContain("Joe Martin"));
    expect(box().querySelector("img")?.getAttribute("src")).toBe("https://img/joe.jpg");
  });

  // `observer:` is a person too — the difference is only what is being asked about them.
  it("the observer pill resolves to a name and a face, and says whose eyes these are", async () => {
    profiles.set(JOE, { displayName: "Joe Martin", picture: "https://img/joe.jpg" });
    mount({ value: `observer:${JOE}` });
    await waitFor(() => expect(pillProfilesMock).toHaveBeenCalledWith([JOE]));
    const pill = box().querySelector('[data-type="observer"]') as HTMLElement;
    await waitFor(() => expect(pill.textContent).toContain("Joe Martin"));
    expect(pill.textContent).toContain("ranked as");
    expect(pill.querySelector("img")?.getAttribute("src")).toBe("https://img/joe.jpg");
    expect(pill.title).toContain("Joe Martin's");
  });

  it("an observer nobody has a profile for keeps the short key — better than a pill that says nothing", async () => {
    mount({ value: `observer:${JOE}` });
    await waitFor(() => expect(pillProfilesMock).toHaveBeenCalledWith([JOE]));
    const pill = box().querySelector('[data-type="observer"]') as HTMLElement;
    expect(pill.textContent).toContain("npub1");
  });

  it("asks for a key once, however often the box re-renders", async () => {
    const { view } = mount({ value: `from:${npub}` });
    await waitFor(() => expect(pillProfilesMock).toHaveBeenCalledTimes(1));
    view.rerender(<SearchField value={`from:${npub} gm`} onChange={() => {}} onEnter={() => {}} />);
    view.rerender(<SearchField value={`from:${npub} gm bye`} onChange={() => {}} onEnter={() => {}} />);
    expect(pillProfilesMock).toHaveBeenCalledTimes(1);
  });

  it("a scope pill says what is actually asked, not only what was typed", () => {
    mount({ value: "isbn:978-0593330005" });
    const pill = box().querySelector('[data-type="scope"]') as HTMLElement;
    expect(pill.textContent).toContain("978-0593330005");
    expect(pill.title).toContain("isbn:9780593330005");
    expect(pill.title).toContain("book");
  });

  // A bare 30023 is a fact about the protocol, not an answer to "what did I just filter to" —
  // so the pill says the word where this app has one, the way a group pill says a room's name
  // over its id.
  it("a kind pill says what the kind IS, and spec: keeps the word it was typed as", () => {
    mount({ value: "kind:30023 spec: kind:31999" });
    const pills = [...box().querySelectorAll('[data-type="kind"]')] as HTMLElement[];
    expect(pills.map((p) => p.textContent?.replace("×", "").trim())).toEqual([
      "kind:articles",
      "specs",
      "kind:31999",
    ]);
    expect(pills[0].title).toBe("kind:30023 — only articles (kind 30023)");
    expect(pills[1].title).toBe("spec: — only specs (kind 30817)");
    // No word for it here, so the number stands and the hover says no more than it can.
    expect(pills[2].title).toBe("kind:31999 — only events of kind 31999");
  });

  it("the ranking tokens pill too, where the relay's own field leaves them as bare text", () => {
    mount({ value: "sort:recent include:spam filter:rank:gte:50" });
    expect([...box().querySelectorAll("[data-token]")].map((p) => (p as HTMLElement).dataset.type))
      .toEqual(["sort", "lens", "floor"]);
  });

  it("a pill's × splices its token out, taking one adjoining space with it", () => {
    const { onChange } = mount({ value: "gm #nostr bye" });
    fireEvent.mouseDown(box().querySelector("[data-remove]") as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith("gm bye");
  });

  it("a token being typed is still text; it pills once the caret leaves", () => {
    const { onChange } = mount({ value: "" });
    type("#bit");
    expect(box().querySelectorAll("[data-token]")).toHaveLength(0);
    type("#bit ");
    expect(box().querySelectorAll("[data-token]")).toHaveLength(1);
    expect(onChange).toHaveBeenLastCalledWith("#bit ");
  });

  it("Enter is the page's, not the browser's — no line break lands in the value", () => {
    const { onEnter } = mount({ value: "gm" });
    fireEvent(box(), new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
    expect(onEnter).toHaveBeenCalled();
    expect(box().value).toBe("gm");
  });

  // A soft keyboard's action key commits text and submits in ONE event, so React has not
  // re-rendered when Enter fires. Without the value riding along, the page searches for
  // whatever was in the box before the last keystroke — on a fresh box, nothing at all.
  it("Enter carries the value the same event just typed", () => {
    const { onEnter } = mount({ value: "" });
    fireEvent(box(), new InputEvent("beforeinput", { inputType: "insertText", data: "gm\n", bubbles: true, cancelable: true }));
    expect(box().value).toBe("gm");
    expect(onEnter).toHaveBeenCalledWith("gm");
  });

  // Space finished a token and Enter did not: the search ran on `kind:20` while the box still
  // drew it as a half-typed word. Every prefix the box pills, typed with the caret still on it.
  const note = nip19.noteEncode("a".repeat(64));
  it.each([
    ["#nostr", "tag"],
    [`from:${npub}`, "key"],
    [`to:${npub}`, "key"],
    [`from:${JOE}`, "key"],
    [`to:${note}`, "pointer"],
    ["since:2026-01-02", "date"],
    ["until:2026-01-02", "date"],
    ["kind:20", "kind"],
    ["spec:", "kind"],
    ["sort:recent", "sort"],
    ["include:spam", "lens"],
    ["filter:rank:gte:50", "floor"],
    [`observer:${npub}`, "observer"],
    ["trust:verified", "verified"],
    ["reach:follows", "reach"],
    ["reach:friends", "reach"],
    ["site:example.com", "scope"],
    ["isbn:978-0593330005", "scope"],
    ["geo:u4pruyd", "scope"],
    ["isan:0000-0000-3A8D-0000-Z-0000-0000-6", "scope"],
    ["doi:10.1000/182", "scope"],
    ["podcast:guid:abc", "scope"],
    ["podcast:item:guid:abc", "scope"],
    ["podcast:publisher:abc", "scope"],
    ["label:en", "label"],
    ["group:chachi-general", "group"],
  ])("Enter pills %s the way a space would", (tok, type_) => {
    const { onEnter } = mount({ value: "" });
    const el = box();
    el.focus();
    typeAtEnd(`gm ${tok}`);
    // Still being typed: no pill for it yet. A key or a pointer pills on sight — nobody types one.
    if (type_ !== "key" && type_ !== "pointer") expect(el.querySelector(`[data-type="${type_}"]`)).toBeNull();
    fireEvent(el, new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
    expect(onEnter).toHaveBeenCalledWith(`gm ${tok}`);
    expect([...el.querySelectorAll("[data-token]")].map((p) => (p as HTMLElement).dataset.token)).toEqual([tok]);
    expect(el.value).toBe(`gm ${tok}`);
  });

  it("a paste lands as plain text, not as markup", () => {
    const { onChange } = mount({ value: "" });
    const e = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    Object.defineProperty(e, "clipboardData", { value: { getData: () => "#nostr" } });
    box().dispatchEvent(e);
    expect(onChange).toHaveBeenLastCalledWith("#nostr");
  });
});

describe("the calendar under since:/until:", () => {
  it("opens on a half-typed day and writes the one that is picked", async () => {
    const { onChange } = mount({ value: "" });
    type("since:");
    await screen.findByTestId("search-field-picker");
    fireEvent.click(screen.getAllByTestId("search-field-day")[0]);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.lastCall?.[0])).toMatch(/^since:\d{4}-\d{2}-\d{2} $/);
  });

  it("the quick picks are absolute days — a saved url must not mean a different search tomorrow", async () => {
    const { onChange } = mount({ value: "" });
    type("since:");
    await screen.findByTestId("search-field-picker");
    fireEvent.click(screen.getAllByTestId("search-field-quick")[1]); // Last 7 days
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.lastCall?.[0])).toMatch(/^since:\d{4}-\d{2}-\d{2} $/);
  });

  // The caret has to land PAST the space after a picked token. Resting on its last character
  // is a token still being typed, so `drawable` holds it as text and the pill never appears.
  it("a day picked mid-query pills at once, with words already behind it", async () => {
    const { onChange } = mount({ value: "since: gm" });
    // Put the caret right after `since:`, where somebody typing it would have left it — the
    // grid opens on the token the caret is IN, and `gm` sits behind it.
    const node = box().firstChild as Text;
    const range = document.createRange();
    range.setStart(node, 6);
    range.collapse(true);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.click(box());
    await screen.findByTestId("search-field-picker");
    fireEvent.click(screen.getAllByTestId("search-field-day")[0]);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = String(onChange.mock.lastCall?.[0]);
    expect(next).toMatch(/^since:\d{4}-\d{2}-\d{2} gm$/);
    expect(box().querySelectorAll('[data-type="date"]')).toHaveLength(1);
  });

  it("closes once the day is whole, and says so to the page", async () => {
    const onPickerChange = vi.fn();
    mount({ value: "", onPickerChange });
    type("since:2026-02-3");
    await screen.findByTestId("search-field-picker");
    await waitFor(() => expect(onPickerChange).toHaveBeenLastCalledWith(true));
    type("since:2026-02-28");
    await waitFor(() => expect(screen.queryByTestId("search-field-picker")).toBeNull());
    expect(onPickerChange).toHaveBeenLastCalledWith(false);
  });

  it("a day that does not exist keeps the grid open rather than writing a bound", async () => {
    mount({ value: "" });
    type("since:2026-02-31");
    await screen.findByTestId("search-field-picker");
    expect(box().querySelectorAll('[data-type="date"]')).toHaveLength(0);
  });
});

describe("the group picker under group:", () => {
  it("asks for what was typed and writes the id, not the name", async () => {
    suggestGroupsMock.mockResolvedValue([
      { id: "chachi-general", host: "a".repeat(64), name: "General", about: "the main room", picture: "" },
    ]);
    const { onChange } = mount({ value: "" });
    type("group:gen");
    const row = await screen.findByTestId("search-field-group");
    expect(row).toHaveTextContent("General");
    expect(suggestGroupsMock).toHaveBeenCalledWith("gen");
    fireEvent.click(row);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("group:chachi-general "));
  });

  // Enter pills the word it lands on — but not a partial the picker is about to replace: that
  // drew `group:gen` for a moment and asked the network to name a group called "gen".
  it("Enter on a row writes the pick, without first pilling the partial", async () => {
    suggestGroupsMock.mockResolvedValue([
      { id: "chachi-general", host: "a".repeat(64), name: "General", about: "the main room", picture: "" },
    ]);
    const { onChange, onEnter } = mount({ value: "" });
    box().focus();
    // Keystrokes, not a restore: a restore draws every pill and names them, which is not typing.
    const el = box();
    el.textContent = "group:gen";
    const range = document.createRange();
    range.setStart(el.firstChild as Text, 9);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent.input(el);
    await screen.findByTestId("search-field-group");
    expect(nameGroupsMock).not.toHaveBeenCalled();
    fireEvent(box(), new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("group:chachi-general "));
    expect(nameGroupsMock.mock.calls.flat(2)).not.toContain("gen");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("`group:` alone is not a match-all over every room on the network", async () => {
    mount({ value: "" });
    type("group:");
    await screen.findByTestId("search-field-picker");
    expect(suggestGroupsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-field-picker")).toHaveTextContent("Type a few letters");
  });

  it("two rooms sharing an id are warned about rather than merged", async () => {
    suggestGroupsMock.mockResolvedValue([
      { id: "general", host: "a".repeat(64), name: "General", about: "", picture: "", ambiguous: true },
      { id: "general", host: "b".repeat(64), name: "General elsewhere", about: "", picture: "", ambiguous: true },
    ]);
    mount({ value: "" });
    type("group:gen");
    await screen.findAllByTestId("search-field-group");
    expect(screen.getAllByText("shared id")).toHaveLength(2);
  });

  it("a group pill from a url asks what the room is called", async () => {
    mount({ value: "group:abc" });
    await waitFor(() => expect(nameGroupsMock).toHaveBeenCalledWith(["abc"]));
  });
});

describe("what running it in a browser caught", () => {
  it("a pill fits inside the line box, so the bar cannot grow when a token forms", () => {
    // 14px text on a 20px line inside a 1px border is a 22px pill, which fits the field's
    // 24.8px line box with room to spare. Vertical padding or margin would put it OVER that
    // line box — an inline-flex box contributes its margin box to the line's height — and the
    // bar would get taller the moment a pill appeared. Measured in a browser: the bar is 54.8px
    // empty, with plain words, and with pills. (jsdom has no layout, so the class is the assert.)
    mount({ value: "#nostr since:2026-01-02" });
    const pills = [...box().querySelectorAll("[data-token]")] as HTMLElement[];
    expect(pills.length).toBeGreaterThan(0);
    for (const pill of pills) {
      expect(pill.className).toContain("leading-5");
      expect(pill.className).not.toMatch(/(^|\s)!?-?(my|mt|mb|py|pt|pb)-/);
    }
  });

  // The left padding is cut back only for a pill that LEADS with a face — a round face fills a
  // rounded corner by itself, where square text needs the room. `from:`, `to:` and `observer:`
  // all draw their prefix first, and cutting theirs put the prefix 3px from the edge where
  // every other pill's text sits at 9px.
  it("only a pill that leads with a face cuts its left padding", () => {
    mount({ value: `from:${npub} to:${npub} observer:${JOE} ${npub}` });
    const pills = [...box().querySelectorAll("[data-token]")] as HTMLElement[];
    const [from, to, observer, bare] = pills;
    expect(from.dataset.token).toContain("from:");
    for (const textFirst of [from, to, observer]) {
      expect(textFirst.firstElementChild?.tagName).toBe("SPAN");
      expect(textFirst.className).not.toContain("!pl-0.5");
    }
    // A bare key has no prefix, so its face is first and the cut is right.
    expect(bare.firstElementChild?.tagName).toBe("IMG");
    expect(bare.className).toContain("!pl-0.5");
  });

  it("the neutral pill is outlined like the tinted ones", () => {
    // `tone("slate")` fills with slate-100 and outlines with slate-200 — one step apart, which
    // reads as no outline at all beside the other tones' pale -50 tint under a -200 border.
    mount({ value: `from:${npub}` });
    expect((box().querySelector('[data-type="key"]') as HTMLElement).className).toContain("border-slate-300");
  });

  it("stays left-aligned inside a centered column", () => {
    // An <input> ignores an inherited `text-align` (the UA stylesheet pins it to `start`); a
    // contenteditable does not, so the hero's `text-center` centered the query when the box
    // became one. jsdom applies no stylesheet, so the class is what there is to assert.
    const { view } = mount({ value: "bitcoin" });
    expect(view.container.querySelector(".text-left")).not.toBeNull();
  });

  it("keeps the space after a pill — the next word must not glue itself on", () => {
    const { onChange } = mount({ value: "" });
    type("#nostr ");
    type("#nostr label:review/app");
    expect(onChange).toHaveBeenLastCalledWith("#nostr label:review/app");
    // Under the default whitespace collapsing the browser drops that trailing space and the
    // value comes back `#nostrlabel:review/app`, so the box declares `white-space: pre-wrap`.
    // (jsdom applies no stylesheet, so the class is what there is to assert.)
    expect(box().className).toContain("whitespace-pre-wrap");
  });
});
