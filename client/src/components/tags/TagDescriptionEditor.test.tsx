/**
 * On a tag's page, for the person who created it: change what the tag means.
 * The description is theirs to edit for as long as the tag lives; the name is
 * not, because the people carrying the tag agreed to that name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  save: vi.fn(async (_description: string) => ({ description: "" })),
  toast: vi.fn(),
  asked: [] as unknown[][],
}));
vi.mock("@/hooks/useTags", () => ({
  useEditTagDescription: (...args: unknown[]) => {
    h.asked.push(args);
    return { mutateAsync: h.save, isPending: false };
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));

import { TagDescriptionEditor } from "./TagDescriptionEditor";

const AUTHOR = "a".repeat(64);
const SOMEONE = "c".repeat(64);
const props = { authorPubkey: AUTHOR, slug: "ham-radio", name: "Ham Radio", description: "Radio people" };

beforeEach(() => {
  h.save.mockClear();
  h.toast.mockClear();
  h.asked.length = 0;
});

describe("TagDescriptionEditor", () => {
  it("offers nothing to anyone but the tag's creator", () => {
    const { container, rerender } = render(<TagDescriptionEditor {...props} viewerPubkey={SOMEONE} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TagDescriptionEditor {...props} viewerPubkey={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the creator an edit, or a first description when the tag has none", () => {
    const { rerender } = render(<TagDescriptionEditor {...props} viewerPubkey={AUTHOR} />);
    expect(screen.getByTestId("tag-description-edit")).toHaveTextContent("Edit description");
    rerender(<TagDescriptionEditor {...props} description="" viewerPubkey={AUTHOR} />);
    expect(screen.getByTestId("tag-description-edit")).toHaveTextContent("Add a description");
  });

  it("opens on the current words, with the name shown and not editable", () => {
    render(<TagDescriptionEditor {...props} viewerPubkey={AUTHOR} />);
    fireEvent.click(screen.getByTestId("tag-description-edit"));
    const form = screen.getByTestId("tag-description-form");
    expect(screen.getByTestId("tag-description-field")).toHaveValue("Radio people");
    expect(form).toHaveTextContent("Ham Radio");
    expect(form).toHaveTextContent("The name can't be changed");
    expect(form.querySelectorAll("input")).toHaveLength(0);
  });

  it("saves the new words for this tag, and closes", async () => {
    render(<TagDescriptionEditor {...props} viewerPubkey={AUTHOR} />);
    expect(h.asked.at(-1)).toEqual([AUTHOR, "ham-radio"]);
    fireEvent.click(screen.getByTestId("tag-description-edit"));
    fireEvent.change(screen.getByTestId("tag-description-field"), {
      target: { value: "Licensed amateur radio operator" },
    });
    fireEvent.click(screen.getByTestId("tag-description-save"));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith("Licensed amateur radio operator"));
    await waitFor(() => expect(screen.queryByTestId("tag-description-form")).toBeNull());
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Description updated" }));
  });

  it("has nothing to save until the words change, and Cancel saves nothing", () => {
    render(<TagDescriptionEditor {...props} viewerPubkey={AUTHOR} />);
    fireEvent.click(screen.getByTestId("tag-description-edit"));
    expect(screen.getByTestId("tag-description-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("tag-description-field"), { target: { value: "Something else" } });
    expect(screen.getByTestId("tag-description-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("tag-description-cancel"));
    expect(screen.queryByTestId("tag-description-form")).toBeNull();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("stays open and says so when the relays don't take it", async () => {
    h.save.mockRejectedValueOnce(new Error("No relay accepted the event"));
    render(<TagDescriptionEditor {...props} viewerPubkey={AUTHOR} />);
    fireEvent.click(screen.getByTestId("tag-description-edit"));
    fireEvent.change(screen.getByTestId("tag-description-field"), { target: { value: "Something else" } });
    fireEvent.click(screen.getByTestId("tag-description-save"));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't save the description" })),
    );
    expect(screen.getByTestId("tag-description-field")).toHaveValue("Something else");
  });
});
