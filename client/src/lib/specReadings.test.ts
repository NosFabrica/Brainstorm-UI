/**
 * Each reading as its spec writes it, one describe per spec: the fields a
 * surface shows come only from the tags the spec defines, the way it defines
 * them. The fixtures are the specs' own examples where they give one.
 */
import { describe, expect, it } from "vitest";
import { chatContextOf } from "@/lib/chatMessage";
import { readUserStatus } from "@/lib/userStatus";
import { relayListEntries } from "@/lib/relayList";
import { audioOf, hasAudioHero } from "@/lib/audioEvent";
import { embedShapeOf } from "@/lib/embedShape";
import { liveHostOf, liveTitleOf, readMeeting } from "@/lib/liveStream";
import { readsAsArticle } from "@/lib/shareId";
import { replyRefs, type MinimalEvent } from "@/lib/noteRefs";
import { webBookmarkOf } from "@/lib/webBookmark";
import { readListItems, listItemCounts, ITEM_LIST_KINDS } from "@/lib/listItems";

const PK = "4".repeat(64);
const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: "1".repeat(64),
  kind,
  pubkey: PK,
  created_at: 1_790_000_000,
  tags,
  content,
});

describe("NIP-23 — a long-form draft (30024) reads on the article reader", () => {
  it("in the clear, like an article; self-encrypted (NIP-04), never as an article", () => {
    expect(readsAsArticle(ev(30024, [["d", "x"]], "# Draft\n\nWords."))).toBe(true);
    expect(readsAsArticle(ev(30024, [["d", "x"]], "c2VjcmV0c2VjcmV0c2VjcmV0?iv=aXZpdml2aXZpdml2aXZpdg=="))).toBe(false);
    expect(readsAsArticle(ev(30023, [["d", "x"]], "Words."))).toBe(true);
    expect(readsAsArticle(ev(1, [], "Words."))).toBe(false);
  });
});

describe("NIP-53 — streams, meeting spaces and meetings", () => {
  const space = ev(30312, [
    ["d", "main-conference-room"],
    ["room", "Main Conference Hall"],
    ["summary", "Our primary conference space"],
    ["image", "https://example.com/room.jpg"],
    ["status", "open"],
    ["service", "https://meet.example.com/room"],
    ["endpoint", "https://api.example.com/room"],
    ["t", "conference"],
    ["p", "f".repeat(64), "wss://nostr.example.com/", "Owner"],
    ["p", "e".repeat(64), "wss://provider2.com/", "Moderator"],
    ["relays", "wss://relay1.com", "wss://relay2.com"],
  ]);
  const meeting = ev(30313, [
    ["d", "annual-meeting-2025"],
    ["a", `30312:${"f".repeat(64)}:main-conference-room`, "wss://nostr.example.com"],
    ["title", "Annual Company Meeting 2025"],
    ["summary", "Yearly company-wide meeting"],
    ["starts", "1676262123"],
    ["ends", "1676269323"],
    ["status", "live"],
    ["total_participants", "180"],
    ["current_participants", "175"],
    ["p", "9".repeat(64), "wss://provider1.com/", "Speaker"],
  ]);

  it("a space is named by its `room`, a meeting by its `title`", () => {
    expect(liveTitleOf(space)).toBe("Main Conference Hall");
    expect(liveTitleOf(meeting)).toBe("Annual Company Meeting 2025");
    expect(liveTitleOf(ev(30312, [["title", "Not its name"]]))).toBeUndefined();
    expect(liveTitleOf(ev(30313, [["room", "A room"]]))).toBeUndefined();
  });

  it("a space: its status, its way in (`service`, never the `endpoint` API), its people and their roles", () => {
    const m = readMeeting(space)!;
    expect(m).toMatchObject({
      status: "open",
      service: "https://meet.example.com/room",
      image: "https://example.com/room.jpg",
    });
    expect(m.participants.map((p) => p.role)).toEqual(["Owner", "Moderator"]);
    expect(JSON.stringify(m)).not.toContain("api.example.com");
  });

  it("a meeting: its space by `a`, its times and counts", () => {
    const m = readMeeting(meeting)!;
    expect(m.space).toEqual({
      kind: 30312,
      pubkey: "f".repeat(64),
      identifier: "main-conference-room",
      relays: ["wss://nostr.example.com"],
    });
    expect(m).toMatchObject({
      startsSec: 1676262123,
      endsSec: 1676269323,
      currentParticipants: 175,
      totalParticipants: 180,
    });
    expect(m.service).toBeUndefined();
  });

  it("a space or meeting with no name is not one; quoted, it is drawn as the stream card", () => {
    expect(readMeeting(ev(30312, [["status", "open"]]))).toBeNull();
    expect(embedShapeOf(space)).toBe("live");
    expect(embedShapeOf(meeting)).toBe("live");
    expect(embedShapeOf(ev(30312, [["status", "open"]]))).toBe("note");
  });

  it("the host is the `p` whose role is Host, in any case", () => {
    expect(liveHostOf(ev(30311, [["p", "a".repeat(64), "", "Host"]]))).toBe("a".repeat(64));
    expect(liveHostOf(ev(30311, [["p", "a".repeat(64), "", "host"]]))).toBe("a".repeat(64));
    expect(liveHostOf(ev(30311, [["p", "a".repeat(64), "", "Speaker"]]))).toBeNull();
  });

  it("a live chat message (1311) is in the activity its `a` names; an `e` is its parent", () => {
    const msg = ev(1311, [
      ["a", `30311:${PK}:demo-cf-stream`, "", "root"],
      ["e", "2".repeat(64)],
    ]);
    expect(chatContextOf(msg)).toEqual({
      place: { type: "stream", address: { kind: 30311, pubkey: PK, identifier: "demo-cf-stream", relays: undefined } },
      replyTo: { id: "2".repeat(64), relay: undefined },
    });
  });
});

describe("NIP-28 — a channel message (42)", () => {
  const CHANNEL = "c".repeat(64);
  const PARENT = "d".repeat(64);
  it("its `root` e is the channel, its `reply` e the message it answers", () => {
    const reply = ev(42, [
      ["e", CHANNEL, "wss://r.example", "root"],
      ["e", PARENT, "wss://r.example", "reply"],
      ["p", PK],
    ]);
    expect(chatContextOf(reply)).toEqual({
      place: { type: "channel", id: CHANNEL, relay: "wss://r.example" },
      replyTo: { id: PARENT, relay: "wss://r.example" },
    });
    // The thread above it is the message it answers, not the channel.
    expect(replyRefs(reply)).toEqual({ rootId: PARENT, parentId: PARENT });
  });

  it("a message straight to the channel answers no one", () => {
    const root = ev(42, [["e", CHANNEL, "", "root"]]);
    expect(chatContextOf(root)?.replyTo).toBeNull();
    expect(replyRefs(root)).toEqual({});
  });

  it("unmarked, NIP-10's deprecated positional reading: the first `e` is the channel", () => {
    expect(chatContextOf(ev(42, [["e", CHANNEL]]))).toEqual({
      place: { type: "channel", id: CHANNEL, relay: undefined },
      replyTo: null,
    });
    expect(
      chatContextOf(
        ev(42, [
          ["e", CHANNEL],
          ["e", PARENT],
        ]),
      )?.replyTo?.id,
    ).toBe(PARENT);
  });
});

describe("NIP-C7 / NIP-29 — a chat message (9)", () => {
  it("a reply quotes its parent with `q`; in a relay group it carries the group's `h`", () => {
    const msg = ev(9, [
      ["h", "pizza-lovers"],
      ["q", "3".repeat(64), "wss://group.example", PK],
    ]);
    expect(chatContextOf(msg)).toEqual({
      place: { type: "group", id: "pizza-lovers" },
      replyTo: { id: "3".repeat(64), relay: "wss://group.example" },
    });
    expect(chatContextOf(ev(9, [], "GM"))).toEqual({ place: null, replyTo: null });
  });
});

describe("NIP-65 — a relay list (10002)", () => {
  it("no marker is both; `read` and `write` are one each", () => {
    const list = ev(10002, [
      ["r", "wss://alicerelay.example.com"],
      ["r", "wss://brando-relay.com"],
      ["r", "wss://expensive-relay.example2.com", "write"],
      ["r", "wss://nostr-relay.example.com", "read"],
      ["r", "https://not-a-relay.example"],
    ]);
    expect(relayListEntries(list)).toEqual([
      { url: "wss://alicerelay.example.com", read: true, write: true },
      { url: "wss://brando-relay.com", read: true, write: true },
      { url: "wss://expensive-relay.example2.com", read: false, write: true },
      { url: "wss://nostr-relay.example.com", read: true, write: false },
    ]);
    expect(embedShapeOf(list)).toBe("relay-list");
  });

  it("a relay listed once each way is both, once", () => {
    const list = ev(10002, [
      ["r", "wss://nos.lol/", "read"],
      ["r", "wss://nos.lol", "write"],
    ]);
    expect(relayListEntries(list)).toEqual([{ url: "wss://nos.lol", read: true, write: true }]);
  });
});

describe("NIP-38 — a user status (30315)", () => {
  it("the `d` is the type, the content the status, one link, an optional expiration", () => {
    const music = ev(
      30315,
      [
        ["d", "music"],
        ["r", "spotify:search:Intergalatic%20-%20Beastie%20Boys"],
        ["expiration", "1692845589"],
      ],
      "Intergalatic - Beastie Boys",
    );
    expect(readUserStatus(music)).toMatchObject({
      type: "music",
      label: "Listening to",
      text: "Intergalatic - Beastie Boys",
      link: { type: "url", url: "spotify:search:Intergalatic%20-%20Beastie%20Boys" },
      expiresAt: 1692845589,
      cleared: false,
    });
    expect(embedShapeOf(music)).toBe("status");
  });

  it("links a profile, a note or an address; never a script", () => {
    expect(
      readUserStatus(
        ev(
          30315,
          [
            ["d", "general"],
            ["p", PK],
          ],
          "Hi",
        ),
      )?.link,
    ).toEqual({
      type: "profile",
      pubkey: PK,
      relay: undefined,
    });
    expect(
      readUserStatus(
        ev(
          30315,
          [
            ["d", "general"],
            ["a", `30311:${PK}:show`],
          ],
          "On air",
        ),
      )?.link,
    ).toMatchObject({
      type: "address",
      kind: 30311,
      identifier: "show",
    });
    expect(
      readUserStatus(
        ev(
          30315,
          [
            ["d", "general"],
            ["r", "javascript:alert(1)"],
          ],
          "x",
        ),
      )?.link,
    ).toBeNull();
  });

  it("an empty content clears it; an app's JSON record is not words", () => {
    expect(readUserStatus(ev(30315, [["d", "general"]], ""))).toMatchObject({ cleared: true, text: null });
    expect(readUserStatus(ev(30315, [["d", "presence"]], '{"lastSeen":1795602571313}'))).toMatchObject({
      record: true,
      text: null,
      label: "presence",
    });
  });
});

describe("NIP-B0 — a web bookmark (39701)", () => {
  it("`d` is the URL without its https scheme; `published_at` when it was first published", () => {
    const b = webBookmarkOf(
      ev(
        39701,
        [
          ["d", "alice.blog/post"],
          ["published_at", "1738863000"],
          ["title", "Blog insights by Alice"],
          ["t", "post"],
          ["t", "insight"],
        ],
        "A marvelous insight by Alice about the nature of blogs and posts.",
      ),
    );
    expect(b).toMatchObject({
      url: "https://alice.blog/post",
      host: "alice.blog",
      title: "Blog insights by Alice",
      topics: ["post", "insight"],
      publishedAt: 1738863000,
    });
  });
});

describe("NIP-51 — app curation sets (30267) and media starter packs (39092)", () => {
  it("an app curation set holds software applications by `a`, read as apps", () => {
    const set = ev(
      30267,
      [
        ["d", "nostr"],
        ["a", `32267:${"7".repeat(64)}:com.example.app1`],
        ["a", `32267:${"0".repeat(64)}:net.example.app2`],
        ["a", `32267:${"2".repeat(64)}:pl.code.app3`],
      ],
      "My nostr app selection",
    );
    expect(ITEM_LIST_KINDS.has(30267)).toBe(true);
    expect(listItemCounts(readListItems(set))).toEqual(["3 apps"]);
    expect(embedShapeOf(set)).toBe("item-list");
  });

  it("a media starter pack is its people", () => {
    expect(
      embedShapeOf(
        ev(39092, [
          ["d", "x"],
          ["p", PK],
        ]),
      ),
    ).toBe("people-list");
  });
});

describe("kind 1808 — an audio header (Stemstr's; no NIP)", () => {
  it("plays its file before its HLS stream, which an <audio> element plays only in Safari", () => {
    const stemstr = ev(1808, [
      ["download_url", "https://cdn.stemstr.app/download/abc.wav", "audio/wav"],
      ["stream_url", "https://cdn.stemstr.app/stream/abc.m3u8", "application/vnd.apple.mpegurl"],
      ["x", "abc"],
      ["waveform", "[1,2,3]"],
    ]);
    expect(audioOf(stemstr)).toBe("https://cdn.stemstr.app/download/abc.wav");
  });

  it("a `url` beside a `blossom` mime (Nosis' audio notes); quoted, a player row", () => {
    const nosis = ev(
      1808,
      [
        ["url", "https://audio.nostr.build/df02fe32fae1d1"],
        ["blossom", "df02fe32fae1d1", "audio/mp4"],
        ["duration", "33.3"],
        ["subject", "Audio Note"],
      ],
      "Words.",
    );
    expect(audioOf(nosis)).toBe("https://audio.nostr.build/df02fe32fae1d1");
    expect(hasAudioHero(nosis)).toBe(true);
    expect(embedShapeOf(nosis)).toBe("audio");
    // A blossom file said to be a video is not a sound.
    expect(
      audioOf(
        ev(1808, [
          ["url", "https://x.example/f"],
          ["blossom", "f", "video/mp4"],
        ]),
      ),
    ).toBeUndefined();
  });
});
