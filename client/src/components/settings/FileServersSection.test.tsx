// @vitest-environment jsdom
/**
 * The account's file servers (kind 10063) are edited on top of the list as it
 * is: nothing added before it's read, and a publish keeps what was there.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { ReplaceableProbe } from "@/lib/replaceableDraft";

const ME = "b".repeat(64);
const LIST = {
  id: "2".repeat(64),
  kind: 10063,
  pubkey: ME,
  created_at: 100,
  content: "",
  sig: "s",
  tags: [["server", "https://files.example"]],
} as NostrEvent;
const probe = vi.hoisted(() => ({ answer: null as null | (() => Promise<ReplaceableProbe>) }));
vi.mock("@/lib/replaceableDraft", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/replaceableDraft")>()),
  probeReplaceable: () => probe.answer!(),
}));
const publishBlossomServers = vi.fn(async (_servers: string[], _opts?: unknown) => ({ success: true }));
vi.mock("@/services/blossom", () => ({
  publishBlossomServers: (s: string[], opts?: unknown) => publishBlossomServers(s, opts),
}));

import { FileServersSection } from "./FileServersSection";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
  eventStore.add(LIST);
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  publishBlossomServers.mockClear();
  probe.answer = async () => ({ event: LIST, provenAbsent: false });
});

describe("FileServersSection", () => {
  it("adds nothing before the list is read, and adds to the list once it is", async () => {
    let answer: ((p: ReplaceableProbe) => void) | undefined;
    probe.answer = () => new Promise((r) => (answer = r));
    render(<FileServersSection pubkey={ME} />);
    await waitFor(() => expect(answer).toBeDefined());
    fireEvent.change(screen.getByLabelText("File server address"), { target: { value: "https://mine.example" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    probe.answer = async () => ({ event: LIST, provenAbsent: false });
    await act(async () => answer!({ event: LIST, provenAbsent: false }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByTestId("button-publish-file-servers"));
    await waitFor(() => expect(publishBlossomServers).toHaveBeenCalled());
    expect(publishBlossomServers.mock.calls[0][0]).toEqual(["https://files.example", "https://mine.example"]);
  });

  it("offers no suggestion over a list it couldn't read", async () => {
    probe.answer = async () => ({ event: undefined, provenAbsent: false });
    render(<FileServersSection pubkey={"c".repeat(64)} />);
    expect(await screen.findByTestId("file-servers-notice-unreadable")).toBeInTheDocument();
    expect(screen.queryByTestId("button-suggest-file-servers")).toBeNull();
  });
});
