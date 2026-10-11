/**
 * Field inputs shaped by their definition: an address field spells a pasted
 * naddr out as the coordinate an item stores, and says when a value isn't an
 * address at all.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nip19 } from "nostr-tools";
import type { FieldDecl } from "@/lib/dlistFields";
import { ItemFieldInputs, type FieldValues } from "./ItemFieldInputs";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const fields: FieldDecl[] = [
  { name: "name", requirement: "required", description: "Name of the business", type: "text" },
  { name: "list", requirement: "optional", description: null, type: "address" },
];

function Form() {
  const [values, setValues] = useState<FieldValues>({});
  return (
    <ItemFieldInputs
      fields={fields}
      values={values}
      onChange={(f, v) => setValues((x) => ({ ...x, [f]: v }))}
      testId="f"
    />
  );
}

describe("ItemFieldInputs", () => {
  it("labels each field by its name, requirement, type and the header's words", () => {
    render(<Form />);
    expect(screen.getByText("Name of the business")).toBeInTheDocument();
    expect(screen.getByText("required")).toBeInTheDocument();
    expect(screen.getByText("address")).toBeInTheDocument();
  });

  it("spells a pasted naddr out as the coordinate", async () => {
    render(<Form />);
    const naddr = nip19.naddrEncode({ kind: 39998, pubkey: AVI, identifier: "divine-videos" });
    await userEvent.click(screen.getByTestId("f-list"));
    await userEvent.paste(naddr);
    expect(screen.getByTestId("f-list")).toHaveValue(`39998:${AVI}:divine-videos`);
    expect(screen.queryByTestId("f-list-not-address")).toBeNull();
  });

  it("says when an address field's value isn't one", async () => {
    render(<Form />);
    await userEvent.type(screen.getByTestId("f-list"), "divine videos");
    expect(screen.getByTestId("f-list-not-address")).toBeInTheDocument();
  });
});
