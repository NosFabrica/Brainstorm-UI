// @vitest-environment jsdom
/**
 * The technical strip on an event's page: kind, the short id, the address —
 * each a click to copy — for a power user who would otherwise open the ⋯
 * menu three times. Only in the technical view; nothing with it off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setTechnicalView } from "@/lib/technicalView";
import { TechnicalStrip } from "./TechnicalStrip";

const writeText = vi.fn(() => Promise.resolve());
const ev = { id: "4f2a".padEnd(64, "b"), kind: 30023, pubkey: "a".repeat(64), tags: [["d", "why"]], content: "", created_at: 1_758_500_000 };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("brainstorm_active_account", "acct-1");
  // jsdom's navigator.clipboard is a getter; define it rather than assign.
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true }); // the clipboard API needs it; jsdom says false
  writeText.mockClear();
});

describe("TechnicalStrip", () => {
  it("names the kind and the ids, and a click copies one", async () => {
    setTechnicalView(true);
    render(<TechnicalStrip event={ev} ids={[{ label: "naddr", value: "naddr1qqxyz" }]} />);
    const strip = screen.getByTestId("technical-strip");
    expect(strip).toHaveTextContent("kind 30023");
    expect(strip).toHaveTextContent("id 4f2abbbb…bbbb");
    fireEvent.click(screen.getByRole("button", { name: /copy naddr/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("naddr1qqxyz"));
  });

  it("is nothing with the view off", () => {
    render(<TechnicalStrip event={ev} ids={[]} />);
    expect(screen.queryByTestId("technical-strip")).toBeNull();
  });
});
