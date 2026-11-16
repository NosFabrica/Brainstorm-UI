import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import type { CompromisedStatus } from "@/lib/compromised";
import { __resetCompromised } from "@/services/compromised";
import { CompromisedBanner } from "./CompromisedBanner";
import { CompromisedMark } from "./CompromisedMark";

// The real lookup: test/setup.ts answers "nobody" for every other suite.
vi.unmock("@/services/compromised");

const A = "a".repeat(64);
const B = "b".repeat(64);
const PROOF = "c".repeat(64);
const NEW_KEY = "d".repeat(64);

const status = (over: Partial<CompromisedStatus> = {}): CompromisedStatus => ({
  pubkey: A,
  since: 1794855600,
  proofEventId: PROOF,
  proofEvent: null,
  successorPubkey: null,
  ...over,
});

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  __resetCompromised();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompromisedBanner", () => {
  it("says the account is compromised, as an alert, and what not to do", () => {
    render(<CompromisedBanner status={status()} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("This account is compromised");
    expect(banner).toHaveTextContent("Someone other than its owner controls it");
    expect(banner).toHaveTextContent("Don't send it money");
  });

  it("links to the post that proves it", () => {
    render(<CompromisedBanner status={status()} />);
    const link = screen.getByRole("link", { name: /read the owner's post/i });
    const decoded = nip19.decode(link.getAttribute("href")!.replace("/e/", ""));
    expect(decoded.type).toBe("nevent");
    expect((decoded.data as { id: string }).id).toBe(PROOF);
  });

  it("has no proof link when there is no proof to link to", () => {
    render(<CompromisedBanner status={status({ proofEventId: null })} />);
    expect(screen.queryByRole("link", { name: /read the owner's post/i })).toBeNull();
  });

  it("points to the owner's new account once it is known", () => {
    render(<CompromisedBanner status={status({ successorPubkey: NEW_KEY })} />);
    expect(screen.getByRole("link", { name: /owner's new account/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(NEW_KEY)}`,
    );
  });
});

describe("CompromisedMark", () => {
  it("marks an account the server says is compromised", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { results: [{ pubkey: A, compromised: true }] } }), { status: 200 }),
    );
    render(<CompromisedMark pubkey={A} />);
    expect(await screen.findByTestId("compromised-mark")).toHaveTextContent("Compromised");
  });

  it("draws nothing for an account that isn't marked", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { results: [{ pubkey: B, compromised: false }] } }), { status: 200 }),
    );
    render(<CompromisedMark pubkey={B} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("compromised-mark")).toBeNull();
  });
});
