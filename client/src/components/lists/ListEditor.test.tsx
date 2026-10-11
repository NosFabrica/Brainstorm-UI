/**
 * Authoring a list: the header the form makes, the example item drawn by the
 * real renderers as fields change, the raw links, and an edit that keeps what
 * the form doesn't speak.
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

const { TEMPLATE, publish } = vi.hoisted(() => ({
  TEMPLATE: "8846baa4be1d8bc17529a4079525b8ecb019f52a0655bd20ae547903b72bd5ed",
  publish: vi.fn(),
}));
vi.mock("@/services/lists", () => ({ publishListEvent: (t: unknown) => publish(t) }));
vi.mock("@/hooks/useLinkTemplates", () => {
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
    useLinkTemplates: () => ({ data: templates }),
    useAvailableTemplates: () => ({ data: [...templates.values()], isPending: false }),
  };
});
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [], rendered: [], known: true }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: true }) }));

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
  publish.mockResolvedValue({});
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

  it("copies instructions that name the URL templates there are", async () => {
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByTestId("list-editor-import"));
    await user.click(screen.getByTestId("list-import-copy"));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain(`${TEMPLATE} — BTC Map place — https://btcmap.org/merchant/{id}`);
    expect(screen.getByTestId("list-import-copy")).toHaveTextContent("Copied");
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
