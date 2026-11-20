/**
 * The step between picking a tag and publishing it, on a profile or a post.
 * Both paths show the same two things, a tag's Name and its Description:
 * read for a tag people already use, written for one being created. Nobody
 * should have to wonder whether a tag can say what it means.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TagConfirmPanel, type PendingTag } from "./TagConfirmPanel";

const KNOWN = [{ label: "Bitcoin", description: "About bitcoin." }, { label: "Stoicism" }];

function show(pending: PendingTag, onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <TagConfirmPanel
      pending={pending}
      target="this post"
      reach="Anyone can see this on the post"
      known={KNOWN}
      testId="note-tag"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { panel: screen.getByTestId("note-tag-confirm"), onConfirm, onCancel };
}

describe("TagConfirmPanel — adding a tag people already use", () => {
  it("shows the tag's name and what it means, to read, before anything is published", () => {
    const { panel, onConfirm } = show({ kind: "existing", label: "Bitcoin", description: "About bitcoin." });
    expect(panel).toHaveTextContent("Tag this post");
    expect(within(panel).getByTestId("note-tag-view-name")).toHaveTextContent("Bitcoin");
    expect(within(panel).getByTestId("note-tag-view-description")).toHaveTextContent("About bitcoin.");
    expect(panel.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(panel).toHaveTextContent(/anyone can see this on the post/i);
    expect(panel).toHaveTextContent(/can't be deleted/i);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    expect(screen.getByTestId("note-tag-confirm-add")).toHaveTextContent("Add tag");
    expect(onConfirm).toHaveBeenCalledWith({ kind: "existing" });
  });

  it("says so plainly when the tag has no description", () => {
    show({ kind: "existing", label: "Stoicism" });
    expect(screen.getByTestId("note-tag-view-description")).toHaveTextContent("No description yet.");
  });
});

describe("TagConfirmPanel — creating a tag", () => {
  it("asks for a name and offers a description, saying it is optional and can be edited later", () => {
    const { panel } = show({ kind: "new", name: "Ham Radio" });
    expect(panel).toHaveTextContent("Create a new tag");
    expect(within(panel).getByLabelText("Name")).toHaveValue("Ham Radio");
    const description = within(panel).getByTestId("note-tag-description");
    expect(description).toHaveValue("");
    expect(panel).toHaveTextContent("Optional");
    expect(panel).toHaveTextContent("You can edit it later");
    expect(panel).toHaveTextContent("0/280");
    // No aside about some other tag: nothing here makes a description look pointless.
    expect(panel).not.toHaveTextContent(/already exists/i);
    expect(screen.getByTestId("note-tag-confirm-add")).toHaveTextContent("Create tag");
  });

  it("hands back the name and the description, trimmed; an empty description is none", () => {
    const { onConfirm } = show({ kind: "new", name: "Ham Radio" });
    fireEvent.change(screen.getByTestId("note-tag-description"), { target: { value: "  Radio people  " } });
    expect(screen.getByTestId("note-tag-confirm")).toHaveTextContent("12/280");
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    expect(onConfirm).toHaveBeenLastCalledWith({ kind: "new", name: "Ham Radio", description: "Radio people" });
    fireEvent.change(screen.getByTestId("note-tag-description"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    expect(onConfirm).toHaveBeenLastCalledWith({ kind: "new", name: "Ham Radio", description: undefined });
  });

  it("keeps Create off until there is a name", () => {
    const { onConfirm } = show({ kind: "new", name: "Ham Radio" });
    fireEvent.change(screen.getByTestId("note-tag-name"), { target: { value: "  " } });
    expect(screen.getByTestId("note-tag-confirm-add")).toBeDisabled();
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // The one case where a description would be thrown away. It is said when it
  // happens, with the existing tag's own words, not as a caveat on every form.
  it("turns into adding that tag when the name is one people already use", () => {
    const { panel, onConfirm } = show({ kind: "new", name: "Bitco" });
    fireEvent.change(screen.getByTestId("note-tag-name"), { target: { value: "bitcoin " } });
    expect(panel).toHaveTextContent("This tag already exists");
    expect(within(panel).getByTestId("note-tag-view-description")).toHaveTextContent("About bitcoin.");
    expect(within(panel).queryByTestId("note-tag-description")).toBeNull();
    expect(screen.getByTestId("note-tag-confirm-add")).toHaveTextContent("Add tag");
    fireEvent.click(screen.getByTestId("note-tag-confirm-add"));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "match", label: "Bitcoin" });
  });

  it("Cancel publishes nothing", () => {
    const { onConfirm, onCancel } = show({ kind: "new", name: "Ham Radio" });
    fireEvent.click(screen.getByTestId("note-tag-confirm-cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
