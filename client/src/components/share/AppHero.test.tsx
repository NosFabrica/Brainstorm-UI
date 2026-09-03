// @vitest-environment jsdom
/**
 * The app page hero (kind 32267 on /e): an app-store presentation — icon,
 * name, summary, Get-it + Source, platform/license chips, publisher row,
 * screenshot gallery (tap to zoom), What's-new from the latest Zap Store
 * release, version history, and the full description.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

type Release = { version: string; at: number; notes: string; assetIds: string[] };
const releasesMock = vi.fn<() => Promise<Release[]>>(() => Promise.resolve([]));
const similarMock = vi.fn<() => Promise<NostrEvent[]>>(() => Promise.resolve([]));
type Asset = { url: string; mime: string; size: number | null; version: string | null; hash: string | null };
const assetMock = vi.fn<() => Promise<Asset | null>>(() => Promise.resolve(null));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchReleases: (...args: unknown[]) => releasesMock(...(args as [])),
  fetchSimilarApps: (...args: unknown[]) => similarMock(...(args as [])),
  fetchReleaseAsset: (...args: unknown[]) => assetMock(...(args as [])),
}));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({
  useLightbox: () => openLightboxMock,
}));
const scoreByPubkey = new Map<string, number | null>();
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => (scoreByPubkey.has(pk) ? scoreByPubkey.get(pk) : 0.7),
}));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
}));
// The real store verifies signatures (and jsdom's TextEncoder trips @noble),
// so known-profile lookups are faked per test.
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

// Endorsements ride their own memoized hook; the viewer's follows their own.
type Endorsements = import("@/services/endorsements").AppEndorsements;
const endorsementsMock = vi.fn<(address: string | null, opts: unknown) => Endorsements | null>(() => null);
vi.mock("@/hooks/useAppEndorsements", () => ({
  useAppEndorsements: (address: string | null, opts: unknown) => endorsementsMock(address, opts),
}));
let followsMock = new Set<string>();
let signedInMock = false;
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: followsMock, ready: true, signedIn: signedInMock }),
}));

import { AppHero } from "./AppHero";

const PUBLISHER = "b".repeat(64);
const profileEvent = (pubkey: string, name: string): NostrEvent =>
  ({ id: pubkey.slice(0, 8), kind: 0, pubkey, tags: [], content: JSON.stringify({ name }), created_at: 1, sig: "s" }) as NostrEvent;

function listing(tags: string[][], content = ""): NostrEvent {
  return {
    id: "a".repeat(64),
    kind: 32267,
    pubkey: PUBLISHER,
    tags,
    content,
    created_at: 1_760_000_000,
    sig: "s",
  } as NostrEvent;
}

const FLOTILLA = listing(
  [
    ["d", "social.flotilla"],
    ["name", "Flotilla"],
    ["summary", "Self-hosted community chat and threads built on the nostr protocol."],
    ["icon", "https://cdn.zapstore.dev/icon.png"],
    ["image", "https://cdn.zapstore.dev/shot1.png"],
    ["image", "https://cdn.zapstore.dev/shot2.png"],
    ["url", "https://flotilla.social"],
    ["repository", "https://github.com/coracle-social/flotilla"],
    ["f", "android-arm64-v8a"],
    ["license", "MIT"],
  ],
  "Flotilla is a full community platform.\n\nRooms, threads, and more.",
);

const rel = (version: string, daysAgo: number, notes = ""): Release => ({
  version,
  at: Math.floor(Date.now() / 1000) - 86400 * daysAgo,
  notes,
  assetIds: [`asset-${version}`],
});

beforeEach(() => {
  vi.clearAllMocks();
  knownProfiles.clear();
  scoreByPubkey.clear();
  releasesMock.mockResolvedValue([]);
  similarMock.mockResolvedValue([]);
  assetMock.mockResolvedValue(null);
  endorsementsMock.mockReturnValue(null);
  followsMock = new Set();
  signedInMock = false;
});

// What the network said about the app — Google's "shared endorsements" on
// Nostr. There is no star rating (0 of 845 app comments carry one), so the
// order is the rating: people you follow, then verified accounts, then the
// rest folded away. Reviews are kind-1111 comments on the listing; zaps with
// a memo count as micro-reviews.
describe("AppHero endorsements", () => {
  const VITOR = "1".repeat(64);
  const FAN = "2".repeat(64);
  const FRIEND = "3".repeat(64);
  const ZAPPER = "4".repeat(64);
  const ADDR = `32267:${PUBLISHER}:social.flotilla`;
  const review = (id: string, pubkey: string, text: string, at: number, version: string | null = "1.13.1") =>
    ({ id, pubkey, text, at, version, k: "32267", kind: 1111 });
  const signals = (over: Partial<Endorsements> = {}): Endorsements => ({
    address: ADDR,
    reviews: [
      review("r-fan", FAN, "Perfect APP! Thanks!", 300),
      review("r-vitor", VITOR, "love Amethyst. is my daily driver", 200),
      review("r-friend", FRIEND, "Best client on Android", 100, null),
    ],
    reviewCount: 14,
    zaps: [
      { id: "z1", pubkey: ZAPPER, memo: "love amethyst how it is", at: 250 },
      { id: "z2", pubkey: ZAPPER, memo: "", at: 240 },
    ],
    zapCount: 101,
    collectionCount: 46,
    ...over,
  });

  it("counts reviews, zaps and collections in a second stats strip", async () => {
    endorsementsMock.mockReturnValue(signals());
    render(<AppHero event={FLOTILLA} />);
    const strip = await screen.findByTestId("app-hero-endorsement-stats");
    expect(strip).toHaveTextContent("14");
    expect(strip).toHaveTextContent("reviews");
    expect(strip).toHaveTextContent("101");
    expect(strip).toHaveTextContent("zaps");
    expect(strip).toHaveTextContent("46");
    expect(strip).toHaveTextContent("collections");
    // The page wants the full story: pages of reviews AND zaps.
    expect(endorsementsMock).toHaveBeenCalledWith(ADDR, { publisher: PUBLISHER, reviewLimit: 50, zapLimit: 50 });
  });

  it("no signals, no strip and no section", async () => {
    endorsementsMock.mockReturnValue({ address: ADDR, reviews: [], reviewCount: 0, zaps: [], zapCount: 0, collectionCount: 0 });
    render(<AppHero event={FLOTILLA} />);
    await Promise.resolve();
    expect(screen.queryByTestId("app-hero-endorsement-stats")).toBeNull();
    expect(screen.queryByTestId("app-hero-reviews")).toBeNull();
    expect(screen.queryByTestId("app-hero-reviews-empty")).toBeNull();
  });

  it("orders what people say: you follow, then verified, the rest folded", async () => {
    endorsementsMock.mockReturnValue(signals());
    signedInMock = true;
    followsMock = new Set([FRIEND]);
    scoreByPubkey.set(VITOR, 0.9);
    scoreByPubkey.set(FAN, null);
    scoreByPubkey.set(FRIEND, null);
    scoreByPubkey.set(ZAPPER, 0.5);
    knownProfiles.set(VITOR, profileEvent(VITOR, "vitor"));
    knownProfiles.set(FRIEND, profileEvent(FRIEND, "friend"));
    render(<AppHero event={FLOTILLA} />);
    const section = await screen.findByTestId("app-hero-reviews");
    expect(section).toHaveTextContent("What people say");
    // Group headers, in order — the friend's older review leads the verified one.
    const text = section.textContent ?? "";
    expect(text.indexOf("From people you follow")).toBeGreaterThan(-1);
    expect(text.indexOf("From people you follow")).toBeLessThan(text.indexOf("From verified accounts"));
    expect(text.indexOf("Best client on Android")).toBeLessThan(text.indexOf("love Amethyst"));
    // The zap memo is a verified voice too — a ⚡ row; the silent zap is not a row.
    expect(screen.getByTestId("app-review-z1")).toHaveTextContent("love amethyst how it is");
    expect(screen.queryByTestId("app-review-z2")).toBeNull();
    // Which version the reviewer ran.
    expect(screen.getByTestId("app-review-r-vitor")).toHaveTextContent("on v1.13.1");
    // The unrated fan is folded away until asked for.
    expect(screen.queryByTestId("app-review-r-fan")).toBeNull();
    fireEvent.click(screen.getByTestId("app-hero-reviews-toggle"));
    expect(screen.getByTestId("app-review-r-fan")).toHaveTextContent("Perfect APP!");
    // The reviewer's ring is the rating.
    expect(screen.getByTestId("app-review-r-vitor").querySelector('[class*="shadow-[0_0_0"]')).not.toBeNull();
  });

  it("tells a signed-in viewer whose network hasn't spoken that it is showing all", async () => {
    endorsementsMock.mockReturnValue(signals());
    signedInMock = true;
    followsMock = new Set(["9".repeat(64)]);
    render(<AppHero event={FLOTILLA} />);
    const section = await screen.findByTestId("app-hero-reviews");
    expect(section).toHaveTextContent("No reviews from your network yet — showing all 14");
    expect(section).not.toHaveTextContent("From people you follow");
  });

  it("signed out, the groups are simply verified and the rest — no network talk", async () => {
    endorsementsMock.mockReturnValue(signals());
    render(<AppHero event={FLOTILLA} />);
    const section = await screen.findByTestId("app-hero-reviews");
    expect(section).not.toHaveTextContent("your network");
    expect(section).toHaveTextContent("From verified accounts");
  });

  it("with releases but nobody talking, says so quietly", async () => {
    releasesMock.mockResolvedValue([rel("1.0", 3)]);
    endorsementsMock.mockReturnValue({ address: ADDR, reviews: [], reviewCount: 0, zaps: [], zapCount: 0, collectionCount: 0 });
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.getByTestId("app-hero-reviews-empty")).toHaveTextContent("No reviews from the network yet");
  });
});

describe("AppHero", () => {
  it("presents the listing app-store style: icon, name, actions, chips, shots, description", () => {
    render(<AppHero event={FLOTILLA} />);

    expect(screen.getByText("Flotilla")).toBeInTheDocument();
    expect(screen.getByText(/Self-hosted community chat/)).toBeInTheDocument();
    expect((screen.getByTestId("app-hero-icon") as HTMLImageElement).src).toContain("icon.png");

    // Get it → the Zap Store page (where installs actually happen); the
    // marketing site is a secondary "Website" link; Source stays.
    expect(screen.getByTestId("app-hero-get").getAttribute("href")).toMatch(/^https:\/\/zapstore\.dev\/apps\/naddr1/);
    expect(screen.getByTestId("app-hero-get")).toHaveTextContent("Get on Zap Store");
    expect(screen.getByTestId("app-hero-website").getAttribute("href")).toBe("https://flotilla.social");
    expect(screen.getByTestId("app-hero-source").getAttribute("href")).toContain("github.com/coracle-social");

    expect(screen.getByText("Android")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();

    const shots = screen.getAllByTestId(/^app-shot-/);
    expect(shots).toHaveLength(2);

    expect(screen.getByText(/full community platform/)).toBeInTheDocument();
  });

it("offers the APK itself when the release's asset resolves", async () => {
    releasesMock.mockResolvedValue([rel("3.5.25", 2)]);
    assetMock.mockResolvedValue({
      url: "https://github.com/PrimalHQ/primal-android-app/releases/download/3.5.25/primal-3.5.25.apk",
      mime: "application/vnd.android.package-archive",
      size: 160171130,
      version: "3.5.25",
      hash: "6f5b89be7abb",
    });
    render(<AppHero event={FLOTILLA} />);
    const dl = await screen.findByTestId("app-hero-download");
    // Asked with the latest release's asset ids.
    expect(assetMock).toHaveBeenCalledWith(["asset-3.5.25"]);
    expect(dl.getAttribute("href")).toContain("primal-3.5.25.apk");
    expect(dl).toHaveTextContent("Download APK");
    expect(dl).toHaveTextContent("153 MB");
    expect(dl).toHaveTextContent("v3.5.25");
    // Benjamin's order: the informational links, the APK, then Zap Store last.
    const order = [...screen.getByTestId("app-hero-actions").querySelectorAll("a")].map((a) => a.getAttribute("data-testid"));
    expect(order).toEqual(["app-hero-website", "app-hero-source", "app-hero-download", "app-hero-get"]);
  });

  it("shows no download when there is no asset to download", async () => {
    releasesMock.mockResolvedValue([rel("1.0", 2)]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-download")).toBeNull();
  });

  it("shows the latest release as the maintained signal", async () => {
    releasesMock.mockResolvedValue([rel("1.0.2133", 3)]);
    render(<AppHero event={FLOTILLA} />);
    const latest = await screen.findByTestId("app-hero-release");
    expect(latest).toHaveTextContent("1.0.2133");
    // Asked for THIS app by its d identifier and publisher.
    expect(releasesMock).toHaveBeenCalledWith("social.flotilla", PUBLISHER);
  });

  it("stays quiet about releases when there are none", async () => {
    render(<AppHero event={FLOTILLA} />);
    await Promise.resolve();
    expect(screen.queryByTestId("app-hero-release")).toBeNull();
  });

  it("shows the release's actual notes as a What's-new section", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2, "- Fixed the login crash\n- New dark theme")]);
    render(<AppHero event={FLOTILLA} />);
    const whatsNew = await screen.findByTestId("app-hero-whats-new");
    expect(whatsNew).toHaveTextContent("What's new");
    expect(whatsNew).toHaveTextContent("Fixed the login crash");
  });

  it("skips What's-new when the release has no notes", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2, "   ")]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-whats-new")).toBeNull();
  });

  it("collapses a long changelog behind Show more", async () => {
    releasesMock.mockResolvedValue([
      rel("2.0", 1, Array.from({ length: 40 }, (_, i) => `* change number ${i}`).join("\n")),
    ]);
    render(<AppHero event={FLOTILLA} />);
    const toggle = await screen.findByTestId("app-hero-notes-toggle");
    expect(toggle).toHaveTextContent("Show more");
    fireEvent.click(toggle);
    expect(screen.getByTestId("app-hero-notes-toggle")).toHaveTextContent("Show less");
  });

  it("short notes need no toggle", async () => {
    releasesMock.mockResolvedValue([rel("2.0", 1, "- One small fix")]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-whats-new");
    expect(screen.queryByTestId("app-hero-notes-toggle")).toBeNull();
  });

  it("opens the lightbox on the tapped screenshot", () => {
    render(<AppHero event={FLOTILLA} />);
    fireEvent.click(screen.getByTestId("app-shot-1"));
    expect(openLightboxMock).toHaveBeenCalledWith(
      ["https://cdn.zapstore.dev/shot1.png", "https://cdn.zapstore.dev/shot2.png"],
      1,
    );
  });

  it("renders the changelog rich: headings, PR chips, nostr mentions as people", async () => {
    const friend = "c".repeat(64);
    const friendNpub = nip19.npubEncode(friend);
    releasesMock.mockResolvedValue([
      rel(
        "1.14.0",
        2,
        [
          "## What's Changed",
          "* Fix a fatal crash by @davotoula in https://github.com/vitorpamplona/amethyst/pull/3796",
          `* Thanks nostr:${friendNpub} for the report`,
        ].join("\n"),
      ),
    ]);
    render(<AppHero event={FLOTILLA} />);
    const whatsNew = await screen.findByTestId("app-hero-whats-new");

    // The markdown heading renders as a heading, not literal ##.
    expect(whatsNew).not.toHaveTextContent("##");
    expect(whatsNew).toHaveTextContent("What's Changed");

    // GitHub PR URLs become compact clickable chips.
    const pr = screen.getByRole("link", { name: /#3796/ });
    expect(pr.getAttribute("href")).toBe("https://github.com/vitorpamplona/amethyst/pull/3796");

    // nostr mentions render as the person, linked to their profile.
    const mention = screen.getByTestId("mention-chip");
    expect(mention.getAttribute("href")).toBe(`/p/${friendNpub}`);

    // GitHub handles get acknowledged (styled), still plain text.
    expect(whatsNew).toHaveTextContent("@davotoula");
  });

  it("names the publisher and links to their profile", () => {
    knownProfiles.set(PUBLISHER, {
      id: "p".repeat(64),
      kind: 0,
      pubkey: PUBLISHER,
      tags: [],
      content: JSON.stringify({ name: "Zap Store", picture: "https://cdn.zapstore.dev/pub.png" }),
      created_at: 1,
      sig: "s",
    } as NostrEvent);
    render(<AppHero event={FLOTILLA} />);
    const row = screen.getByTestId("app-hero-publisher");
    expect(row).toHaveTextContent("Zap Store");
    expect(row.getAttribute("href")).toBe(`/p/${nip19.npubEncode(PUBLISHER)}`);
  });

  it("lists older versions as history, newest release excluded", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2), rel("1.9.0", 20), rel("1.8.0", 60)]);
    render(<AppHero event={FLOTILLA} />);
    const history = await screen.findByTestId("app-hero-history");
    expect(history).toHaveTextContent("1.9.0");
    expect(history).toHaveTextContent("1.8.0");
    // 1.9.1 is the What's-new release, not history.
    expect(history).not.toHaveTextContent("1.9.1");
  });

  it("a single release means no history section", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2)]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-history")).toBeNull();
  });

  it("shows a stats strip: release count, store age, cadence", async () => {
    // Gaps of 18d and 40d — median ~29d reads as monthly updates.
    releasesMock.mockResolvedValue([rel("3.0", 2), rel("2.0", 20), rel("1.0", 60)]);
    render(<AppHero event={FLOTILLA} />);
    const stats = await screen.findByTestId("app-hero-stats");
    expect(stats).toHaveTextContent("3 releases");
    expect(stats).toHaveTextContent("Since");
    expect(stats).toHaveTextContent("~monthly");
  });

  it("no releases, no stats strip", async () => {
    render(<AppHero event={FLOTILLA} />);
    await Promise.resolve();
    expect(screen.queryByTestId("app-hero-stats")).toBeNull();
  });

  it("category tags become tappable chips into the Apps vertical", () => {
    const tagged = listing([
      ["d", "net.primal.android"],
      ["name", "Primal"],
      ["t", "nostr-client"],
      ["t", "android"], // duplicate of the platform word — filtered
      ["f", "android-arm64-v8a"],
    ]);
    render(<AppHero event={tagged} />);
    const cat = screen.getByTestId("app-cat-nostr-client");
    expect(cat.getAttribute("href")).toBe("/?q=%23nostr-client&t=apps");
    expect(screen.queryByTestId("app-cat-android")).toBeNull();
  });

  it("suggests similar apps as tappable mini cards", async () => {
    similarMock.mockResolvedValue([
      {
        id: "s".repeat(64), kind: 32267, pubkey: "9".repeat(64),
        tags: [["d", "com.wisp"], ["name", "Wisp"], ["icon", "https://cdn.zapstore.dev/wisp.png"], ["t", "nostr-client"]],
        content: "", created_at: 1, sig: "s",
      } as NostrEvent,
    ]);
    // Similar apps come from category tags — a listing without them asks for none.
    const tagged = listing([["d", "social.flotilla"], ["name", "Flotilla"], ["t", "nostr-client"]]);
    render(<AppHero event={tagged} />);
    const similar = await screen.findByTestId("app-hero-similar");
    expect(similarMock).toHaveBeenCalledWith(["nostr-client"], `32267:${PUBLISHER}:social.flotilla`);
    expect(similar).toHaveTextContent("Wisp");
    const card = screen.getByTestId("app-similar-com.wisp");
    expect(card.getAttribute("href")).toMatch(/^\/e\//);
  });
});
