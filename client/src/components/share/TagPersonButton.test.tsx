/**
 * The "Tag this profile" picker. Its "Already on this profile" group listed
 * every existing tag twice — an Agree row and a Disagree row — so five tags
 * became ten rows before anything new (david's profile, 2026-09-08). One row
 * per tag now, with the tag page's Agree and thumbs-down inline.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TagPersonButton } from "./TagPersonButton";
import { resolveOrMintTag } from "@/services/tags";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
type ApplyResult = { failedAt?: unknown; confirmed?: boolean };
const applyMock = vi.fn(async (_vars: unknown): Promise<ApplyResult> => ({}));
let tags: unknown[] = [];
let picker: unknown[] = [];
vi.mock("@/hooks/useTags", () => ({
  useProfileTags: () => ({ data: { tags } }),
  useApplyTag: () => ({ mutateAsync: applyMock, isPending: false }),
  usePickerTags: () => ({ data: picker }),
}));
vi.mock("@/services/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tags")>()),
  resolveOrMintTag: vi.fn(),
}));

const PK = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const tag = (name: string, myStance?: "apply" | "dispute") => ({
  key: `${AUTHOR}|${name.toLowerCase()}`,
  name,
  slug: name.toLowerCase(),
  authorPubkey: AUTHOR,
  counted: true,
  selfDeclared: false,
  subjectDisagreed: false,
  myStance,
  applications: 3,
  disputes: 0,
  asserters: [],
  addedAt: 1,
});

beforeAll(() => {
  // cmdk scrolls the selected row into view; jsdom has no layout.
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  picker = [];
  applyMock.mockClear();
  toast.mockClear();
  vi.mocked(resolveOrMintTag).mockClear();
});

const openPicker = async () => {
  fireEvent.click(screen.getByTestId("share-add-tag"));
  return screen.findByTestId("share-tag-search");
};

describe("TagPersonButton — tags already on the profile", () => {
  it("each existing tag is one row, with Agree and Disagree side by side", async () => {
    tags = [tag("Verified Human"), tag("Neurologist")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    const rows = screen.getAllByTestId("share-tag-stance");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Verified Human");
    expect(within(rows[0]).getByTestId("share-tag-stance-vote-agree")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("share-tag-stance-vote-disagree")).toBeInTheDocument();
  });

  it("the thumbs-down publishes a disagreement; the row itself agrees", async () => {
    tags = [tag("Verified Human")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    const row = screen.getByTestId("share-tag-stance");
    fireEvent.click(within(row).getByTestId("share-tag-stance-vote-disagree"));
    await waitFor(() =>
      expect(applyMock).toHaveBeenCalledWith(
        expect.objectContaining({ polarity: -1, tag: { authorPubkey: AUTHOR, slug: "verified human" } }),
      ),
    );
  });

  it("the stance you already hold is shown, not offered again", async () => {
    tags = [tag("Verified Human", "apply")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    const row = screen.getByTestId("share-tag-stance");
    const agree = within(row).getByTestId("share-tag-stance-vote-agree");
    expect(agree).toHaveTextContent("Agreed");
    expect(agree).toBeDisabled();
    fireEvent.click(agree);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

// Picking a tag published a public, undeletable statement about someone on
// one click (Benjamin, 2026-09-09: "it did not ask me for confirmation"). A
// tag not yet on the profile asks first, inside the picker; the answer
// shows at once and the trigger never spins.
describe("TagPersonButton — adding a tag asks first", () => {
  it("the way in is the dashed button a post has, named for what it tags", () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    const trigger = screen.getByTestId("share-add-tag");
    expect(trigger).toHaveTextContent("Tag this profile");
    expect(trigger.className).toContain("border-dashed");
  });

  // "Add your own" over a highlighted row read as "press and it is published"
  // (2026-11-19). The row says it creates, and that there is a step after it.
  it("a name nobody uses is offered as a new tag to create, not something added on the spot", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    const row = await screen.findByTestId("share-tag-create");
    expect(row).toHaveTextContent('Create "Ham Radio"');
    // The row says what comes next, so a description is expected before the form opens.
    expect(row).toHaveTextContent("Add a description next");
    expect(screen.getByRole("listbox")).toHaveTextContent("New tag");
    expect(screen.getByRole("listbox")).not.toHaveTextContent("Add your own");
  });

  it("creating a tag opens a form: its name, an optional description; Cancel publishes nothing", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    const confirm = screen.getByTestId("share-tag-confirm");
    expect(confirm).toHaveTextContent("Create a new tag");
    expect(within(confirm).getByTestId("share-tag-name")).toHaveValue("Ham Radio");
    expect(within(confirm).getByLabelText("Description")).toHaveValue("");
    expect(confirm).toHaveTextContent(/anyone can see this/i);
    expect(confirm).toHaveTextContent(/can't be deleted/i);
    expect(screen.getByTestId("share-tag-confirm-add")).toHaveTextContent("Create tag");
    expect(applyMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("share-tag-confirm-cancel"));
    expect(screen.queryByTestId("share-tag-confirm")).toBeNull();
    expect(applyMock).not.toHaveBeenCalled();
    expect(resolveOrMintTag).not.toHaveBeenCalled();
  });

  it("Create stays off until the tag has a name, and creates the name as edited", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    const name = screen.getByTestId("share-tag-name");
    const create = screen.getByTestId("share-tag-confirm-add");
    fireEvent.change(name, { target: { value: "   " } });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(resolveOrMintTag).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: " Ham Radio Operator " } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(resolveOrMintTag).toHaveBeenCalledWith("Ham Radio Operator", undefined));
  });

  it("a tag people already use asks first, saying what it is put on", async () => {
    tags = [];
    picker = [
      {
        key: `${AUTHOR}|developer`,
        name: "Developer",
        slug: "developer",
        authorPubkey: AUTHOR,
        description: "Writes software.",
        people: 12,
        vouches: 1,
        sharesName: 1,
        band: "profile",
        unverified: false,
      },
    ];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.click(screen.getByTestId("share-tag-existing"));
    const confirm = screen.getByTestId("share-tag-confirm");
    expect(confirm).toHaveTextContent("Tag this profile");
    expect(within(confirm).getByTestId("share-tag-view-name")).toHaveTextContent("Developer");
    expect(within(confirm).getByTestId("share-tag-view-description")).toHaveTextContent("Writes software.");
    expect(within(confirm).queryByTestId("share-tag-name")).toBeNull();
    expect(screen.getByTestId("share-tag-confirm-add")).toHaveTextContent("Add tag");
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("after Add, the answer shows at once and the trigger never spins while the relays are slow", async () => {
    tags = [];
    let settle: (v: ApplyResult) => void = () => {};
    applyMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          settle = r;
        }),
    );
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() => expect(applyMock).toHaveBeenCalled());
    // The relays have not answered; the page already says so, and the way in stays put.
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tagged as "Ham Radio"' }));
    const trigger = screen.getByTestId("share-add-tag");
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveTextContent("Tag");
    expect(trigger.querySelector(".animate-spin")).toBeNull();
    settle({});
  });
});

// Team feedback (2026-10-01): trust scores who does the tagging, not who made
// the tag. A tag whose creator is unscored is still kept out of the standing
// suggestions (most are noise), but once its name is typed it is a tag like
// any other — no separate group, no "we don't know who made this".
describe("TagPersonButton — a tag whose creator is unscored", () => {
  const option = (name: string, people: number, unverified: boolean) => ({
    key: `${AUTHOR}|${name.toLowerCase()}`,
    name,
    slug: name.toLowerCase(),
    authorPubkey: AUTHOR,
    people,
    vouches: 1,
    sharesName: 1,
    band: "profile",
    unverified,
  });

  it("is offered among the tags people use once its name is typed, with nothing said about its creator", async () => {
    tags = [];
    picker = [option("Developer", 12, false), option("lfo", 54, true)];
    render(<TagPersonButton pubkey={PK} />);
    const input = await openPicker();

    expect(screen.getAllByTestId("share-tag-existing").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Developer"),
    ]);

    fireEvent.change(input, { target: { value: "lfo" } });
    const rows = await screen.findAllByTestId("share-tag-existing");
    expect(rows.some((r) => r.textContent?.includes("lfo"))).toBe(true);
    const list = screen.getByRole("listbox");
    expect(list.textContent).not.toMatch(/don't know who made/i);
    expect(list.textContent).not.toMatch(/also called this/i);
    expect(screen.queryByTestId("share-tag-unverified")).toBeNull();
  });
});

// Issue #202: a new tag could be given a name but never a description, while
// the wire format (and Tapestry) carry one. The confirm panel for a tag that
// doesn't exist yet asks for an optional description; existing tags don't.
describe("TagPersonButton — a new tag can carry a description", () => {
  const option = (name: string) => ({
    key: `${AUTHOR}|${name.toLowerCase()}`,
    name,
    slug: name.toLowerCase(),
    authorPubkey: AUTHOR,
    people: 12,
    vouches: 1,
    sharesName: 1,
    band: "profile",
    unverified: false,
  });

  it("the confirm panel offers an optional description, and Add passes it along with the name", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    const confirm = screen.getByTestId("share-tag-confirm");
    const field = within(confirm).getByTestId("share-tag-description");
    expect(confirm).toHaveTextContent("Optional");
    fireEvent.change(field, { target: { value: "  Licensed amateur radio operator  " } });
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() => expect(resolveOrMintTag).toHaveBeenCalledWith("Ham Radio", "Licensed amateur radio operator"));
  });

  it("leaving the description empty mints the tag with none", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() => expect(resolveOrMintTag).toHaveBeenCalledWith("Ham Radio", undefined));
  });

  it("a new name that turns out to be a tag people use adds that tag, and mints nothing", async () => {
    tags = [];
    picker = [option("Developer")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Develop" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    fireEvent.change(screen.getByTestId("share-tag-name"), { target: { value: "developer" } });
    expect(screen.getByTestId("share-tag-confirm")).toHaveTextContent("This tag already exists");
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() =>
      expect(applyMock).toHaveBeenCalledWith({
        tag: { authorPubkey: AUTHOR, slug: "developer" },
        displayName: "Developer",
      }),
    );
    expect(resolveOrMintTag).not.toHaveBeenCalled();
  });

  it("a tag that already exists asks for no description", async () => {
    tags = [];
    picker = [option("Developer")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.click(screen.getByTestId("share-tag-existing"));
    const confirm = screen.getByTestId("share-tag-confirm");
    expect(within(confirm).queryByTestId("share-tag-description")).toBeNull();
  });
});

describe("TagPersonButton — what Enter takes", () => {
  it("a tag that exists, above one of your own; and it opens again on the whole list", async () => {
    tags = [];
    picker = [
      {
        key: `${AUTHOR}|bitcoin-vendor`,
        authorPubkey: AUTHOR,
        slug: "bitcoin-vendor",
        name: "Bitcoin Vendor",
        people: 33,
        vouches: 9,
        sharesName: 1,
        unverified: false,
        band: "profile",
      },
    ];
    render(<TagPersonButton pubkey={PK} />);
    fireEvent.change(await openPicker(), { target: { value: "bit" } });
    expect(screen.getByTestId("share-tag-create")).toBeInTheDocument();
    expect(screen.getByTestId("share-tag-existing")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByTestId("share-tag-search"), { key: "Escape" });
    expect(await openPicker()).toHaveValue("");
  });
});

// One vocabulary wherever a tag is added: the picker on a post says the same
// things (NoteTagChips.test), so tagging reads as one feature, not two.
describe("TagPersonButton — the words it shares with tagging a post", () => {
  it("asks for a tag the way the post picker does", async () => {
    tags = [];
    render(<TagPersonButton pubkey={PK} />);
    expect(await openPicker()).toHaveAttribute("placeholder", "Search or create a tag");
  });

  // The answer shows at once on a profile (above); if the tagging then can't be read back from
  // the relays, the page says so rather than leave "Tagged as" standing.
  it("says afterwards when a tagging couldn't be read back", async () => {
    tags = [];
    applyMock.mockResolvedValueOnce({ confirmed: false });
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.change(screen.getByTestId("share-tag-search"), { target: { value: "Ham Radio" } });
    fireEvent.click(await screen.findByTestId("share-tag-create"));
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '"Ham Radio" may not have saved' })),
    );
  });

  it("says when a vote couldn't be read back, not that you voted", async () => {
    tags = [tag("Verified Human")];
    applyMock.mockResolvedValueOnce({ confirmed: false });
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.click(within(screen.getByTestId("share-tag-stance")).getByTestId("share-tag-stance-vote-disagree"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Your vote on "Verified Human" may not have saved' }),
      ),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'You disagreed with "Verified Human"' }));
  });

  it("says a vote on a tag already there the same way: you agree, or you disagreed", async () => {
    tags = [tag("Verified Human")];
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.click(within(screen.getByTestId("share-tag-stance")).getByTestId("share-tag-stance-vote-disagree"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'You disagreed with "Verified Human"' })),
    );
  });

  it("says when the relays didn't take it in the post picker's words", async () => {
    tags = [];
    picker = [
      {
        key: `${AUTHOR}|developer`,
        name: "Developer",
        slug: "developer",
        authorPubkey: AUTHOR,
        people: 12,
        vouches: 1,
        sharesName: 1,
        band: "profile",
        unverified: false,
      },
    ];
    applyMock.mockResolvedValueOnce({ failedAt: "assertion" });
    render(<TagPersonButton pubkey={PK} />);
    await openPicker();
    fireEvent.click(screen.getByTestId("share-tag-existing"));
    fireEvent.click(screen.getByTestId("share-tag-confirm-add"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't finish tagging", variant: "destructive" }),
      ),
    );
  });
});
