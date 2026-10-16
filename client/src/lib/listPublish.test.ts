/**
 * A list and the URL templates drafted for it go out in one order: every
 * event signed first, then the templates, then the header naming their ids —
 * so no published list ever pins a template no relay has.
 */
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { URL_TEMPLATES_CONCEPT } from "@/config/dictionary";
import type { CopyDraft, EventTemplate } from "./conceptCopy";
import { listHeaderTemplate, newListDraft } from "./listDraft";
import { newPublishSession, progressLabel, publishDefinition, type PublishSteps } from "./listPublish";

const ME = "a".repeat(64);
const STAND_IN = "d".repeat(64);
const RELAY = "wss://relay.example";

const draft = (): CopyDraft => ({
  ...newListDraft(),
  singular: "Book",
  plural: "Books",
  fields: [{ name: "isbn", enabled: true, requirement: "required", origin: "custom" }],
  templates: [{ id: STAND_IN, name: "Open Library book", template: "https://openlibrary.org/isbn/{isbn}" }],
  links: [{ templateId: STAND_IN, relay: RELAY, bindings: [["isbn", "isbn"]] }],
});
const headerOf = (d: CopyDraft) => listHeaderTemplate(d, { d: "books", author: ME, previous: null });

/** Steps that record what happened; an event's id is a count, so a re-sign shows. */
function fakeSteps({ failPublish }: { failPublish?: (ev: NostrEvent) => boolean } = {}) {
  const log: string[] = [];
  let n = 0;
  const steps: PublishSteps = {
    sign: vi.fn(async (t: EventTemplate) => {
      const id = String(++n).padStart(64, "0");
      log.push(`sign ${t.kind} ${id.slice(-2)}`);
      return { ...t, id, pubkey: ME, created_at: 0, sig: "" } as NostrEvent;
    }),
    publish: vi.fn(async (ev: NostrEvent) => {
      if (failPublish?.(ev)) {
        log.push(`fail ${ev.kind}`);
        throw new Error("relay said no");
      }
      log.push(`publish ${ev.kind} ${ev.id.slice(-2)}`);
    }),
  };
  return { steps, log };
}

describe("publishDefinition", () => {
  it("signs everything, then publishes the template before the header that names it", async () => {
    const { steps, log } = fakeSteps();
    const { header, draft: after } = await publishDefinition({ draft: draft(), headerOf, steps });
    expect(log).toEqual(["sign 9999 01", "sign 39998 02", "publish 9999 01", "publish 39998 02"]);
    const templateId = "1".padStart(64, "0");
    expect(header.tags).toContainEqual(["link", templateId, RELAY, "isbn", "isbn"]);
    expect(JSON.stringify(header.tags)).not.toContain(STAND_IN);
    expect(after.templates).toEqual([]);
    expect(after.links[0].templateId).toBe(templateId);
  });

  it("publishes the template as a kind 9999 item of the URL Templates list", async () => {
    const { steps } = fakeSteps();
    await publishDefinition({ draft: draft(), headerOf, steps });
    const template = vi.mocked(steps.sign).mock.calls[0][0];
    expect(template.kind).toBe(9999);
    expect(template.tags).toEqual([
      ["z", URL_TEMPLATES_CONCEPT],
      ["name", "Open Library book"],
      ["url-template", "https://openlibrary.org/isbn/{isbn}"],
      ["alt", "URL template: Open Library book"],
    ]);
  });

  it("publishes nothing when the signer refuses", async () => {
    const { steps } = fakeSteps();
    vi.mocked(steps.sign).mockImplementationOnce(async () => {
      throw new Error("refused");
    });
    await expect(publishDefinition({ draft: draft(), headerOf, steps })).rejects.toThrow("refused");
    expect(steps.publish).not.toHaveBeenCalled();
  });

  it("never publishes the header when its template wasn't", async () => {
    const { steps, log } = fakeSteps({ failPublish: (ev) => ev.kind === 9999 });
    const published = vi.fn();
    await expect(
      publishDefinition({ draft: draft(), headerOf, steps, onTemplatePublished: published }),
    ).rejects.toThrow(/"Open Library book" wasn't published, so neither was the list: relay said no/);
    expect(log).not.toContain("publish 39998 02");
    expect(published).not.toHaveBeenCalled();
  });

  it("a retry resends what it signed, and doesn't send a template twice", async () => {
    let headerFails = true;
    const { steps, log } = fakeSteps({ failPublish: (ev) => ev.kind === 39998 && headerFails });
    const session = newPublishSession();
    const published = vi.fn();
    await expect(
      publishDefinition({ draft: draft(), headerOf, steps, session, onTemplatePublished: published }),
    ).rejects.toThrow("relay said no");
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({ id: STAND_IN }),
      expect.objectContaining({ id: "1".padStart(64, "0") }),
    );

    headerFails = false;
    log.length = 0;
    await publishDefinition({ draft: draft(), headerOf, steps, session });
    expect(log).toEqual(["publish 39998 02"]);
  });

  it("an edit between attempts re-signs only what it changed", async () => {
    let headerFails = true;
    const { steps, log } = fakeSteps({ failPublish: (ev) => ev.kind === 39998 && headerFails });
    const session = newPublishSession();
    await expect(publishDefinition({ draft: draft(), headerOf, steps, session })).rejects.toThrow();

    headerFails = false;
    log.length = 0;
    await publishDefinition({ draft: { ...draft(), description: "Books worth reading" }, headerOf, steps, session });
    expect(log).toEqual(["sign 39998 03", "publish 39998 03"]);
  });

  it("publishes no template the header doesn't link", async () => {
    const { steps, log } = fakeSteps();
    const unbound: CopyDraft = {
      ...draft(),
      links: [{ templateId: STAND_IN, relay: RELAY, bindings: [["isbn", ""]] }],
    };
    const { header } = await publishDefinition({ draft: unbound, headerOf, steps });
    expect(log).toEqual(["sign 39998 01", "publish 39998 01"]);
    expect(header.tags.some((t) => t[0] === "link")).toBe(false);
  });

  it("refuses a header that still names a stand-in id", async () => {
    const { steps } = fakeSteps();
    const leaky = (d: CopyDraft): EventTemplate => ({ ...headerOf(d), tags: [["link", STAND_IN, RELAY]] });
    const unbound: CopyDraft = {
      ...draft(),
      links: [{ templateId: STAND_IN, relay: RELAY, bindings: [["isbn", ""]] }],
    };
    await expect(publishDefinition({ draft: unbound, headerOf: leaky, steps })).rejects.toThrow(/isn't ready/);
    expect(steps.publish).not.toHaveBeenCalled();
  });
});

describe("progressLabel", () => {
  it("says which step is under way", () => {
    expect(progressLabel(null)).toBe("Publishing…");
    expect(progressLabel({ step: "sign", what: "template", n: 1, of: 1 })).toBe("Signing the URL template…");
    expect(progressLabel({ step: "publish", what: "template", n: 2, of: 3 })).toBe("Publishing URL template 2 of 3…");
    expect(progressLabel({ step: "publish", what: "header" })).toBe("Publishing the list…");
  });
});
