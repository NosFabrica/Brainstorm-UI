// @vitest-environment jsdom
/**
 * A copy of someone's profile often keeps their handle. When the handle's own
 * server names a different account, the page says so and links that account;
 * every other handle failure is common and stays silent (lib/nip05).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { __resetNip05Cache } from "@/lib/nip05";
import { HandleOwnerWarning, Nip05Handle } from "./Nip05Check";

const OWNER = "1".repeat(64);
const COPY = "2".repeat(64);

const serverNames = (names: Record<string, string>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ names }), { status: 200 })),
  );

beforeEach(() => __resetNip05Cache());
afterEach(() => vi.unstubAllGlobals());

describe("HandleOwnerWarning", () => {
  it("warns that the handle belongs to another account, crossed out, with a link to that account", async () => {
    serverNames({ artist: OWNER });
    render(<HandleOwnerWarning nip05="artist@music.example" pubkey={COPY} />);
    const warning = await screen.findByTestId("handle-owner-warning");
    expect(warning).toHaveTextContent("artist@music.example belongs to another account");
    expect(warning.querySelector("s")).toHaveTextContent("artist@music.example");
    expect(screen.getByRole("link", { name: "See that account" })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(OWNER)}`,
    );
  });

  it("says nothing on the owner's own profile", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ names: { artist: OWNER } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HandleOwnerWarning nip05="artist@music.example" pubkey={OWNER} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("handle-owner-warning")).toBeNull();
  });

  it("says nothing when the name isn't listed or the server can't be reached", async () => {
    serverNames({ someoneelse: OWNER });
    const { unmount } = render(<HandleOwnerWarning nip05="artist@music.example" pubkey={COPY} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("handle-owner-warning")).toBeNull();
    unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<HandleOwnerWarning nip05="artist@down.example" pubkey={COPY} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("handle-owner-warning")).toBeNull();
  });
});

// A handle is shown only once its own server confirms it: anything on screen is true. A handle
// that belongs to someone else gets the warning above; every other outcome shows nothing.
describe("Nip05Handle", () => {
  it("shows a confirmed handle, with its check", async () => {
    serverNames({ artist: OWNER });
    render(<Nip05Handle nip05="artist@music.example" pubkey={OWNER} testId="handle" />);
    const handle = await screen.findByTestId("handle");
    expect(handle).toHaveTextContent("artist@music.example");
    expect(handle).toHaveAttribute("data-nip05-status", "verified");
  });

  it("shows nothing while the server is asked, so nothing appears only to vanish", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<Nip05Handle nip05="artist@music.example" pubkey={OWNER} testId="handle" />);
    expect(screen.queryByTestId("handle")).toBeNull();
  });

  it("shows nothing when the server can't be reached or doesn't list the name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { unmount } = render(<Nip05Handle nip05="artist@down.example" pubkey={OWNER} testId="handle" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("handle")).toBeNull();
    unmount();
    serverNames({ someoneelse: OWNER });
    render(<Nip05Handle nip05="artist@music.example" pubkey={OWNER} testId="handle" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("handle")).toBeNull();
  });
});
