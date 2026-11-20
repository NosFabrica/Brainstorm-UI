import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { EditionEntry } from "@/lib/frontPage/observerSite";
import { loadEditionContext, readLocalPrints, rememberLocalPrint } from "./editionContext";

const READER = "aa".repeat(32);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const NOW = Date.parse("2026-11-13T12:00:00Z");

const page = (comments: string) => `<!doctype html><html><body>${comments}<h2>x</h2></body></html>`;
const NEWEST = page(
  "<!-- masthead: The Purple Gazette | the network voted --><!-- sections: The Diary · Long Reads -->",
);
const entry = (day: string, html: string, headline: string): EditionEntry => ({
  day,
  path: `/${day}.html`,
  sha256: sha(html),
  headline,
  printedAt: Math.floor(Date.parse(`${day}T06:00:00Z`) / 1000),
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("the edition's context", () => {
  it("counts every site's and this browser's days, and reads the newest page back from a site", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(NEWEST)));
    vi.stubGlobal("fetch", fetch);
    rememberLocalPrint(READER, { day: "2026-11-09", headline: "Printed here only", recipe: "30023:x:bread" });
    const context = await loadEditionContext({
      pubkey: READER,
      history: {
        site: [entry("2026-11-12", NEWEST, "Bitcoin loses seventy thousand"), entry("2026-11-10", page(""), "Older")],
        runnerSite: [entry("2026-11-11", page(""), "By the Assistant")],
        servers: ["https://blossom.example"],
      },
      zone: "America/New_York",
      now: NOW,
    });
    // 9, 10, 11, 12: today is the fifth.
    expect(context.number).toBe(5);
    expect(context.recent.map((r) => r.headline)).toEqual([
      "Bitcoin loses seventy thousand",
      "By the Assistant",
      "Older",
      "Printed here only",
    ]);
    expect(context.paper).toEqual({
      masthead: "The Purple Gazette",
      motto: null,
      sections: ["The Diary", "Long Reads"],
    });
    expect(context.clock.zoneId).toBe("America/New_York");
    expect(context.recentRecipes).toEqual(new Set(["30023:x:bread"]));
    // Only the newest page is fetched; the rest only if held here.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`https://blossom.example/${sha(NEWEST)}`);
  });

  it("this tab's paper is the newest page when it is, and nothing is fetched", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = page("<!-- motto: Read through one reader's trust | why -->");
    const context = await loadEditionContext({
      pubkey: READER,
      history: {
        site: [entry("2026-11-11", page(""), "Older")],
        servers: ["https://blossom.example"],
        session: { html, printedAt: Date.parse("2026-11-12T07:00:00Z") },
      },
      zone: null,
      now: NOW,
    });
    expect(context.paper.motto).toBe("Read through one reader's trust");
    expect(context.number).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("with nothing to read, is the first edition of the house paper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const context = await loadEditionContext({
      pubkey: READER,
      history: { site: [entry("2026-11-12", NEWEST, "x")], servers: ["https://blossom.example"] },
      zone: "Not/A_Zone",
      now: NOW,
    });
    expect(context.paper.masthead).toBe("The Nostr Observer");
    expect(context.number).toBe(2);
    expect(context.clock.zoneId).not.toBe("Not/A_Zone");
  });

  it("remembers this browser's prints per account, one per day", () => {
    rememberLocalPrint(READER, { day: "2026-11-12", headline: "a", recipe: null });
    rememberLocalPrint(READER, { day: "2026-11-12", headline: "b", recipe: "r" });
    rememberLocalPrint(READER, { day: "2026-11-13", headline: "c", recipe: null });
    expect(readLocalPrints(READER).map((p) => p.headline)).toEqual(["c", "b"]);
    expect(readLocalPrints("bb".repeat(32))).toEqual([]);
  });
});
