import { afterEach, describe, expect, it, vi } from "vitest";
import { Observable } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { RelayOutageError, askRelay, printFrontPage, pullCorpus, probeRanking, writePage } from "./frontPage";
import { PAPER_CSP, parsePage, toPermalink } from "@/lib/frontPage/validate";

const OBSERVER = "aa".repeat(32);
const AUTHOR = "bb".repeat(32);
const NOTE_ID = "1".repeat(64);
const PIC_ID = "2".repeat(64);
const QUOTE = "The relay answered in three seconds flat";

const ev = (over: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "0".repeat(64),
    pubkey: AUTHOR,
    kind: 1,
    created_at: 1_786_900_000,
    content: "",
    tags: [],
    sig: "",
    ...over,
  }) as NostrEvent;

const NOTE = ev({ id: NOTE_ID, content: `${QUOTE}, and then it didn't answer at all.` });
const PICTURE = ev({
  id: PIC_ID,
  kind: 20,
  content: "Sunrise over the harbour",
  tags: [["imeta", "url https://blossom.example/sunrise.jpg", "m image/jpeg", "dim 1200x800"]],
});
const MINE = ev({ id: "3".repeat(64), pubkey: OBSERVER, content: "my own note" });
const CONTROL = ev({ id: "4".repeat(64), content: "spam everywhere" });
const PROFILE = ev({ id: "5".repeat(64), kind: 0, content: JSON.stringify({ name: "Alice" }) });

type Msg = { type: "EVENT"; event: NostrEvent } | { type: "EOSE" } | { type: "CLOSED"; reason: string };

/** A relay that answers the search grammar the way search.brainstorm.world does, closely enough. */
function fakeRelay({ observedNotes = [NOTE, MINE], anonymousNotes = [CONTROL], silentFor = [] as number[][] } = {}) {
  const asked: Record<string, unknown>[] = [];
  return {
    asked,
    relay: {
      url: "wss://search.example/",
      req(filters: Record<string, unknown>[]) {
        const filter = filters[0];
        asked.push(filter);
        return new Observable<Msg>((sub) => {
          const kinds = filter.kinds as number[];
          if (silentFor.some((k) => k.join() === kinds.join())) return; // never answers
          const search = String(filter.search ?? "");
          let events: NostrEvent[] = [];
          if (kinds.includes(0)) events = search.includes("include:spam") ? [PROFILE] : [];
          else if (search.startsWith("observer:")) {
            if (kinds.includes(1)) events = observedNotes;
            if (kinds.includes(20)) events = [PICTURE];
          } else if (search.startsWith("include:spam") && kinds.includes(1)) events = anonymousNotes;
          else {
            sub.next({ type: "CLOSED", reason: "auth-required: no observer" });
            return;
          }
          queueMicrotask(() => {
            for (const event of events) sub.next({ type: "EVENT", event });
            sub.next({ type: "EOSE" });
          });
        });
      },
    },
  };
}

const sse = (chunks: string[], usage = { prompt_tokens: 1200, completion_tokens: 800 }) => {
  const lines = [
    ...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
    `data: ${JSON.stringify({ choices: [], usage })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};

/** A stream of raw `data:` payloads; `open` leaves it unclosed, as a provider that hangs would. */
const rawSse = (payloads: unknown[], { open = false } = {}) => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const p of payloads) {
          controller.enqueue(encoder.encode(`data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`));
        }
        if (!open) controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};
const delta = (content: string, finish_reason: string | null = null) => ({
  choices: [{ delta: { content }, finish_reason }],
});

/** fakeRelay, but a CLOSED for every REQ [closes] picks. */
function closingRelay(closes: (filter: Record<string, unknown>) => boolean, options = {}) {
  const base = fakeRelay(options);
  return {
    asked: base.asked,
    relay: {
      url: base.relay.url,
      req(filters: Record<string, unknown>[]) {
        if (!closes(filters[0])) return base.relay.req(filters);
        base.asked.push(filters[0]);
        return new Observable<Msg>((sub) => {
          queueMicrotask(() => sub.next({ type: "CLOSED", reason: "error: overloaded" }));
        });
      },
    },
  };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>The Nostr Observer</title></head><body>
<div class="folio"><span>No. X</span><span>Friday</span><span>24h to 12:00 UTC</span></div>
<h1>The Nostr Observer</h1>
<p>Alice wrote: <q>${QUOTE}</q> <a href="https://jumble.social/notes/${NOTE_ID}">source</a></p>
<figure><img src="art-1" alt="filed with her note"><figcaption>Alice</figcaption></figure>
</body></html>`;

const key = { key: "sk-test", url: "https://openrouter.ai/api/v1" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("askRelay", () => {
  it("drains to EOSE, and a CLOSED is an answer with a note, never a throw", async () => {
    const { relay } = fakeRelay();
    const ranked = await askRelay(relay as never, { kinds: [1], search: `observer:${OBSERVER} sort:rank` });
    expect(ranked).toEqual({ events: [NOTE, MINE], note: null });
    const closed = await askRelay(relay as never, { kinds: [1], search: "sort:rank" });
    expect(closed.events).toEqual([]);
    expect(closed.note).toMatch(/^closed: auth-required/);
  });

  it("a relay that goes quiet is given up on after the idle window", async () => {
    vi.useFakeTimers();
    const { relay } = fakeRelay({ silentFor: [[1]] });
    const answer = askRelay(relay as never, { kinds: [1], search: `observer:${OBSERVER}` }, { idleMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await answer).toEqual({ events: [], note: "idle" });
  });

  it("refuses a REQ over the relay's frame budget instead of letting it vanish", async () => {
    const { relay } = fakeRelay();
    await expect(askRelay(relay as never, { authors: ["x".repeat(250_000)] })).rejects.toThrow(/byte budget/);
  });
});

describe("the ranking gate", () => {
  it("is ready when the observed read answers", async () => {
    expect(await probeRanking(fakeRelay().relay as never, OBSERVER, 0)).toBe("ready");
  });

  it("catches rankings stored but not projected: observed empty, anonymous not", async () => {
    expect(await probeRanking(fakeRelay({ observedNotes: [] }).relay as never, OBSERVER, 0)).toBe("projection-pending");
  });

  it("is never ready on reads that didn't end cleanly", async () => {
    // A CLOSED or timed-out observed read returned nothing because nothing came back.
    const observedCloses = closingRelay((f) => String(f.search).startsWith("observer:"));
    expect(await probeRanking(observedCloses.relay as never, OBSERVER, 0)).toBe("relay-unreachable");
    const anonymousCloses = closingRelay((f) => String(f.search).startsWith("include:spam"));
    expect(await probeRanking(anonymousCloses.relay as never, OBSERVER, 0)).toBe("relay-unreachable");
  });

  it("an empty window is a quiet day, not a broken ranking", async () => {
    expect(await probeRanking(fakeRelay({ observedNotes: [], anonymousNotes: [] }).relay as never, OBSERVER, 0)).toBe(
      "ready",
    );
  });
});

describe("pullCorpus", () => {
  it("one REQ per desk through the reader's ranking with the floor, one control, then bylines", async () => {
    const { relay, asked } = fakeRelay();
    const progress: number[] = [];
    const corpus = await pullCorpus({
      relay: relay as never,
      observer: OBSERVER,
      until: 1_786_900_000,
      onProgress: (p) => progress.push(p.desksDone),
    });

    const desks = asked.filter((f) => String(f.search).startsWith("observer:"));
    expect(desks).toHaveLength(14);
    for (const f of desks) expect(f.search).toBe(`observer:${OBSERVER} sort:rank filter:rank:gte:20`);
    expect(asked.filter((f) => f.search === "include:spam sort:rank")).toHaveLength(1);
    expect(asked.find((f) => (f.kinds as number[])[0] === 0)?.search).toBe("include:spam");
    expect(progress.at(-1)).toBe(15);

    expect(corpus.desks.notes.map((e) => e.id)).toEqual([NOTE_ID]); // the reader's own note is not news
    expect(corpus.control.map((e) => e.id)).toEqual([CONTROL.id]);
    expect(corpus.overlap).toBe(0);
    expect(corpus.art.map((a) => a.id)).toEqual(["art-1"]);
    expect(corpus.profiles[AUTHOR].name).toBe("Alice");
    expect(corpus.until - corpus.since).toBe(24 * 60 * 60);
  });
});

describe("pullCorpus when the relay fails", () => {
  it("stops before the model when most desks didn't answer", async () => {
    const { relay } = closingRelay(
      (f) => String(f.search).startsWith("observer:") && !(f.kinds as number[]).includes(1),
    );
    await expect(pullCorpus({ relay: relay as never, observer: OBSERVER, until: 1_786_900_000 })).rejects.toThrow(
      RelayOutageError,
    );
  });

  it("names the desks that didn't answer when they are a few", async () => {
    const { relay } = closingRelay((f) => (f.kinds as number[]).includes(20));
    const corpus = await pullCorpus({ relay: relay as never, observer: OBSERVER, until: 1_786_900_000 });
    expect(corpus.unanswered?.length).toBeGreaterThan(0);
    expect(corpus.unanswered!.length).toBeLessThan(7);
  });
});

describe("writePage", () => {
  it("streams and reports progress and usage", async () => {
    const fetch = vi.fn().mockResolvedValue(sse(["<p>", "hello</p>"]));
    vi.stubGlobal("fetch", fetch);
    const seen: number[] = [];
    const out = await writePage({ key, model: "m", messages: [], onText: (n) => seen.push(n) });
    expect(out.text).toBe("<p>hello</p>");
    expect(out.usage).toEqual({ promptTokens: 1200, completionTokens: 800 });
    expect(seen.at(-1)).toBe(12);
  });

  it("falls back to a plain request when the provider refuses a stream", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("stream_options not supported", { status: 400 }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "<p>plain</p>" } }] }));
    vi.stubGlobal("fetch", fetch);
    const out = await writePage({ key, model: "m", messages: [] });
    expect(out.text).toBe("<p>plain</p>");
    expect(JSON.parse(fetch.mock.calls[1][1].body).stream).toBe(false);
  });

  it("an error frame mid-stream is a failure, never a page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          rawSse([delta("<!doctype html><p>half"), { error: { message: "upstream died" } }, "[DONE]"]),
        ),
    );
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/upstream died/);
  });

  it("a finish_reason other than stop is a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawSse([delta("<p>half", "length"), "[DONE]"])));
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/ran out of room/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawSse([delta("<p>x", "content_filter"), "[DONE]"])));
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/content filter/);
  });

  it("a stream that just stops (no [DONE], no stop) is a failure; one that says stop is not", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawSse([delta("<p>half")])));
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/stopped before it was finished/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawSse([delta("<p>whole</p>", "stop")])));
    expect((await writePage({ key, model: "m", messages: [] })).text).toBe("<p>whole</p>");
  });

  it("stops reading at [DONE], even when the connection stays open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(rawSse([delta("<p>done</p>"), "[DONE]", delta("<p>after</p>")], { open: true })),
    );
    expect((await writePage({ key, model: "m", messages: [] })).text).toBe("<p>done</p>");
  });

  it("holds a non-streamed answer to the same rule", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ choices: [{ message: { content: "<p>half" }, finish_reason: "length" }] })),
    );
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/ran out of room/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "quota exceeded" } })));
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/quota exceeded/);
  });

  it("says a rejected key in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/AI key was rejected/);
  });
});

describe("printFrontPage", () => {
  it("prints a page that quotes verbatim, cites its source and uses shortlist art", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([PAGE.slice(0, 200), PAGE.slice(200)])));
    const steps: string[] = [];
    const result = await printFrontPage({
      key,
      model: "m",
      observer: OBSERVER,
      readerName: "Reader",
      relay: fakeRelay().relay as never,
      onStep: (s) => steps.push(s.step),
    });
    expect(result.status).toBe("printed");
    if (result.status !== "printed") return;
    expect(result.rounds).toBe(1);
    expect(result.quotes).toBe(1);
    expect(result.html).toContain('src="https://blossom.example/sunrise.jpg"');
    expect(result.html).toContain(`href="${toPermalink(NOTE_ID)}"`);
    expect(result.html).toMatch(/^<!doctype html>/);
    // The page may leave the sandbox (Download, Observer site): it carries the app's CSP.
    expect(parsePage(result.html).head.firstElementChild?.getAttribute("content")).toBe(PAPER_CSP);
    expect(result.usage?.completionTokens).toBe(800);
    expect([...new Set(steps)]).toEqual(["probe", "pull", "write", "check"]);
  });

  it("sends a refused page back once, and prints the fixed one", async () => {
    const bad = PAGE.replace(QUOTE, "A sentence nobody ever posted");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sse([bad]))
      .mockResolvedValueOnce(sse([PAGE]));
    vi.stubGlobal("fetch", fetch);
    const result = await printFrontPage({
      key,
      model: "m",
      observer: OBSERVER,
      readerName: "R",
      relay: fakeRelay().relay as never,
    });
    expect(result.status).toBe("printed");
    if (result.status === "printed") expect(result.rounds).toBe(2);
    const repair = JSON.parse(fetch.mock.calls[1][1].body).messages;
    expect(repair).toHaveLength(4);
    expect(repair[3].content).toMatch(/QUOTE: not found verbatim/);
  });

  it("the validator is not negotiable: refused twice means no page", async () => {
    const bad = PAGE.replace(QUOTE, "A sentence nobody ever posted");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(sse([bad]))),
    );
    const result = await printFrontPage({
      key,
      model: "m",
      observer: OBSERVER,
      readerName: "R",
      relay: fakeRelay().relay as never,
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.violations.map((v) => v.kind)).toEqual(["QUOTE"]);
  });

  it("never pulls or spends while the reader's rankings are not projected", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { relay, asked } = fakeRelay({ observedNotes: [] });
    const result = await printFrontPage({
      key,
      model: "m",
      observer: OBSERVER,
      readerName: "R",
      relay: relay as never,
    });
    expect(result).toEqual({ status: "not-ready", reason: "projection-pending" });
    expect(asked).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never spends on the model when the relay is down", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { relay } = closingRelay((f) => String(f.search).startsWith("observer:"));
    const result = await printFrontPage({
      key,
      model: "m",
      observer: OBSERVER,
      readerName: "R",
      relay: relay as never,
    });
    expect(result).toEqual({ status: "not-ready", reason: "relay-unreachable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      printFrontPage({
        key,
        model: "m",
        observer: OBSERVER,
        readerName: "R",
        relay: fakeRelay().relay as never,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
