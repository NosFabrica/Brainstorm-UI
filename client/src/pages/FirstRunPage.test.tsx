// @vitest-environment jsdom
/**
 * The first run (/start): what you're into → people to follow → all set, then
 * search. Picking a topic preselects its top three, and dropping it drops
 * them; a key that already follows people skips straight to "your network is
 * ready". Finishing publishes one follow list and records the sharing choice;
 * skipping publishes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ME = "a".repeat(64);
const person = (c: string, name: string) => ({ pubkey: c.repeat(64), name, picture: `https://img.example/${c}.png` });
const MUSIC = [person("1", "Ann"), person("2", "Ben"), person("3", "Cal"), person("4", "Dee")];
const NEWS = [person("5", "AP News"), person("6", "Reuters"), person("7", "Stacker"), person("8", "Report")];

const h = vi.hoisted(() => ({
  follows: 0,
  navigate: vi.fn(),
  followPubkeys: vi.fn(),
  trigger: vi.fn(),
  byTopic: {} as Record<string, unknown[]>,
}));

vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLocation: () => ["/start", h.navigate],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => h.follows }));
vi.mock("@/hooks/useOnboardingPeople", () => ({
  useOnboardingPeople: (topics: string[]) => ({
    byTopic: Object.fromEntries(topics.map((t) => [t, h.byTopic[t] ?? []])),
    loading: false,
  }),
}));
vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...a: unknown[]) => h.followPubkeys(...a),
  recoverFollowListFromRelay: vi.fn(),
}));
vi.mock("@/services/trustAnchor", () => ({ triggerScoringAndAnchor: (...a: unknown[]) => h.trigger(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import FirstRunPage from "./FirstRunPage";
import { isFirstRunDone } from "@/lib/firstRun";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.follows = 0;
  h.byTopic = { music: MUSIC, news: NEWS };
  h.followPubkeys.mockResolvedValue({ success: true });
  h.trigger.mockResolvedValue(undefined);
});

const pick = (label: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
const next = () => fireEvent.click(screen.getByTestId("first-run-next"));

describe("FirstRunPage", () => {
  it("starts with nothing picked, everyday topics first and Money & Bitcoin last", () => {
    render(<FirstRunPage />);
    const topics = screen.getAllByTestId(/^first-run-topic-/).map((b) => b.textContent);
    expect(topics[0]).toBe("News");
    expect(topics.at(-1)).toBe("Money & Bitcoin");
    expect(screen.getByTestId("first-run-next")).toBeDisabled();
  });

  it("picking a topic preselects its top three; dropping it drops them", () => {
    render(<FirstRunPage />);
    pick("Music");
    pick("News");
    pick("News");
    next();
    expect(screen.getByTestId("first-run-next")).toHaveTextContent("Follow 3 and continue");
    expect(screen.queryByText("AP News")).toBeNull();
    expect(screen.getByText("Dee")).toBeInTheDocument();
  });

  it("finishing publishes one follow list with the picks, records the sharing choice and lands on search", async () => {
    render(<FirstRunPage />);
    pick("Music");
    next();
    fireEvent.click(screen.getByRole("button", { name: /Dee/ }));
    next();
    fireEvent.click(screen.getByRole("checkbox", { name: /Let other apps use my trust scores/ }));
    fireEvent.click(screen.getByTestId("first-run-next"));

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(h.followPubkeys).toHaveBeenCalledTimes(1);
    expect(h.followPubkeys.mock.calls[0][0]).toEqual([MUSIC[0], MUSIC[1], MUSIC[2], MUSIC[3]].map((p) => p.pubkey));
    expect(h.trigger).toHaveBeenCalledWith(ME, { nip85Consent: false });
    expect(isFirstRunDone(ME)).toBe(true);
  });

  it("a key that already follows people goes straight to 'your network is ready'", async () => {
    h.follows = 416;
    render(<FirstRunPage />);
    expect(screen.queryByTestId(/^first-run-topic-/)).toBeNull();
    expect(screen.getByTestId("first-run-found")).toHaveTextContent("416 people");
    next();
    fireEvent.click(screen.getByTestId("first-run-next"));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(h.followPubkeys).not.toHaveBeenCalled();
    expect(h.trigger).toHaveBeenCalledWith(ME, { nip85Consent: true });
  });

  it("skipping publishes nothing, and isn't asked again", () => {
    render(<FirstRunPage />);
    fireEvent.click(screen.getByTestId("first-run-skip"));
    expect(h.navigate).toHaveBeenCalledWith("/", { replace: true });
    expect(h.followPubkeys).not.toHaveBeenCalled();
    expect(h.trigger).not.toHaveBeenCalled();
    expect(isFirstRunDone(ME)).toBe(true);
  });
});
