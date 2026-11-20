import { describe, expect, it } from "vitest";
import {
  editionDayLabel,
  latestHeadline,
  reduceProgress,
  startProgress,
  statusLine,
  writeDetail,
  THINKING_KEEP,
  type PrintEvent,
  type PrintProgress,
} from "@/lib/frontPage/printProgress";

describe("latestHeadline", () => {
  it("is the newest complete h1-h3, not the masthead, not one still open", () => {
    expect(latestHeadline("<!doctype html><h1>The Nostr Observer</h1>")).toBeNull();
    expect(latestHeadline('<h1 class="mast">The Nostr Observer</h1><h2 class="lead">Relays went quiet</h2>')).toBe(
      "Relays went quiet",
    );
    expect(latestHeadline("<h2>First</h2><p>…</p><h3>Second</h3><h2>Third, still being wri")).toBe("Second");
    expect(latestHeadline("<h2>First</h2><h4>Not a headline</h4>")).toBe("First");
    expect(latestHeadline("<p>no headings</p><h2")).toBeNull();
  });

  it("reads the words: inner tags out, entities read, whitespace collapsed, cut to fit", () => {
    expect(latestHeadline("<h2>Zaps &amp; <em>relays</em>\n   &#8212; a week</h2>")).toBe("Zaps & relays — a week");
    const long = latestHeadline(`<h3>${"word ".repeat(30)}</h3>`)!;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });
});

const T0 = 1_000_000;

function run(events: [number, PrintEvent][]): PrintProgress {
  let p = startProgress("OpenRouter", "deepseek/deepseek-r1", T0);
  for (const [at, e] of events) p = reduceProgress(p, e, T0 + at);
  return p;
}
const w = (event: Extract<PrintEvent, { type: "write" }>["event"], round = 1): PrintEvent => ({
  type: "write",
  round,
  event,
});

describe("print progress", () => {
  it("goes waiting → thinking → writing: <headline> → checking, logging each step", () => {
    const steps: string[] = [];
    let p = startProgress("OpenRouter", "deepseek/deepseek-r1", T0);
    const at = (ms: number, e: PrintEvent) => {
      p = reduceProgress(p, e, T0 + ms);
      steps.push(statusLine(p, T0 + ms + 500));
    };
    at(0, { type: "probe" });
    at(100, { type: "pull", progress: { desksDone: 3, desksTotal: 15, events: 400 } });
    at(900, { type: "pull", progress: { desksDone: 15, desksTotal: 15, events: 1200 } });
    at(1000, w({ type: "sent", streamed: true }));
    at(1000 + 41_000, w({ type: "alive" }));
    at(1000 + 42_000, w({ type: "first-byte" }));
    at(1000 + 42_100, w({ type: "reasoning", text: "Lead with the outage." }));
    at(1000 + 60_000, w({ type: "content", text: "<!doctype html><h1>The Nostr Observer</h1><h2>Relays went" }));
    at(1000 + 60_100, w({ type: "content", text: " quiet</h2><p>…" }));
    at(1000 + 70_000, w({ type: "done", chars: 12_000, usage: { promptTokens: 900, completionTokens: 300 } }));
    at(1000 + 70_001, { type: "check", round: 1 });
    at(1000 + 70_500, { type: "checked", round: 1, quotes: 4, violations: 0, removed: 1 });
    expect(steps).toEqual([
      "Checking your ranking",
      "Reading the desks · 400 posts",
      "Reading the desks · 1,200 posts",
      "Waiting for the model… 0:00",
      "Waiting for the model… 0:41",
      "Waiting for the model… 0:42",
      "Thinking…",
      "Writing",
      "Writing: Relays went quiet",
      "Writing: Relays went quiet",
      "Checking quotes, pictures and links",
      "Checking quotes, pictures and links",
    ]);
    expect(p.log.map((l) => l.text)).toEqual([
      "OpenRouter · deepseek/deepseek-r1",
      "Checking your ranking",
      "Reading 15 desks",
      "Read 1,200 posts from 15/15 desks",
      "Request sent",
      "The provider says it is still working",
      "First byte after 42.0 s",
      "Thinking",
      "Writing started",
      "Section: Relays went quiet",
      "Writing done: 12.0k characters, 1,200 tokens, after 70.0 s",
      "Checking quotes, pictures and links",
      "Check passed: 4 quotes verified, 1 thing removed",
    ]);
    expect(p.thinking).toBe("Lead with the outage.");
  });

  it("the wait's clock is left out of the status a screen reader hears", () => {
    const p = run([[0, w({ type: "sent", streamed: true })]]);
    expect(statusLine(p, T0 + 75_000)).toBe("Waiting for the model… 1:15");
    expect(statusLine(p, T0 + 75_000, false)).toBe("Waiting for the model…");
  });

  it("characters are a quiet aside while writing, never while waiting or thinking", () => {
    let p = run([[0, w({ type: "sent", streamed: true })]]);
    expect(writeDetail(p)).toBeNull();
    p = reduceProgress(p, w({ type: "reasoning", text: "hm" }), T0 + 1);
    expect(writeDetail(p)).toBeNull();
    p = reduceProgress(p, w({ type: "content", text: "x".repeat(2500) }), T0 + 2);
    expect(writeDetail(p)).toBe("2.5k characters");
  });

  it("keeps only the last few thousand characters of thinking", () => {
    const p = run([
      [0, w({ type: "sent", streamed: true })],
      [1, w({ type: "reasoning", text: "a".repeat(THINKING_KEEP) })],
      [2, w({ type: "reasoning", text: "END" })],
    ]);
    expect(p.thinking).toHaveLength(THINKING_KEEP);
    expect(p.thinking.endsWith("END")).toBe(true);
  });

  it("a provider that sends the page all at once says so, with no counter", () => {
    const p = run([
      [0, w({ type: "sent", streamed: true })],
      [10, w({ type: "whole" })],
      [20_000, w({ type: "content", text: "<h2>Lead</h2>" })],
    ]);
    expect(statusLine(p, T0 + 20_001)).toBe("Writing (this provider sends the page all at once)");
    expect(writeDetail(p)).toBeNull();
    const retried = run([
      [0, w({ type: "sent", streamed: true })],
      [10, w({ type: "sent", streamed: false })],
    ]);
    expect(statusLine(retried, T0 + 11)).toBe("Writing (this provider sends the page all at once)");
  });

  it("a repair round is Fixing the page, and says what it fixes", () => {
    const p = run([
      [0, w({ type: "sent", streamed: true })],
      [1, w({ type: "content", text: "<h2>A</h2>" })],
      [2, { type: "check", round: 1 }],
      [3, { type: "checked", round: 1, quotes: 2, violations: 3, removed: 0 }],
      [4, w({ type: "sent", streamed: true }, 2)],
      [5, w({ type: "content", text: "<h2>B</h2>" }, 2)],
    ]);
    expect(statusLine(p, T0 + 6)).toBe("Fixing the page");
    expect(p.log.map((l) => l.text)).toContain("Check found 3 problems");
    expect(p.log.map((l) => l.text)).toContain("Repair request sent: 3 problems to fix");
  });

  it("logs publishing and how the print ended", () => {
    const p = run([
      [0, { type: "end", outcome: "printed" }],
      [1, { type: "publish", state: "publishing" }],
      [2, { type: "publish", state: "failed", message: "no servers" }],
    ]);
    expect(p.log.slice(-3).map((l) => l.text)).toEqual([
      "Paper ready",
      "Publishing to your Observer",
      "Publishing failed: no servers",
    ]);
  });
});

describe("editionDayLabel", () => {
  const NY = "America/New_York";
  const now = Date.parse("2026-11-12T15:00:00Z"); // Thursday 10:00 in New York
  it("says Today, Yesterday, a weekday within the week, then a short date", () => {
    expect(editionDayLabel(Date.parse("2026-11-12T11:00:00Z"), now, NY)).toBe("Today");
    expect(editionDayLabel(Date.parse("2026-11-11T15:00:00Z"), now, NY)).toBe("Yesterday");
    expect(editionDayLabel(Date.parse("2026-11-08T15:00:00Z"), now, NY)).toBe("Sunday");
    expect(editionDayLabel(Date.parse("2026-11-01T15:00:00Z"), now, NY)).toBe("Nov 1");
  });

  it("reads the day in the zone, and rolls over at its midnight", () => {
    // 02:00 UTC on the 12th: still the 11th in New York, already the 12th in Tokyo.
    const late = Date.parse("2026-11-12T02:00:00Z");
    const noonUtc = Date.parse("2026-11-12T12:00:00Z"); // 07:00 in New York, 21:00 in Tokyo
    expect(editionDayLabel(late, noonUtc, NY)).toBe("Yesterday");
    expect(editionDayLabel(late, noonUtc, "Asia/Tokyo")).toBe("Today");
    const printed = Date.parse("2026-11-12T11:00:00Z");
    expect(editionDayLabel(printed, Date.parse("2026-11-13T04:59:00Z"), NY)).toBe("Today");
    expect(editionDayLabel(printed, Date.parse("2026-11-13T05:00:00Z"), NY)).toBe("Yesterday");
  });
});

describe("the plan pass", () => {
  const plan = (event: Extract<PrintEvent, { type: "plan" }>["event"]): PrintEvent => ({ type: "plan", event });

  it("says Planning the paper, shows its thinking, and logs the lead's angle", () => {
    const p = run([
      [0, { type: "probe" }],
      [100, { type: "pull", progress: { desksDone: 16, desksTotal: 16, events: 1200 } }],
      [200, plan({ type: "sent", streamed: true })],
      [300, plan({ type: "first-byte" })],
      [400, plan({ type: "reasoning", text: "The relay story leads." })],
      [500, plan({ type: "content", text: '{"lead":' })],
    ]);
    expect(p.step).toBe("plan");
    expect(statusLine(p, T0 + 600)).toBe("Planning the paper");
    expect(p.thinking).toBe("The relay story leads.");
    // The plan's JSON is not the page.
    expect(p.write?.text).toBe("");
    const texts = p.log.map((l) => l.text);
    expect(texts).toContain("Read 1,200 posts from 16/16 desks");
    expect(texts).toContain("Planning the paper");

    const planned = reduceProgress(p, { type: "planned", lead: "The relay held", full: 12 }, T0 + 700);
    expect(planned.log.at(-1)?.text).toBe("Planned · posts read in full: 12 · lead: The relay held");
    const failed = reduceProgress(p, { type: "plan-failed" }, T0 + 700);
    expect(failed.log.at(-1)?.text).toBe("No plan came back · writing from the digest alone");

    // The page call after it starts its own thinking, and says the desks only once.
    const writing = reduceProgress(planned, w({ type: "sent", streamed: true }), T0 + 800);
    expect(writing.step).toBe("write");
    expect(writing.thinking).toBe("");
    expect(writing.log.filter((l) => l.text.startsWith("Read ")).length).toBe(1);
  });

  it("each repair round is a fix, and only the last refusal means no paper", () => {
    const p = run([
      [0, w({ type: "sent", streamed: true })],
      [100, { type: "checked", round: 1, quotes: 2, violations: 1, removed: 0 }],
      [200, w({ type: "sent", streamed: true }, 3)],
      [300, { type: "checked", round: 4, last: true, quotes: 2, violations: 1, removed: 0 }],
    ]);
    expect(statusLine(p, T0 + 400)).toBe("Fixing the page");
    const texts = p.log.map((l) => l.text);
    expect(texts).toContain("Check found 1 problem");
    expect(texts).toContain("Repair request sent: 1 problem to fix");
    expect(texts.at(-1)).toBe("Check found 1 problem: not printed");
  });
});
