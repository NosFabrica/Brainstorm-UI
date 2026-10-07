/**
 * The "your own version" form: the community's fields on, the items' off,
 * custom fields added, the preview tracking every change, and publish
 * sending exactly the draft on screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/services/conceptCopy", () => ({ publishOwnCopy: (...a: unknown[]) => publish(...a) }));

// No relays and no accounts here: an anonymous reader, and no URL templates on offer.
vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: null, taPubkey: null, settled: true }),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({ data: new Map() }),
  useAvailableTemplates: () => ({ data: [], isPending: false }),
}));

import { OwnVersionDialog } from "./OwnVersionDialog";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const header: HeaderEvent = {
  id: "d".repeat(64),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", "github-accounts"],
    ["names", "GitHub Account", "GitHub Accounts"],
    ["description", "A list of github handles/accounts"],
    ["required", "github-username"],
    ["field-type", "github-username", "text"],
  ],
};
const community = definitionOf(header);
const items = [
  {
    tags: [
      ["github-username", "wds4"],
      ["description", "David Strayhorn"],
    ],
  },
  { tags: [["github-username", "vitorpamplona"]] },
];

const onPublished = vi.fn();
const open = () =>
  renderWithProviders(
    <OwnVersionDialog
      open
      onOpenChange={() => {}}
      community={community}
      current={null}
      items={items}
      onPublished={onPublished}
    />,
  );
const row = (i: number) => screen.getByTestId(`own-version-field-${i}`);
const preview = () => screen.getByTestId("own-version-preview").textContent ?? "";

beforeEach(() => {
  publish.mockReset();
  publish.mockResolvedValue(undefined);
  onPublished.mockReset();
});

describe("OwnVersionDialog", () => {
  it("starts from the community: its field on and required, the items' field off", () => {
    open();
    expect(row(0)).toHaveTextContent("github-username");
    expect(row(0)).toHaveTextContent("community");
    expect(row(0)).toHaveTextContent("Required");
    expect(row(1)).toHaveTextContent("description");
    expect(row(1)).toHaveTextContent("on 1 of 2 items");
    expect(row(1)).toHaveTextContent("Optional");
    expect(preview()).toContain('["b","39998:' + AVI + ':github-accounts","pointer"]');
    expect(preview()).not.toContain('"description"]');
  });

  it("turning on an items' field and requiring it shows in the preview", async () => {
    open();
    await userEvent.click(within(row(1)).getByTestId("own-version-field-enabled"));
    expect(preview()).toContain('["optional","description"]');
    await userEvent.click(within(row(1)).getByTestId("own-version-field-required"));
    expect(preview()).toContain('["required","description"]');
  });

  it("adds a custom field, and won't publish it unnamed", async () => {
    open();
    await userEvent.click(screen.getByTestId("own-version-add-field"));
    expect(screen.getByTestId("own-version-problems")).toHaveTextContent("Every field needs a name.");
    expect(screen.getByTestId("own-version-publish")).toBeDisabled();
    await userEvent.type(within(row(2)).getByTestId("own-version-field-name"), "avatar");
    expect(screen.queryByTestId("own-version-problems")).toBeNull();
    expect(preview()).toContain('["optional","avatar"]');
    await userEvent.click(within(row(2)).getByTestId("own-version-field-remove"));
    expect(preview()).not.toContain("avatar");
  });

  it("publishes the draft on screen, then reports back", async () => {
    open();
    await userEvent.click(within(row(1)).getByTestId("own-version-field-enabled"));
    await userEvent.click(screen.getByTestId("own-version-publish"));
    expect(publish).toHaveBeenCalledTimes(1);
    const [sentCommunity, draft] = publish.mock.calls[0];
    expect(sentCommunity).toBe(community);
    expect(draft.fields.filter((f: { enabled: boolean }) => f.enabled).map((f: { name: string }) => f.name)).toEqual([
      "github-username",
      "description",
    ]);
    expect(onPublished).toHaveBeenCalled();
  });

  it("a failed publish says why and stays open", async () => {
    publish.mockRejectedValue(new Error("No relay accepted the event"));
    open();
    await userEvent.click(screen.getByTestId("own-version-publish"));
    expect(await screen.findByTestId("own-version-error")).toHaveTextContent("No relay accepted the event");
    expect(onPublished).not.toHaveBeenCalled();
  });
});

describe("OwnVersionDialog — facts", () => {
  it("a field ticked as a fact shows in the preview, with the label typed for it", async () => {
    open();
    await userEvent.click(screen.getByTestId("own-version-fact-github-username"));
    expect(preview()).toContain('["display","fact","github-username"]');
    const label = screen.getByTestId("own-version-fact-label-github-username");
    expect(label).toHaveAttribute("placeholder", "Github username");
    await userEvent.type(label, "Handle");
    expect(preview()).toContain('["display","fact","github-username","Handle"]');
    await userEvent.click(screen.getByTestId("own-version-fact-github-username"));
    expect(preview()).not.toContain('"fact"');
    expect(screen.queryByTestId("own-version-fact-label-github-username")).toBeNull();
  });
});
