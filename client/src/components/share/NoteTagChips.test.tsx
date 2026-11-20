// @vitest-environment jsdom
/**
 * The tag row on an event's page reads and tags what the event is (issue
 * #334): an addressable event — a listing, an article, a DList item — by its
 * coordinate, so a tag survives its next edit; a note by its id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  read: vi.fn((..._a: unknown[]) => ({ data: { tags: [], mine: [], unverifiable: 0, trustUnverified: false } })),
  publish: vi.fn(async (_vars: unknown) => ({}) as { failedAt?: string }),
  toast: vi.fn(),
  apply: vi.fn((..._a: unknown[]) => ({ mutate: vi.fn(), mutateAsync: h.publish, isPending: false })),
  options: [] as unknown[],
  loading: false,
}));
vi.mock("@/hooks/useTags", () => ({
  useEventTags: (...a: unknown[]) => h.read(...a),
  useApplyEventTag: (...a: unknown[]) => h.apply(...a),
  usePickerTags: () => ({ data: h.loading ? undefined : h.options, isPending: h.loading }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));

import { inSentence, NoteTagChips, NoteTagRow } from "./NoteTagChips";

const ID = "7".repeat(64);
const LISTING = `30402:${"5".repeat(64)}:circular-hoodie`;

describe("NoteTagChips", () => {
  beforeEach(() => {
    h.read.mockClear();
    h.apply.mockClear();
    h.publish.mockClear();
    h.options = [];
    h.loading = false;
  });

  it("reads and tags an addressable event by its coordinate", () => {
    render(<NoteTagChips eventId={ID} address={LISTING} relayHint="wss://r.example" canTag />);
    expect(h.read).toHaveBeenCalledWith(ID, LISTING);
    expect(h.apply).toHaveBeenCalledWith(ID, "wss://r.example", { address: LISTING });
  });

  it("reads and tags a note by its id", () => {
    render(<NoteTagChips eventId={ID} relayHint="wss://r.example" canTag />);
    expect(h.read).toHaveBeenCalledWith(ID, undefined);
    expect(h.apply).toHaveBeenCalledWith(ID, "wss://r.example", undefined);
  });

  it("offers tags for posts first, then those mostly on people, and a test tag only when typed", async () => {
    Element.prototype.scrollIntoView = () => {};
    const tag = (slug: string, band: "content" | "profile", unverified = false) => ({
      key: `${"a".repeat(64)}|${slug}`,
      authorPubkey: "a".repeat(64),
      slug,
      name: slug,
      people: band === "profile" ? 9 : 0,
      vouches: 1,
      sharesName: 1,
      unverified,
      band,
    });
    h.options = [tag("developer", "profile"), tag("stoicism", "content"), tag("qa-note-1784", "content", true)];
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.click(screen.getByTestId("note-add-tag"));
    await screen.findByTestId("note-tag-search");
    expect(screen.getAllByTestId("note-tag-existing").map((e) => e.textContent)).toEqual(["stoicism"]);
    expect(screen.getAllByTestId("note-tag-for-people").map((e) => e.textContent)).toEqual(["developer"]);
    fireEvent.change(screen.getByTestId("note-tag-search"), { target: { value: "qa" } });
    expect(screen.getAllByTestId("note-tag-existing").map((e) => e.textContent)).toEqual(["qa-note-1784"]);
  });

  it("names what it tags: a Dictionary item as its list calls it, anything else a post", async () => {
    Element.prototype.scrollIntoView = () => {};
    const { unmount } = render(<NoteTagChips eventId={ID} address={LISTING} canTag noun="GitHub Account" />);
    expect(screen.getByTestId("note-add-tag")).toHaveTextContent("Tag this GitHub account");
    fireEvent.click(screen.getByTestId("note-add-tag"));
    expect(await screen.findByTestId("note-tag-search")).toHaveAttribute("placeholder", "Search or create a tag");
    unmount();
    render(<NoteTagChips eventId={ID} canTag />);
    expect(screen.getByTestId("note-add-tag")).toHaveTextContent("Tag this post");
  });

  it("chooses the tag named over a loose match in the group above it", async () => {
    Element.prototype.scrollIntoView = () => {};
    const tag = (slug: string, band: "content" | "profile") => ({
      key: `${"a".repeat(64)}|${slug}`,
      authorPubkey: "a".repeat(64),
      slug,
      name: slug,
      people: 1,
      vouches: 1,
      sharesName: 1,
      unverified: false,
      band,
    });
    h.options = [tag("Cool Web of Trust", "content"), tag("bot", "profile")];
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.click(screen.getByTestId("note-add-tag"));
    fireEvent.change(await screen.findByTestId("note-tag-search"), { target: { value: "bot" } });
    expect(screen.queryAllByTestId("note-tag-existing")).toHaveLength(0);
    expect(screen.getByTestId("note-tag-for-people")).toHaveAttribute("aria-selected", "true");
  });

  it("offers no tag of your own until the tags people use are in", async () => {
    Element.prototype.scrollIntoView = () => {};
    h.loading = true;
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.click(screen.getByTestId("note-add-tag"));
    fireEvent.change(await screen.findByTestId("note-tag-search"), { target: { value: "bot" } });
    expect(screen.getByTestId("note-tag-loading")).toHaveTextContent("Loading tags");
    expect(screen.queryByTestId("note-tag-create")).toBeNull();
  });

  it("puts a tag that exists above one of your own, and opens again on the whole list", async () => {
    Element.prototype.scrollIntoView = () => {};
    h.options = [
      {
        key: `${"a".repeat(64)}|bitcoin`,
        authorPubkey: "a".repeat(64),
        slug: "bitcoin",
        name: "Bitcoin",
        people: 3,
        vouches: 1,
        sharesName: 1,
        unverified: false,
        band: "content",
      },
    ];
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.click(screen.getByTestId("note-add-tag"));
    fireEvent.change(await screen.findByTestId("note-tag-search"), { target: { value: "bit" } });
    expect(screen.getByTestId("note-tag-create")).toBeInTheDocument();
    expect(screen.getByTestId("note-tag-existing")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByTestId("note-tag-search"), { key: "Escape" });
    fireEvent.click(screen.getByTestId("note-add-tag"));
    expect(await screen.findByTestId("note-tag-search")).toHaveValue("");
  });
});

// Tagging is one flow wherever it happens (2026-11-19): a tag on a post is as
// public and as permanent as one on a person, so it asks first too, and a new
// tag can say what it means.
describe("NoteTagChips — tagging a post asks first, as tagging a person does", () => {
  const option = {
    key: `${"a".repeat(64)}|bitcoin`,
    authorPubkey: "a".repeat(64),
    slug: "bitcoin",
    name: "Bitcoin",
    description: "About bitcoin.",
    people: 3,
    vouches: 1,
    sharesName: 1,
    unverified: false,
    band: "content",
  };
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    h.apply.mockClear();
    h.publish.mockClear();
    h.options = [option];
    h.loading = false;
  });
  const open = async () => {
    fireEvent.click(screen.getByTestId("note-add-tag"));
    return screen.findByTestId("note-tag-search");
  };

  it("a tag people use is confirmed before it is published; Cancel publishes nothing", async () => {
    render(<NoteTagChips eventId={ID} canTag />);
    await open();
    fireEvent.click(screen.getByTestId("note-tag-existing"));
    const confirm = screen.getByTestId("note-tag-confirm");
    expect(confirm).toHaveTextContent("Tag this post");
    expect(within(confirm).getByTestId("note-tag-view-name")).toHaveTextContent("Bitcoin");
    expect(within(confirm).getByTestId("note-tag-view-description")).toHaveTextContent("About bitcoin.");
    expect(confirm).toHaveTextContent(/anyone can see this/i);
    expect(confirm).toHaveTextContent(/can't be deleted/i);
    expect(h.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("note-tag-confirm-cancel"));
    expect(screen.queryByTestId("note-tag-confirm")).toBeNull();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("confirming publishes that tag", async () => {
    render(<NoteTagChips eventId={ID} canTag />);
    await open();
    fireEvent.click(screen.getByTestId("note-tag-existing"));
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    await waitFor(() =>
      expect(h.publish).toHaveBeenCalledWith({ tag: { authorPubkey: "a".repeat(64), slug: "bitcoin" }, polarity: 1 }),
    );
  });

  it("a new tag is created through the same form a profile's is, description and all", async () => {
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.change(await open(), { target: { value: "spam" } });
    const row = screen.getByTestId("note-tag-create");
    expect(row).toHaveTextContent('Create "spam"');
    expect(row).toHaveTextContent("Add a description next");
    expect(screen.getByRole("listbox")).not.toHaveTextContent("Add your own");
    fireEvent.click(row);
    expect(h.publish).not.toHaveBeenCalled();
    const confirm = screen.getByTestId("note-tag-confirm");
    expect(confirm).toHaveTextContent("Create a new tag");
    expect(within(confirm).getByTestId("note-tag-name")).toHaveValue("spam");
    fireEvent.change(within(confirm).getByTestId("note-tag-description"), {
      target: { value: " Unwanted, repeated posts " },
    });
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    await waitFor(() =>
      expect(h.publish).toHaveBeenCalledWith({
        tag: { name: "spam", description: "Unwanted, repeated posts" },
        polarity: 1,
      }),
    );
  });

  it("a new name that turns out to be a tag people use adds that tag, not a second one", async () => {
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.change(await open(), { target: { value: "spam" } });
    fireEvent.click(screen.getByTestId("note-tag-create"));
    fireEvent.change(screen.getByTestId("note-tag-name"), { target: { value: "bitcoin" } });
    expect(screen.getByTestId("note-tag-confirm")).toHaveTextContent("This tag already exists");
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    await waitFor(() =>
      expect(h.publish).toHaveBeenCalledWith({ tag: { authorPubkey: "a".repeat(64), slug: "bitcoin" }, polarity: 1 }),
    );
  });

  // The same words as on a profile (TagPersonButton.test): adding is "Tagged as",
  // a vote on a tag already there is "You agree" / "You disagreed".
  it("says it was tagged in the words a profile uses", async () => {
    h.toast.mockClear();
    render(<NoteTagChips eventId={ID} canTag />);
    await open();
    fireEvent.click(screen.getByTestId("note-tag-existing"));
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith({
        title: 'Tagged as "Bitcoin"',
        description: "Anyone can see this on the post.",
      }),
    );
  });

  it("says a vote on a tag already on the post as a vote, not as tagging it again", async () => {
    h.toast.mockClear();
    h.read.mockReturnValueOnce({
      data: {
        tags: [
          {
            key: "k",
            name: "Swing",
            slug: "swing",
            authorPubkey: "a".repeat(64),
            applications: 2,
            counted: true,
            myStance: undefined,
          },
        ],
        mine: [],
        unverifiable: 0,
        trustUnverified: false,
      },
    } as never);
    render(<NoteTagChips eventId={ID} canTag />);
    await open();
    fireEvent.click(within(screen.getByTestId("note-tag-stance")).getByTestId("note-tag-stance-vote-agree"));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'You agree with "Swing"' })),
    );
  });

  it("Create stays off until the tag has a name", async () => {
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.change(await open(), { target: { value: "spam" } });
    fireEvent.click(screen.getByTestId("note-tag-create"));
    fireEvent.change(screen.getByTestId("note-tag-name"), { target: { value: "" } });
    const create = screen.getByTestId("note-tag-confirm-add");
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe("NoteTagRow — a tag only you added", () => {
  const noteTag = (over: Record<string, unknown>) => ({
    key: "k",
    name: "Dance",
    slug: "dance",
    authorPubkey: "a".repeat(64),
    applications: 1,
    disputes: 0,
    asserters: [],
    counted: true,
    ...over,
  });

  it("says it is shown to you alone, in place of a count of nobody", () => {
    render(<NoteTagRow tags={[noteTag({ applications: 0, counted: false, myStance: "apply" })] as never} />);
    const title = screen.getByTestId("note-tag-chip").getAttribute("title")!;
    expect(title).toMatch(/^Only you can see this for now\./);
    expect(title).not.toMatch(/0 people/);
  });

  it("counts the people who tagged it otherwise", () => {
    render(<NoteTagRow tags={[noteTag({ applications: 3, myStance: "apply" })] as never} />);
    expect(screen.getByTestId("note-tag-chip").getAttribute("title")).toMatch(/^3 people tagged this/);
  });
});

describe("inSentence", () => {
  it("lowers a word that is only capitalised, and keeps one cased on purpose", () => {
    expect(inSentence("GitHub Account")).toBe("GitHub account");
    expect(inSentence("Food and Drink Place")).toBe("food and drink place");
    expect(inSentence("NIP")).toBe("NIP");
  });
});
