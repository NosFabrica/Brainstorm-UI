import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { assemble } from "./corpus";
import {
  EditionClock,
  MASTHEAD,
  announcedIn,
  editionNumber,
  emptyContext,
  longDay,
  recentHeadlines,
  standingPaper,
} from "./edition";
import { corpusPrefix, editionHeader } from "./writer";

// Amethyst's FrontPageEditionTest, case for case.

const edition = (day: string, headline: string | null = `Headline of ${day}`) => ({ day, headline });

describe("continuity", () => {
  it("the edition number counts distinct days before today", () => {
    const days = ["2026-11-10", "2026-11-11", "2026-11-11", "2026-11-12", "2026-11-13"];
    expect(editionNumber(days, "2026-11-13")).toBe(4);
    expect(editionNumber([], "2026-11-13")).toBe(1);
  });

  it("recent headlines are the last five days before today", () => {
    const editions = [
      ...[3, 4, 5, 6, 7, 8, 10, 11, 12].map((d) => edition(`2026-11-${String(d).padStart(2, "0")}`)),
      edition("2026-11-13"),
      edition("2026-11-09", null),
    ];
    const recent = recentHeadlines(editions, "2026-11-13");
    expect(recent.map((r) => r.day)).toEqual(["2026-11-12", "2026-11-11", "2026-11-10", "2026-11-08", "2026-11-07"]);
    expect(recent[0].headline).toBe("Headline of 2026-11-12");
  });

  it("the masthead, motto and sections are read back newest first", () => {
    const newest =
      "<body><!-- motto: Read through one reader's trust | first edition --><!-- sections: The Diary · Long Reads · The Classifieds --></body>";
    const older =
      "<body><!-- masthead: The Purple Gazette | the network voted --><!-- motto: An older line | why --></body>";
    const paper = standingPaper([newest, older]);
    expect(paper.masthead).toBe("The Purple Gazette");
    expect(paper.motto).toBe("Read through one reader's trust");
    expect(paper.sections).toEqual(["The Diary", "Long Reads", "The Classifieds"]);
    expect(standingPaper([]).masthead).toBe(MASTHEAD);
    // The writer's words come back as one plain line: no markup.
    expect(announcedIn("<!-- masthead: <b>Bold</b>\n name | x -->").masthead).toBe("Bold name");
    expect(announcedIn("<!-- restyle: black borders -->").masthead).toBeNull();
  });
});

describe("the reader's clock", () => {
  it("tells the date and time with its zone", () => {
    // 2026-11-13 12:47 UTC, read five hours behind.
    const at = 1_794_574_020;
    const clock = EditionClock.fixed("America/New_York", -5 * 3600);
    expect(clock.date(at)).toBe("Friday, November 13, 2026");
    expect(clock.time(at)).toBe("07:47");
    expect(clock.zoneLabel(at)).toBe("America/New_York, UTC-05:00");
    expect(longDay("2026-11-13")).toBe("Friday, November 13, 2026");
    expect(longDay("1970-01-01")).toBe("Thursday, January 1, 1970");
    expect(longDay("2028-02-29")).toBe("Tuesday, February 29, 2028");
    expect(EditionClock.UTC.zoneLabel(at)).toBe("UTC");
  });

  it("is the schedule's zone, else the browser's, else UTC, and follows the zone's own offset", () => {
    const ny = EditionClock.forReader("America/New_York");
    expect(ny.zoneId).toBe("America/New_York");
    // Daylight time in July, standard time in November.
    expect(ny.offset(1_784_000_000)).toBe("UTC-04:00");
    expect(ny.offset(1_794_574_020)).toBe("UTC-05:00");
    expect(EditionClock.of("Not/A_Zone")).toBeNull();
    expect(EditionClock.forReader("Not/A_Zone").zoneId).not.toBe("Not/A_Zone");
  });
});

describe("the header", () => {
  it("carries the edition, the clock and the day", async () => {
    const note = {
      id: "1".repeat(64),
      pubkey: "bb".repeat(32),
      kind: 1,
      created_at: 1_794_400_000,
      content: "hi",
      tags: [],
      sig: "",
    } as NostrEvent;
    const c = await assemble({
      observer: "aa".repeat(32),
      relay: "wss://search.example/",
      floor: 20,
      since: 1_794_182_400,
      until: 1_794_268_800,
      desks: { notes: [note] },
      control: [],
      profiles: {},
    });
    const context = {
      ...emptyContext(EditionClock.fixed("America/New_York", -5 * 3600)),
      paper: { masthead: "The Purple Gazette", motto: "A motto", sections: ["The Diary"] },
      number: 48,
      recent: [{ day: "2026-11-12", headline: "Bitcoin loses seventy thousand" }],
    };
    const header = editionHeader("Alice", "pt-BR", context, c, { read: 11_106, voices: 234, kept: 554 });
    for (const line of [
      "Masthead: The Purple Gazette",
      "Motto: A motto",
      "Standing sections: The Diary",
      "Edition: Vol. I · No. 48",
      `Edition code: ${c.code}`,
      "Date: Monday, November 9, 2026",
      "Window: the 24 hours to 19:00, on the reader's clock (America/New_York, UTC-05:00)",
      "11106 events read, 234 voices, 554 kept in the digest",
      "- Thursday, November 12, 2026: Bitcoin loses seventy thousand",
      "Links: citations https://brainstorm.world/e/<id>, people https://brainstorm.world/p/<id>",
    ]) {
      expect(header, line).toContain(line);
    }
    const message = corpusPrefix("DIGEST", header);
    expect(message.indexOf("Edition:")).toBeLessThan(message.indexOf("<corpus>"));
    // Nothing that can't be counted is printed.
    expect(editionHeader("Alice")).toBe("Masthead: The Nostr Observer\nReader: Alice");
  });
});
