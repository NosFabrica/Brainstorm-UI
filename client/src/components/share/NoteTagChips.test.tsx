// @vitest-environment jsdom
/**
 * The tag row on an event's page reads and tags what the event is (issue
 * #334): an addressable event — a listing, an article, a DList item — by its
 * coordinate, so a tag survives its next edit; a note by its id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  read: vi.fn((..._a: unknown[]) => ({ data: { tags: [], mine: [], unverifiable: 0, trustUnverified: false } })),
  apply: vi.fn((..._a: unknown[]) => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/hooks/useTags", () => ({
  useEventTags: (...a: unknown[]) => h.read(...a),
  useApplyEventTag: (...a: unknown[]) => h.apply(...a),
  usePickerTags: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { NoteTagChips } from "./NoteTagChips";

const ID = "7".repeat(64);
const LISTING = `30402:${"5".repeat(64)}:circular-hoodie`;

describe("NoteTagChips", () => {
  beforeEach(() => {
    h.read.mockClear();
    h.apply.mockClear();
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
});
