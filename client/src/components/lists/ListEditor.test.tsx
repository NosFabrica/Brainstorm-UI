/**
 * Authoring a list: the header the form makes, the example item drawn by the
 * real renderers as fields change, the raw links, an edit that keeps what
 * the form doesn't speak, and a URL template drafted with the list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NostrEvent } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

// Radix Select captures the pointer and scrolls its options into view; jsdom does neither.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const { TEMPLATE, publish, sign } = vi.hoisted(() => ({
  TEMPLATE: "8846baa4be1d8bc17529a4079525b8ecb019f52a0655bd20ae547903b72bd5ed",
  publish: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/services/lists", () => ({
  listPublishSteps: { sign: (t: unknown) => sign(t), publish: (ev: unknown) => publish(ev) },
}));
vi.mock("@/hooks/useLinkTemplates", async () => {
  // Drafts answer as the real hook has them do; what exists is the one template below.
  const { useDraftTemplates } =
    await vi.importActual<typeof import("@/hooks/draftTemplates")>("@/hooks/draftTemplates");
  const { draftTemplateProblems } =
    await vi.importActual<typeof import("@/lib/templateDrafts")>("@/lib/templateDrafts");
  const templates = new Map([
    [
      TEMPLATE,
      {
        id: TEMPLATE,
        pubkey: "2".repeat(64),
        name: "BTC Map place",
        template: "https://btcmap.org/merchant/{id}",
      },
    ],
  ]);
  return {
    useLinkTemplates: () => {
      const drafts = useDraftTemplates();
      return { data: drafts.size ? new Map([...templates, ...drafts]) : templates };
    },
    useAvailableTemplates: () => ({ data: [...templates.values()], isPending: false }),
    useDraftTemplateProblems: (draft: Parameters<typeof draftTemplateProblems>[0]) =>
      draftTemplateProblems(draft, [...templates.values()]),
  };
});
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [], rendered: [], known: true }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: true }) }));
// An address shown by name is looked up from the store: none here.
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: () => ({ event: undefined, loading: false, settled: true }),
}));

import { ListEditor } from "./ListEditor";

const ME = "1".repeat(64);
const editor = (header: NostrEvent | null = null, onPublished = vi.fn()) =>
  renderWithProviders(<ListEditor header={header} me={ME} takenDs={new Set(["taken"])} onPublished={onPublished} />);
const tags = () => screen.getByTestId("list-editor-tags").textContent ?? "";
const fieldRow = (i: number) => screen.getByTestId(`list-editor-field-${i}`);
const pick = async (trigger: HTMLElement, option: string | RegExp) => {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

/** A new list with one field, "name", as its title. */
async function startList() {
  editor();
  await userEvent.type(screen.getByTestId("list-editor-plural"), "Food Trucks");
  await userEvent.type(screen.getByTestId("list-editor-singular"), "Food Truck");
  await userEvent.click(screen.getByTestId("list-editor-add-field"));
  await userEvent.type(within(fieldRow(0)).getByTestId("list-editor-field-name"), "name");
  await pick(screen.getByTestId("list-editor-display-title"), "name");
}

beforeEach(() => {
  publish.mockReset();
  publish.mockResolvedValue(undefined);
  sign.mockReset();
  // An event's id counts signatures, so a test can see which were signed again.
  let n = 0;
  sign.mockImplementation(async (t: object) => ({ ...t, id: String(++n).padStart(64, "0"), pubkey: ME }));
});

describe("ListEditor — a new list", () => {
  it("takes its d from its name, and points at itself", async () => {
    await startList();
    expect(screen.getByTestId("list-editor-d")).toHaveValue("food-trucks");
    expect(tags()).toContain(`["b","39998:${ME}:food-trucks","pointer"]`);
  });

  it("draws the example item as it's typed", async () => {
    await startList();
    await userEvent.type(screen.getByTestId("list-example-name"), "Wolf's Burger Truck");
    expect(within(screen.getByTestId("list-preview")).getByTestId("dlist-item-title")).toHaveTextContent(
      "Wolf's Burger Truck",
    );
  });

  it("keeps an example through a change of type — text to url makes it a link — but not through a rename", async () => {
    await startList();
    await userEvent.click(screen.getByTestId("list-editor-add-field"));
    await userEvent.type(within(fieldRow(1)).getByTestId("list-editor-field-name"), "site");
    await userEvent.click(screen.getByTestId("list-editor-fact-site"));
    await userEvent.type(screen.getByTestId("list-example-site"), "https://wolfs.example");
    const fact = () => within(screen.getByTestId("list-preview")).getByTestId("dlist-item-fact");
    expect(within(fact()).queryByRole("link")).toBeNull();

    await pick(within(fieldRow(1)).getByTestId("list-editor-field-type"), "url");
    expect(screen.getByTestId("list-example-site")).toHaveValue("https://wolfs.example");
    expect(within(fact()).getByRole("link")).toHaveAttribute("href", "https://wolfs.example");

    await userEvent.type(within(fieldRow(1)).getByTestId("list-editor-field-name"), "2");
    expect(screen.getByTestId("list-example-site2")).toHaveValue("");
  });

  it("spells out what a URL template expands to, as values change", async () => {
    await startList();
    await userEvent.click(screen.getByTestId("list-editor-add-field"));
    await userEvent.type(within(fieldRow(1)).getByTestId("list-editor-field-name"), "btcmap-id");
    await pick(screen.getByTestId("list-editor-add-link"), /BTC Map place/);
    expect(screen.getByTestId("list-preview-links")).toHaveTextContent("{id} ← btcmap-id = —");
    expect(screen.getByTestId("list-preview-links")).toHaveTextContent("every placeholder needs a value");
    await userEvent.type(screen.getByTestId("list-example-btcmap-id"), "28718");
    expect(within(screen.getByTestId("list-preview-links")).getByTestId("list-preview-links-href")).toHaveTextContent(
      "https://btcmap.org/merchant/28718",
    );
  });

  it("won't take an identifier already in use, and publishes what it shows", async () => {
    const onPublished = vi.fn();
    editor(null, onPublished);
    await userEvent.type(screen.getByTestId("list-editor-plural"), "Taken");
    await userEvent.type(screen.getByTestId("list-editor-singular"), "Taken");
    expect(screen.getByTestId("list-editor-problems")).toHaveTextContent('You already have a list at "taken"');
    await userEvent.clear(screen.getByTestId("list-editor-d"));
    await userEvent.type(screen.getByTestId("list-editor-d"), "fresh");
    await userEvent.click(screen.getByTestId("list-editor-publish"));
    expect(publish.mock.calls[0][0].tags[0]).toEqual(["d", "fresh"]);
    expect(onPublished).toHaveBeenCalledWith(`39998:${ME}:fresh`);
  });
});

describe("ListEditor — a published list", () => {
  const header = (pubkey: string): NostrEvent => ({
    id: "h".repeat(64),
    pubkey,
    kind: 39998,
    created_at: 1,
    content: "",
    sig: "",
    tags: [
      ["d", "food-trucks"],
      ["names", "Food Truck", "Food Trucks"],
      ["required", "name"],
      ["recommended", "address"],
      ["license", "ODbL-1.0"],
      ["b", `39998:${pubkey}:food-trucks`, "pointer"],
    ],
  });

  it("edits it in place, keeping its d and what the form doesn't speak", async () => {
    editor(header(ME));
    expect(screen.getByTestId("list-editor-d")).toHaveTextContent("food-trucks");
    await userEvent.type(screen.getByTestId("list-editor-description"), "Trucks that take bitcoin");
    await userEvent.click(screen.getByTestId("list-editor-publish"));
    const published = publish.mock.calls[0][0].tags;
    expect(published).toContainEqual(["license", "ODbL-1.0"]);
    expect(published).toContainEqual(["recommended", "address"]);
    expect(published).toContainEqual(["description", "Trucks that take bitcoin"]);
  });

  it("shows someone else's list without a form to change it", () => {
    editor(header("9".repeat(64)));
    expect(screen.getByTestId("list-editor-theirs")).toBeInTheDocument();
    expect(screen.queryByTestId("list-editor-publish")).toBeNull();
    expect(screen.getByTestId("list-example-name")).toBeInTheDocument();
  });
});

describe("ListEditor — importing from JSON", () => {
  const reply = `Here you go:

\`\`\`json
${JSON.stringify(
  {
    d: "food-trucks",
    tags: [
      ["names", "Food Truck", "Food Trucks"],
      ["required", "name", "Name"],
      ["optional", "btcmap-id", "BTC Map id"],
      ["display", "title", "name"],
      ["display", "fact", "cuisine", "Cuisine"],
      ["link", TEMPLATE, "wss://dcosl.brainstorm.world", "id", "btcmap-id"],
      ["license", "ODbL-1.0"],
    ],
    example: { name: "Wolf's Burger Truck", "btcmap-id": "28718" },
    notes: ["No template for the truck's own website: it's a field."],
  },
  null,
  2,
)}
\`\`\``;

  describe("copying the instructions", () => {
    const secure = (value: boolean) => Object.defineProperty(window, "isSecureContext", { value, configurable: true });
    const exec = vi.fn();
    beforeEach(() => {
      secure(true);
      exec.mockReset();
      Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    });
    const openAndCopy = async (user: ReturnType<typeof userEvent.setup>) => {
      editor();
      await user.click(screen.getByTestId("list-editor-import"));
      await user.click(screen.getByTestId("list-import-copy"));
    };

    it("puts instructions naming today's URL templates on the clipboard", async () => {
      const user = userEvent.setup();
      await openAndCopy(user);
      expect(await navigator.clipboard.readText()).toContain(
        `${TEMPLATE} — BTC Map place — https://btcmap.org/merchant/{id}`,
      );
      expect(screen.getByTestId("list-import-copy")).toHaveTextContent("Copied");
    });

    it("when the browser refuses the clipboard, copies from inside the dialog, where focus can go", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("NotAllowedError"));
      // Where focus was, and what it held, at the moment of copying: the helper takes its textarea away after.
      const at: { inDialog?: boolean; text?: string } = {};
      exec.mockImplementation(() => {
        const el = document.activeElement as HTMLTextAreaElement;
        at.inDialog = screen.getByTestId("list-import-dialog").contains(el);
        at.text = el.value;
        return true;
      });
      await openAndCopy(user);
      expect(exec).toHaveBeenCalledWith("copy");
      expect(at).toMatchObject({ inDialog: true, text: expect.stringContaining("URL templates available") });
      expect(screen.getByTestId("list-import-copy")).toHaveTextContent("Copied");
    });

    it("says so when it can't copy at all, and leaves the instructions selected", async () => {
      const user = userEvent.setup();
      secure(false);
      exec.mockReturnValue(false);
      await openAndCopy(user);
      expect(screen.getByTestId("list-import-copy-status")).toHaveTextContent("Couldn't copy here");
      const box = screen.getByTestId("list-import-prompt") as HTMLTextAreaElement;
      expect(box.selectionEnd - box.selectionStart).toBe(box.value.length);
    });
  });

  it("fills the form and the example from an AI's reply, and says what it didn't use", async () => {
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByTestId("list-editor-import"));
    await user.click(screen.getByTestId("list-import-reply"));
    await user.paste(reply);
    await user.click(screen.getByTestId("list-import-fill"));

    expect(screen.getByTestId("list-editor-plural")).toHaveValue("Food Trucks");
    expect(screen.getByTestId("list-editor-d")).toHaveValue("food-trucks");
    expect(within(screen.getByTestId("list-preview")).getByTestId("dlist-item-title")).toHaveTextContent(
      "Wolf's Burger Truck",
    );
    expect(within(screen.getByTestId("list-preview-links")).getByTestId("list-preview-links-href")).toHaveTextContent(
      "https://btcmap.org/merchant/28718",
    );
    expect(screen.getByTestId("list-editor-import-ignored")).toHaveTextContent(
      `["display","fact","cuisine","Cuisine"] — "cuisine" isn't a field the list declares`,
    );
    expect(screen.getByTestId("list-editor-import-notes")).toHaveTextContent("No template for the truck's own website");
    expect(tags()).toContain('["license","ODbL-1.0"]');
  });

  it("drafts the templates an AI proposed, and uses an existing one in place of its twin", async () => {
    const proposing = JSON.stringify({
      d: "food-trucks",
      tags: [
        ["names", "Food Truck", "Food Trucks"],
        ["required", "name", "Name"],
        ["optional", "btcmap-id", "BTC Map id"],
        ["optional", "osm-node", "OpenStreetMap node"],
        ["display", "title", "name"],
        ["link", "osm", "wss://dcosl.brainstorm.world", "node", "osm-node"],
        ["link", "btc", "wss://dcosl.brainstorm.world", "merchant", "btcmap-id"],
      ],
      templates: [
        { ref: "osm", name: "OpenStreetMap node", template: "https://www.openstreetmap.org/node/{node}" },
        { ref: "btc", name: "BTC Map merchant", template: "https://btcmap.org/merchant/{merchant}" },
      ],
      example: { name: "Wolf's Burger Truck", "btcmap-id": "28718", "osm-node": "123" },
      notes: [],
    });
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByTestId("list-editor-import"));
    await user.click(screen.getByTestId("list-import-reply"));
    await user.paste(proposing);
    await user.click(screen.getByTestId("list-import-fill"));

    const report = screen.getByTestId("list-editor-import-templates");
    expect(report).toHaveTextContent("OpenStreetMap node https://www.openstreetmap.org/node/{node} — new");
    expect(report).toHaveTextContent(
      'BTC Map merchant https://btcmap.org/merchant/{merchant} — already exists as "BTC Map place"',
    );
    expect(screen.getByTestId("list-editor-draft-template-0-url")).toHaveValue(
      "https://www.openstreetmap.org/node/{node}",
    );
    expect(tags()).toContain(`["link","${TEMPLATE}","wss://dcosl.brainstorm.world","id","btcmap-id"]`);
    const hrefs = within(screen.getByTestId("list-preview-links"))
      .getAllByTestId("list-preview-links-href")
      .map((el) => el.textContent);
    expect(hrefs).toEqual(["https://www.openstreetmap.org/node/123", "https://btcmap.org/merchant/28718"]);
  });

  it("won't fill the form from something it can't read", async () => {
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByTestId("list-editor-import"));
    await user.click(screen.getByTestId("list-import-reply"));
    await user.paste("a list of food trucks please");
    expect(screen.getByTestId("list-import-error")).toHaveTextContent("That isn't JSON.");
    expect(screen.getByTestId("list-import-fill")).toBeDisabled();
  });
});

describe("ListEditor — proposing a list as a community concept", () => {
  const self = `["b","39998:${ME}:food-trucks","pointer"]`;
  const published = (extra: string[][]): NostrEvent => ({
    id: "h".repeat(64),
    pubkey: ME,
    kind: 39998,
    created_at: 1,
    content: "",
    sig: "",
    tags: [["d", "food-trucks"], ["names", "Food Truck", "Food Trucks"], ["required", "name"], ...extra],
  });

  it("is ticked for a new list — it points at itself — and unticking takes the pointer off", async () => {
    await startList();
    expect(screen.getByTestId("list-editor-self-pointer")).toBeChecked();
    expect(tags()).toContain(self);
    await userEvent.click(screen.getByTestId("list-editor-self-pointer"));
    expect(tags()).not.toContain(self);
  });

  it("is as a published list had it, and never added to one that didn't", async () => {
    const { unmount } = editor(published([["b", `39998:${ME}:food-trucks`, "pointer"]]));
    expect(screen.getByTestId("list-editor-self-pointer")).toBeChecked();
    unmount();
    editor(published([]));
    expect(screen.getByTestId("list-editor-self-pointer")).not.toBeChecked();
    await userEvent.click(screen.getByTestId("list-editor-publish"));
    expect(publish.mock.calls[0][0].tags.some((t: string[]) => t[0] === "b")).toBe(false);
  });

  it("says when a list is a version of another, and keeps that pointer", async () => {
    const elsewhere = ["b", `39998:${"9".repeat(64)}:community-trucks`, "pointer"];
    editor(published([elsewhere]));
    expect(screen.getByTestId("list-editor-version-of")).toHaveTextContent("A version of");
    expect(tags()).toContain(JSON.stringify(elsewhere));
  });
});

describe("ListEditor — a new URL template", () => {
  /** A new list with an isbn field and a template drafted for it. */
  async function draftTemplate(field: string, name: string, url: string) {
    await startList();
    await userEvent.click(screen.getByTestId("list-editor-add-field"));
    await userEvent.type(within(fieldRow(1)).getByTestId("list-editor-field-name"), field);
    await userEvent.click(screen.getByTestId("list-editor-new-template"));
    if (name) await userEvent.type(screen.getByTestId("list-editor-draft-template-0-name"), name);
    await userEvent.clear(screen.getByTestId("list-editor-draft-template-0-url"));
    await userEvent.paste(url);
  }
  const OPEN_LIBRARY = "https://openlibrary.org/isbn/{isbn}";

  it("previews a drafted template's link, its placeholder bound to the field it names", async () => {
    await draftTemplate("isbn", "Open Library book", OPEN_LIBRARY);
    await userEvent.type(screen.getByTestId("list-example-isbn"), "9780140328721");
    expect(within(screen.getByTestId("list-preview-links")).getByTestId("list-preview-links-href")).toHaveTextContent(
      "https://openlibrary.org/isbn/9780140328721",
    );
    expect(screen.getByTestId("list-editor-tags-template")).toHaveTextContent(`["url-template","${OPEN_LIBRARY}"]`);
    expect(tags()).toContain('"‹id of Open Library book›"');
  });

  it("says what's wrong with a template it can't publish", async () => {
    await draftTemplate("isbn", "", "http://openlibrary.org/isbn/{isbn}");
    expect(screen.getByTestId("list-editor-draft-template-0-invalid")).toBeInTheDocument();
    await userEvent.clear(screen.getByTestId("list-editor-draft-template-0-url"));
    await userEvent.paste(OPEN_LIBRARY);
    expect(screen.getByTestId("list-editor-problems")).toHaveTextContent(`Name the new URL template ${OPEN_LIBRARY}.`);
    expect(screen.getByTestId("list-editor-publish")).toBeDisabled();
  });

  it("publishes the template first, then the list naming its id", async () => {
    await draftTemplate("isbn", "Open Library book", OPEN_LIBRARY);
    await userEvent.click(screen.getByTestId("list-editor-publish"));
    const [template, header] = publish.mock.calls.map((c) => c[0]);
    expect(template.kind).toBe(9999);
    expect(template.tags).toContainEqual(["url-template", OPEN_LIBRARY]);
    expect(header.kind).toBe(39998);
    expect(header.tags.find((t: string[]) => t[0] === "link")?.slice(0, 2)).toEqual(["link", template.id]);
    expect(screen.queryByTestId("list-editor-draft-template-0")).toBeNull();
  });

  it("a failed list publish keeps the published template, and trying again sends only the list", async () => {
    await draftTemplate("isbn", "Open Library book", OPEN_LIBRARY);
    publish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("relay said no"));
    await userEvent.click(screen.getByTestId("list-editor-publish"));
    expect(screen.getByTestId("list-editor-error")).toHaveTextContent("relay said no");
    // Published, the template is an existing one: no longer a draft in the form.
    expect(screen.queryByTestId("list-editor-draft-template-0")).toBeNull();

    await userEvent.click(screen.getByTestId("list-editor-publish"));
    expect(publish.mock.calls.map((c) => c[0].kind)).toEqual([9999, 39998, 39998]);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[2][0].id).toBe(publish.mock.calls[1][0].id);
  });

  it("won't publish a template that exists — offers it, bindings carried over", async () => {
    await draftTemplate("btcmap-id", "BTC Map", "https://BTCMap.org/merchant/{place}");
    await pick(screen.getByTestId("list-editor-link-bind-place"), "btcmap-id");
    const same = screen.getByTestId("list-editor-draft-template-0-same");
    expect(same).toHaveTextContent("BTC Map place");
    expect(screen.getByTestId("list-editor-problems")).toHaveTextContent(
      'BTC Map is the same as the existing "BTC Map place": use that one.',
    );
    expect(screen.getByTestId("list-editor-publish")).toBeDisabled();

    await userEvent.click(within(same).getByRole("button", { name: "Use it" }));
    expect(screen.queryByTestId("list-editor-draft-template-0")).toBeNull();
    expect(screen.getByTestId("list-editor-link-bind-id")).toHaveTextContent("btcmap-id");
    expect(tags()).toContain(`["link","${TEMPLATE}"`);
    expect(screen.queryByTestId("list-editor-problems")).toBeNull();
  });

  it("points out templates for the same site", async () => {
    await draftTemplate("btcmap-id", "BTC Map area", "https://btcmap.org/area/{id}");
    expect(screen.getByTestId("list-editor-draft-template-0-same-site")).toHaveTextContent(
      "https://btcmap.org/merchant/{id}",
    );
    expect(screen.queryByTestId("list-editor-draft-template-0-same")).toBeNull();
  });
});
