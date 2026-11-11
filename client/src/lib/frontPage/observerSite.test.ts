import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  ARCHIVE_PATH,
  DEFAULT_EVENT_BUDGET,
  DEFAULT_MAX_TAGS,
  EDITIONS_PATH,
  INDEX_PATH,
  aggregateHash,
  archiveHtml,
  editionPath,
  eventBudget,
  isRealDay,
  latestDay,
  mergeEntries,
  manifestTemplate,
  observerNaddr,
  observerUrl,
  parseEditions,
  pathTags,
  pubkeyB36,
  rebuildFromPaths,
  rollOff,
  serializeEditions,
  signedSize,
  siteTitle,
  upsertEdition,
  utcDay,
  type EditionEntry,
} from "./observerSite";

const hash = (n: number) => n.toString(16).padStart(64, "0");
const entry = (day: string, n: number, extra: Partial<EditionEntry> = {}): EditionEntry => ({
  day,
  path: editionPath(day),
  sha256: hash(n),
  ...extra,
});

function days(count: number): EditionEntry[] {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, i) => entry(utcDay(start + i * 86_400_000), i + 1));
}

describe("editions.json", () => {
  it("round-trips newest first and keeps fields it doesn't know", () => {
    const index = {
      v: 1 as const,
      title: "Lira's Observer",
      editions: [
        entry("2026-11-10", 1, { headline: "Twelve relays", posts: 412, quotesVerified: 3 }),
        entry("2026-11-11", 2, { code: "D35280", futureField: { a: 1 } }),
      ],
    };
    const back = parseEditions(serializeEditions(index))!;
    expect(back.title).toBe("Lira's Observer");
    expect(back.editions.map((e) => e.day)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(back.editions[0].futureField).toEqual({ a: 1 });
    expect(back.editions[1].headline).toBe("Twelve relays");
  });

  it("refuses another version and skips entries missing a required field", () => {
    expect(parseEditions('{"v":2,"title":"x","editions":[]}')).toBeNull();
    expect(parseEditions("not json")).toBeNull();
    const parsed = parseEditions(
      JSON.stringify({
        v: 1,
        title: "t",
        editions: [
          { day: "2026-11-10", path: "/2026-11-10.html" },
          { day: "2026-11-09", path: "/other.html", sha256: hash(1) },
          { day: "2026-11-08", path: "/2026-11-08.html", sha256: hash(2) },
        ],
      }),
    )!;
    expect(parsed.editions.map((e) => e.day)).toEqual(["2026-11-08"]);
  });

  it("rebuilds the entries from the dated path tags when the index can't be read", () => {
    const tags = [
      ["d", "observer"],
      ["path", INDEX_PATH, hash(2)],
      ["path", "/2026-11-10.html", hash(1)],
      ["path", "/2026-11-11.html", hash(2)],
      ["path", ARCHIVE_PATH, hash(3)],
      ["path", EDITIONS_PATH, hash(4)],
    ];
    expect(rebuildFromPaths(tags)).toEqual([entry("2026-11-11", 2), entry("2026-11-10", 1)]);
  });

  it("takes only real calendar days", () => {
    expect(isRealDay("2026-11-11")).toBe(true);
    expect(isRealDay("2028-02-29")).toBe(true);
    expect(isRealDay("2026-02-30")).toBe(false);
    expect(isRealDay("2026-13-01")).toBe(false);
    expect(rebuildFromPaths([["path", "/2026-02-30.html", hash(1)]])).toEqual([]);
    expect(
      parseEditions(
        JSON.stringify({
          v: 1,
          title: "",
          editions: [{ day: "2026-99-99", path: "/2026-99-99.html", sha256: hash(1) }],
        }),
      )!.editions,
    ).toEqual([]);
  });

  it("describes each served day by its index entry when the bytes match, else by the path alone", () => {
    const merged = mergeEntries(
      [
        entry("2026-11-10", 1, { headline: "kept" }),
        entry("2026-11-09", 5, { headline: "stale hash" }),
        entry("2026-11-01", 3),
      ],
      [entry("2026-11-11", 2), entry("2026-11-10", 1), entry("2026-11-09", 6)],
    );
    expect(merged.map((e) => [e.day, e.sha256, e.headline])).toEqual([
      ["2026-11-11", hash(2), undefined],
      ["2026-11-10", hash(1), "kept"],
      ["2026-11-09", hash(6), undefined],
    ]);
  });

  it("a second print the same UTC day replaces that day's entry", () => {
    const list = upsertEdition([entry("2026-11-10", 1), entry("2026-11-11", 2)], entry("2026-11-11", 9));
    expect(list.map((e) => [e.day, e.sha256])).toEqual([
      ["2026-11-11", hash(9)],
      ["2026-11-10", hash(1)],
    ]);
    expect(utcDay(Date.UTC(2026, 10, 11, 23, 59))).toBe("2026-11-11");
  });
});

describe("roll-off", () => {
  const base = { servers: ["https://blossom.example"], title: "T", description: "D", createdAt: 1_800_000_000 };

  it("keeps the newest 90", () => {
    const kept = rollOff(days(120), { ...base, budget: 1_000_000 });
    expect(kept).toHaveLength(90);
    expect(kept[0].day).toBe(utcDay(Date.UTC(2026, 0, 1) + 119 * 86_400_000));
  });

  it("then drops the oldest while the signed manifest is over the budget, never today's", () => {
    const all = days(30);
    const files = { archive: hash(0), editions: hash(0) };
    const full = signedSize(
      { entries: all, files, servers: base.servers, title: "T", description: "D" },
      base.createdAt,
    );
    const budget = full - 250; // two to three editions too many
    const kept = rollOff(all, { ...base, budget });
    expect(kept.length).toBeLessThan(30);
    expect(kept.length).toBeGreaterThan(25);
    expect(
      signedSize({ entries: kept, files, servers: base.servers, title: "T", description: "D" }, base.createdAt),
    ).toBeLessThanOrEqual(budget);
    expect(kept[0]).toEqual(all.sort((a, b) => (a.day < b.day ? 1 : -1))[0]);
    expect(rollOff(all, { ...base, budget: 10 })).toHaveLength(1);
  });

  it("also keeps the manifest under the tag-count budget", () => {
    const kept = rollOff(days(90), { ...base, budget: 1_000_000, maxTags: 50 });
    const tags = manifestTemplate({
      entries: kept,
      files: { archive: hash(0), editions: hash(0) },
      servers: base.servers,
      title: "T",
      description: "D",
      aggregate: hash(0),
    }).tags;
    expect(tags.length).toBeLessThanOrEqual(50);
    expect(tags.length).toBeGreaterThan(45);
    expect(DEFAULT_MAX_TAGS).toBe(100);
    // 90 editions with six servers don't fit in the default 100 tags.
    const many = { ...base, servers: Array.from({ length: 6 }, (_, i) => `https://s${i}.example`) };
    expect(rollOff(days(90), { ...many, budget: 1_000_000 }).length).toBeLessThan(90);
  });

  it("never drops the protected day, even when a bogus future day sorts above it", () => {
    const today = "2026-11-11";
    const all = [entry("2099-01-01", 99), ...days(40), entry(today, 7)];
    const kept = rollOff(all, { ...base, budget: 10, protect: today });
    expect(kept.map((e) => e.day)).toContain(today);
  });

  it("budgets from the smallest relay limit, less the envelope, else the default", () => {
    expect(eventBudget([131_072, 65_536, undefined])).toBe(64_536);
    expect(eventBudget([undefined, null])).toBe(DEFAULT_EVENT_BUDGET);
  });
});

describe("manifest", () => {
  it("points /index.html at the newest edition's bytes and lists every file", () => {
    const tags = pathTags([entry("2026-11-10", 1), entry("2026-11-11", 2)], { archive: hash(3), editions: hash(4) });
    expect(tags).toEqual([
      ["path", INDEX_PATH, hash(2)],
      ["path", "/2026-11-11.html", hash(2)],
      ["path", "/2026-11-10.html", hash(1)],
      ["path", ARCHIVE_PATH, hash(3)],
      ["path", EDITIONS_PATH, hash(4)],
    ]);
    const template = manifestTemplate({
      entries: [entry("2026-11-11", 2)],
      files: { archive: hash(3), editions: hash(4) },
      servers: ["https://a.example"],
      title: siteTitle("Lira"),
      description: "desc",
      aggregate: hash(5),
    });
    expect(template.kind).toBe(35128);
    expect(template.tags[0]).toEqual(["d", "observer"]);
    expect(template.tags).toContainEqual(["x", hash(5), "aggregate"]);
    expect(template.tags).toContainEqual(["server", "https://a.example"]);
    expect(template.tags).toContainEqual(["title", "Lira's Observer"]);
    expect(siteTitle("")).toBe("The Nostr Observer");
  });

  it("never lets a future day take /index.html", () => {
    const tags = pathTags(
      [entry("2099-01-01", 9), entry("2026-11-11", 2)],
      { archive: hash(3), editions: hash(4) },
      latestDay(Date.UTC(2026, 10, 11, 10)),
    );
    expect(tags[0]).toEqual(["path", INDEX_PATH, hash(2)]);
    expect(latestDay(Date.UTC(2026, 10, 11, 23))).toBe("2026-11-12");
  });

  it("computes the NIP-5A aggregate hash, independent of tag order", async () => {
    const tags = [
      ["path", "/index.html", "186ea5fd14e88fd1ac49351759e7ab906fa94892002b60bf7f5a428f28ca1c99"],
      ["title", "ignored"],
      ["path", "/favicon.ico", "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"],
    ];
    // sha256 of the sorted lines, computed independently.
    const expected = "c2ff582b672a4c689c5e1753528f03dd31b95ec1fdcc3d82d25e7d91e8769638";
    expect(await aggregateHash(tags)).toBe(expected);
    expect(await aggregateHash([tags[2], tags[0]])).toBe(expected);
  });

  it("names the canonical named-site URL and the naddr", () => {
    const pk = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    expect(pubkeyB36(pk)).toBe("318hs83r8s0us5bzfbdfzp4eajc6mwu5zmr55uagvni4yl6460");
    expect(pubkeyB36("0".repeat(63) + "1")).toHaveLength(50);
    expect(observerUrl(pk)).toBe("https://318hs83r8s0us5bzfbdfzp4eajc6mwu5zmr55uagvni4yl6460observer.nsite.lol");
    const decoded = nip19.decode(observerNaddr(pk, ["wss://r.example"]));
    expect(decoded.type).toBe("naddr");
    expect(decoded.data).toMatchObject({ kind: 35128, pubkey: pk, identifier: "observer" });
  });
});

describe("archive.html", () => {
  it("lists editions newest first with relative links, escaped, and no script", () => {
    const html = archiveHtml({
      v: 1,
      title: "Lira's <Observer>",
      editions: [entry("2026-11-10", 1, { headline: '<script>alert("x")</script> & co' }), entry("2026-11-11", 2)],
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Lira's &lt;Observer&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(html.indexOf("./2026-11-11.html")).toBeLessThan(html.indexOf("./2026-11-10.html"));
    expect(html).toContain('href="./index.html"');
    // The link is named from the day, never from a path another producer wrote.
    const odd = archiveHtml({ v: 1, title: "", editions: [{ ...entry("2026-11-12", 1), path: "//evil.example/x" }] });
    expect(odd).toContain('href="./2026-11-12.html"');
    expect(odd).not.toContain("evil.example");
  });
});
