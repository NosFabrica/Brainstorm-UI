// @vitest-environment jsdom
/**
 * The event page of an activity — a zap, a reaction, a report, an RSVP, a
 * trust score — draws its own hero, not the structural tag table: it says what
 * the All tab's row says, as a page. A zap receipt's page is its payer's, not
 * the wallet service's that signed it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";

const relayEvents = new Map<string, MinimalEvent>();
const relayAddresses = new Map<string, MinimalEvent>();
/** Every id list the page asked the relays for. */
const askedIds: string[][] = [];
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => {
    askedIds.push(ids);
    return ids.map((id) => relayEvents.get(id)).filter(Boolean);
  },
  fetchAddressableEvents: async (addrs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(
      addrs
        .map((a) => [
          `${a.kind}:${a.pubkey}:${a.identifier}`,
          relayAddresses.get(`${a.kind}:${a.pubkey}:${a.identifier}`),
        ])
        .filter((e): e is [string, MinimalEvent] => !!e[1]),
    ),
}));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/hooks/useSpecsForKind", () => ({ useSpecsForKind: () => [] }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({
  // The share link the page's ⋯ copies, said where a test can read it.
  EntityMenu: ({ entity }: { entity: { bech32: string } }) => <span data-testid="entity-bech32">{entity.bech32}</span>,
}));
vi.mock("@/components/share/LinkPreview", () => ({
  LinkChip: ({ url }: { url: string }) => <a href={url} data-testid="link-chip" />,
  LinkPreviewCard: () => null,
}));

import { EventScreen } from "../EventScreen";
import { hasActivityHero } from "./index";

const WALLET = "a".repeat(64);
const ALICE = "b".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
let n = 0;
/** A fresh id per event: the page's asks are keyed by id, and kept between tests. */
const nextId = () => (++n).toString(16).padStart(64, "0");

const ev = (kind: number, tags: string[][] = [], content = "", pubkey = WALLET): MinimalEvent => ({
  id: nextId(),
  kind,
  pubkey,
  created_at: NOW - 60,
  tags,
  content,
});

// Profiles are seeded into the store unsigned.
const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

const open = (event: MinimalEvent) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen event={event} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

describe("the activity hero dispatch", () => {
  it.each([
    [3, "follows-hero"],
    [5, "deletion-hero"],
    [7, "reaction-hero"],
    [8, "badge-award-hero"],
    [17, "reaction-hero"],
    [1018, "poll-vote-hero"],
    [1984, "report-hero"],
    [1985, "label-hero"],
    [4550, "approval-hero"],
    [8333, "zap-hero"],
    [9321, "zap-hero"],
    [9734, "zap-hero"],
    [9735, "zap-hero"],
    [9736, "zap-hero"],
    [31925, "rsvp-hero"],
    [30382, "assertion-hero"],
    [30383, "assertion-hero"],
    [30384, "assertion-hero"],
  ])("kind %i opens as its own hero, not the tag table", (kind, testId) => {
    expect(hasActivityHero({ kind })).toBe(true);
    // A tag that says something: an event of nothing but its `d` is a husk (lib/blankEvent).
    open(
      ev(kind, [
        ["d", "x"],
        ["p", ALICE],
      ]),
    );
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId("structural-hero")).toBeNull();
  });

  it("leaves every other kind to the chain it had", () => {
    expect(hasActivityHero({ kind: 1 })).toBe(false);
    expect(hasActivityHero({ kind: 10002 })).toBe(false);
    open(ev(10002, [["r", "wss://relay.example"]], ""));
    expect(screen.getByTestId("structural-hero")).toBeInTheDocument();
  });
});

const seedProfile = (pubkey: string, name: string) =>
  eventStore.add({
    ...ev(0, [], JSON.stringify({ name }), pubkey),
    created_at: NOW - 100,
    sig: "s",
  } as NostrEvent);

/** The pubkey the page's share link (its nevent) names as the event's author. */
const sharedAuthor = () => {
  const d = nip19.decode(screen.getByTestId("entity-bech32").textContent!);
  return d.type === "nevent" ? d.data.author : null;
};

describe("a zap receipt's page", () => {
  it("names the payer in the zap, signed; the page itself stays the signer's", async () => {
    const sk = generateSecretKey();
    const payer = getPublicKey(sk);
    seedProfile(payer, "Pat Payer");
    const target = ev(1, [], "the zapped note", ALICE);
    relayEvents.set(target.id, target);
    const request = JSON.stringify(
      finalizeEvent(
        {
          kind: 9734,
          created_at: NOW - 70,
          content: "great post",
          tags: [
            ["amount", "21000"],
            ["p", ALICE],
            ["e", target.id],
          ],
        },
        sk,
      ),
    );
    open(
      ev(9735, [
        ["p", ALICE],
        ["e", target.id],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", request],
      ]),
    );
    expect(screen.getByTestId("zap-amount")).toHaveTextContent("⚡ 21 sats");
    expect(screen.getByTestId("zap-comment")).toHaveTextContent("great post");
    expect(screen.getByTestId("activity-from").getAttribute("href")).toBe(`/p/${nip19.npubEncode(payer)}`);
    expect(screen.getByTestId("activity-to").getAttribute("href")).toBe(`/p/${nip19.npubEncode(ALICE)}`);
    await waitFor(() => expect(within(screen.getByTestId("activity-from")).getByText("Pat Payer")).toBeInTheDocument());
    expect(screen.queryByTestId("zap-payer-unverified")).toBeNull();
    // The zapped note, quoted.
    expect(await within(screen.getByTestId("zap-target")).findByText("the zapped note")).toBeInTheDocument();
  });

  it("a forged receipt naming someone as its payer does not make the page theirs", async () => {
    const victim = "d".repeat(64);
    seedProfile(victim, "Victim Vee");
    const request = JSON.stringify({ kind: 9734, pubkey: victim, content: "", tags: [["p", ALICE]] });
    open(
      ev(9735, [
        ["p", ALICE],
        ["P", victim],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", request],
      ]),
    );
    // The zap says whom it names — and that nothing they signed backs it.
    expect(screen.getByTestId("activity-from").getAttribute("href")).toBe(`/p/${nip19.npubEncode(victim)}`);
    expect(screen.getByTestId("zap-payer-unverified")).toHaveTextContent(/unverified/i);
    await waitFor(() =>
      expect(within(screen.getByTestId("activity-from")).getByText("Victim Vee")).toBeInTheDocument(),
    );
    // Nowhere else: not the author line, not "More from", not the share link.
    expect(screen.getAllByText("Victim Vee")).toHaveLength(1);
    expect(sharedAuthor()).toBe(WALLET);
  });

  it("an anonymous zap names nobody", () => {
    const sk = generateSecretKey();
    const request = JSON.stringify(
      finalizeEvent(
        {
          kind: 9734,
          created_at: NOW - 70,
          content: "",
          tags: [
            ["anon", ""],
            ["p", ALICE],
          ],
        },
        sk,
      ),
    );
    open(
      ev(9735, [
        ["p", ALICE],
        ["description", request],
      ]),
    );
    expect(screen.getByTestId("activity-from")).toHaveTextContent("Anonymous");
  });

  it("draws the request's NIP-30 emoji in its comment", () => {
    const request = JSON.stringify({
      kind: 9734,
      pubkey: "c".repeat(64),
      content: "gm :soapbox:",
      tags: [["emoji", "soapbox", "https://cdn.example/soapbox.png"]],
    });
    open(ev(9735, [["description", request]]));
    const img = within(screen.getByTestId("zap-comment")).getByTestId("custom-emoji");
    expect(img.getAttribute("src")).toBe("https://cdn.example/soapbox.png");
  });

  it("an onchain zap links its transaction", () => {
    const txid = "f".repeat(64);
    open(
      ev(
        8333,
        [
          ["i", `bitcoin:tx:${txid}`],
          ["p", ALICE],
          ["amount", "50000"],
          ["block", "0".repeat(64), "850000"],
        ],
        "stack sats",
      ),
    );
    expect(screen.getByTestId("zap-amount")).toHaveTextContent("⚡ 50,000 sats");
    expect(screen.getByTestId("zap-txid").getAttribute("href")).toBe(`https://mempool.space/tx/${txid}`);
    expect(screen.getByTestId("zap-block")).toHaveTextContent("Block 850,000");
    // A zap to a person names no post.
    expect(screen.queryByTestId("zap-target")).toBeNull();
  });
});

describe("a reaction's page", () => {
  it("draws a NIP-30 custom emoji as its picture, and quotes the note it is on", async () => {
    const target = ev(1, [], "a note worth a reaction", ALICE);
    relayEvents.set(target.id, target);
    open(
      ev(
        7,
        [
          ["e", target.id],
          ["p", ALICE],
          ["k", "1"],
          ["emoji", "soapbox", "https://cdn.example/soapbox.png"],
        ],
        ":soapbox:",
      ),
    );
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Reacted :soapbox:");
    const img = within(screen.getByTestId("activity-mark")).getByTestId("custom-emoji");
    expect(img.getAttribute("src")).toBe("https://cdn.example/soapbox.png");
    expect(
      await within(screen.getByTestId("reaction-target")).findByText("a note worth a reaction"),
    ).toBeInTheDocument();
  });

  it("a + is a heart; an external reaction shows the page it was on", () => {
    open(
      ev(
        17,
        [
          ["k", "web"],
          ["i", "https://example.com/post"],
        ],
        "+",
      ),
    );
    expect(screen.getByTestId("reaction-like")).toBeInTheDocument();
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Liked");
    expect(screen.getByTestId("link-chip").getAttribute("href")).toBe("https://example.com/post");
    expect(screen.getByTestId("reaction-external-kind")).toHaveTextContent("web");
  });
});

describe("a report's page", () => {
  it("says the reason, the comment, and quotes the reported post", async () => {
    const target = ev(1, [], "buy my coin", ALICE);
    relayEvents.set(target.id, target);
    open(
      ev(
        1984,
        [
          ["p", ALICE],
          ["e", target.id, "spam"],
        ],
        "a bot",
      ),
    );
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Reported a post");
    expect(screen.getByTestId("report-reason")).toHaveTextContent("Spam");
    expect(screen.getByTestId("report-comment")).toHaveTextContent("a bot");
    expect(screen.getByTestId(`activity-person-${ALICE}`)).toBeInTheDocument();
    expect(await within(screen.getByTestId("report-event")).findByText("buy my coin")).toBeInTheDocument();
  });

  it("keeps a post reported as nudity or illegal behind a click", async () => {
    const target = ev(1, [], "reported words", ALICE);
    relayEvents.set(target.id, target);
    open(ev(1984, [["e", target.id, "nudity"]]));
    expect(screen.queryByText("reported words")).toBeNull();
    fireEvent.click(screen.getByTestId("report-event-reveal"));
    expect(await screen.findByText("reported words")).toBeInTheDocument();
  });
});

describe("an RSVP's page", () => {
  it("says going, busy, and shows the appointment with its date", async () => {
    const start = NOW + 7 * 86_400;
    const appt = ev(
      31923,
      [
        ["d", "meetup"],
        ["title", "Nostr meetup"],
        ["start", String(start)],
      ],
      "",
      ALICE,
    );
    relayAddresses.set(`31923:${ALICE}:meetup`, appt);
    open(
      ev(31925, [
        ["d", "rsvp"],
        ["a", `31923:${ALICE}:meetup`],
        ["status", "accepted"],
        ["fb", "busy"],
      ]),
    );
    expect(screen.getByTestId("rsvp-status")).toHaveTextContent("Going");
    expect(screen.getByTestId("rsvp-fb")).toHaveTextContent("Busy then");
    const row = await within(screen.getByTestId("rsvp-event")).findByTestId("share-event-row");
    expect(row).toHaveTextContent("Nostr meetup");
  });
});

describe("a trust score's page", () => {
  it("says the rank out of 100, and no known path where `hops` is absent", () => {
    open(
      ev(30382, [
        ["d", ALICE],
        ["rank", "63"],
        ["followers", "188"],
        ["muters", "1"],
      ]),
    );
    expect(screen.getByTestId("assertion-rank")).toHaveTextContent("63 / 100");
    expect(screen.getByTestId("assertion-hops")).toHaveTextContent("No known follow path");
    expect(screen.getByTestId("assertion-metric-followers")).toHaveTextContent("Verified followers");
    expect(screen.getByTestId(`activity-person-${ALICE}`)).toBeInTheDocument();
  });
});

describe("a deletion's page", () => {
  it("counts what it deleted and says a target that is gone is gone", async () => {
    open(
      ev(
        5,
        [
          ["e", "9".repeat(64)],
          ["k", "1"],
        ],
        "oops",
      ),
    );
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Deleted 1 event");
    expect(screen.getByTestId("deletion-kind")).toHaveTextContent("Note");
    expect(screen.getByTestId("deletion-reason")).toHaveTextContent("oops");
    expect(await screen.findByText("No longer available")).toBeInTheDocument();
  });
});

describe("hostile and forged activity", () => {
  it("an RSVP whose status is `__proto__` reads as a reply, and draws", () => {
    open(
      ev(31925, [
        ["status", "__proto__"],
        ["a", `31922:${ALICE}:x`],
      ]),
    );
    expect(screen.getByTestId("rsvp-status")).toHaveTextContent("Replied");
  });

  it("an approval carrying a post nobody signed asks for the post it names, and says it is only a claim", async () => {
    const real = ev(1, [], "the real post", ALICE);
    relayEvents.set(real.id, real);
    open(
      ev(
        4550,
        [
          ["a", `34550:${ALICE}:c`],
          ["e", real.id],
        ],
        JSON.stringify({ id: real.id, pubkey: ALICE, kind: 1, content: "I endorse scams", tags: [null] }),
      ),
    );
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Says it approved a post");
    expect(await within(screen.getByTestId("approval-post")).findByText("the real post")).toBeInTheDocument();
    expect(screen.queryByText("I endorse scams")).toBeNull();
  });

  it("an approval by the community's moderator is its word, once the definition says so", async () => {
    const owner = "e".repeat(64);
    relayAddresses.set(
      `34550:${owner}:mods`,
      ev(
        34550,
        [
          ["d", "mods"],
          ["name", "Mods"],
          ["p", WALLET, "", "moderator"],
        ],
        "",
        owner,
      ),
    );
    open(ev(4550, [["a", `34550:${owner}:mods`]]));
    await waitFor(() => expect(screen.getByTestId("activity-title")).toHaveTextContent(/^Approved a post$/));
  });

  it("a badge award by someone else than its issuer only claims the badge", async () => {
    relayAddresses.set(
      `30009:${ALICE}:hero`,
      ev(
        30009,
        [
          ["d", "hero"],
          ["name", "Hero"],
          ["image", "https://cdn.example/hero.png"],
        ],
        "",
        ALICE,
      ),
    );
    open(
      ev(8, [
        ["a", `30009:${ALICE}:hero`],
        ["p", "c".repeat(64)],
      ]),
    );
    expect(screen.getByTestId("activity-title")).toHaveTextContent("Claims a badge");
    // Drawn as nothing of the badge's: no picture, no name in its colours.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("badge-image")).toBeNull();
    expect(screen.queryByTestId("badge-name")).toBeNull();
  });

  it("a deletion of many asks for the five it shows, and the rest on Show all", async () => {
    const targets = Array.from({ length: 12 }, (_, i) => `${"7".repeat(62)}${String(i).padStart(2, "0")}`);
    askedIds.length = 0;
    open(
      ev(
        5,
        targets.map((t) => ["e", t]),
      ),
    );
    await waitFor(() => expect(askedIds.length).toBeGreaterThan(0));
    expect(Math.max(...askedIds.map((ids) => ids.length))).toBe(5);
    fireEvent.click(screen.getByTestId("activity-quotes-toggle"));
    await waitFor(() => expect(askedIds.some((ids) => ids.length === 12)).toBe(true));
  });

  it("a label on a thousand people draws a folded roster, not a thousand chips", () => {
    const people = Array.from({ length: 1000 }, (_, i) => i.toString(16).padStart(64, "0"));
    open(ev(1985, [["L", "ugc"], ["l", "spam", "ugc"], ["l", "spam", "com.example"], ...people.map((p) => ["p", p])]));
    expect(screen.queryAllByTestId("mention-chip")).toHaveLength(0);
    expect(within(screen.getByTestId("label-targets")).getAllByTestId(/^set-member-/)).toHaveLength(25);
    // One value in two namespaces is two labels.
    expect(screen.getAllByTestId("label-value")).toHaveLength(2);
  });

  it("a kind-17 reaction with only an `r` shows the page it names", () => {
    open(ev(17, [["r", "https://example.com/old"]], "+"));
    expect(screen.getByTestId("link-chip").getAttribute("href")).toBe("https://example.com/old");
  });
});
