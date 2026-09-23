/**
 * Which app published this event, and where does it open there?
 *
 * Provenance, not hand-off: `lib/openInApp` offers any Nostr client that can
 * render a kind; this answers the narrower question "this thing lives in
 * Conduit / on zap.cooking — take me to it there". Two apps today, each
 * recognised by what their own publisher stamps on the event (probed on the
 * relays, 2026-09-22), each opened at the page their own docs and live site
 * resolve.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { sourceAppFor, CONDUIT_REFERRAL } from "./sourceApp";

const MERCHANT = "6".repeat(64);
const COOK = "9".repeat(64);

const listing = (tags: string[][]) => ({
  id: "1".repeat(64),
  kind: 30402,
  pubkey: MERCHANT,
  created_at: 1_790_000_000,
  content: "",
  tags: [["d", "spartan-beanie-zbkwud"], ["title", "Spartan Beanie"], ["price", "21000", "sats"], ...tags],
});

const article = (tags: string[][]) => ({
  id: "2".repeat(64),
  kind: 30023,
  pubkey: COOK,
  created_at: 1_790_000_000,
  content: "# Gırık",
  tags: [["d", "girik"], ["title", "Gırık"], ...tags],
});

describe("a listing published in Conduit", () => {
  it("opens on Conduit's product page, carrying our referral", () => {
    const ev = listing([["client", "Conduit Merchant Portal", "31990:f8ae:conduit-merchant", "wss://relay.conduit.market"]]);

    const app = sourceAppFor(ev);

    const naddr = nip19.naddrEncode({ kind: 30402, pubkey: MERCHANT, identifier: "spartan-beanie-zbkwud" });
    expect(app).toMatchObject({ name: "Conduit", host: "shop.conduit.market" });
    expect(app?.url).toBe(`https://shop.conduit.market/products/${naddr}?${CONDUIT_REFERRAL}`);
  });

  it("is recognised by its marketplace tag, or by a shop link on conduit.market, just the same", () => {
    const byTag = sourceAppFor(listing([["t", "conduit"], ["t", "hat"]]));
    const byShop = sourceAppFor(listing([["r", "https://shop.conduit.market/store/npub1f0x"]]));

    expect(byTag?.name).toBe("Conduit");
    expect(byShop?.name).toBe("Conduit");
    expect(byShop?.url).toContain("/products/");
  });

  it("is nobody's when it is another shop's, a note, or has no address to open", () => {
    expect(sourceAppFor(listing([["r", "https://barattolo.app/l/maglia-1"]]))).toBeNull();
    expect(sourceAppFor({ ...listing([["t", "conduit"]]), kind: 1 })).toBeNull();
    const noAddress = listing([["client", "Conduit Merchant Portal"]]);
    noAddress.tags = noAddress.tags.filter((t) => t[0] !== "d");
    expect(sourceAppFor(noAddress)).toBeNull();
  });
});

describe("a recipe published on zap.cooking", () => {
  it("opens on zap.cooking, and calls itself a recipe rather than an article", () => {
    const app = sourceAppFor(article([["t", "zapcooking"], ["t", "zapcooking-girik"], ["t", "chicken"]]));

    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: COOK, identifier: "girik" });
    expect(app).toMatchObject({ name: "Zap.cooking", host: "zap.cooking", noun: "Recipe" });
    expect(app?.url).toBe(`https://zap.cooking/recipe/${naddr}`);
  });

  it("still counts under the older nostrcooking tag, in any case — but a slug alone is not the tag", () => {
    expect(sourceAppFor(article([["t", "nostrcooking"]]))?.name).toBe("Zap.cooking");
    expect(sourceAppFor(article([["t", "ZapCooking"]]))?.name).toBe("Zap.cooking");
    expect(sourceAppFor(article([["t", "zapcooking-girik"]]))).toBeNull();
  });

  // zap.cooking's own long-form pieces — its newsletter, food stories — wear
  // the recipe tag too, marked `zapreads` (probed 2026-09-22: 5 of 100).
  it("a zap.cooking article, marked zapreads, is not a recipe", () => {
    expect(sourceAppFor(article([["t", "zapreads"], ["t", "zapcooking"], ["t", "newsletter"]]))).toBeNull();
  });

  it("an ordinary article is nobody's", () => {
    expect(sourceAppFor(article([["t", "bitcoin"]]))).toBeNull();
  });
});
