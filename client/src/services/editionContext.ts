/**
 * What a print knows beyond the day's posts, gathered before it runs: the reader's clock,
 * the edition's number, the last front pages, the masthead, motto and sections the newest
 * editions announced, and the Kitchen's recipes recently run. From the reader's Observer
 * site, the site of the runner their schedule names, and this browser's own prints.
 * Amethyst's `FrontPagePrinter.editionContext`. Never fails a print: what can't be read is
 * left out.
 */
import { accountKey } from "@/lib/accountStorage";
import { readBlob } from "@/lib/blobCache";
import {
  EditionClock,
  editionNumber,
  recentHeadlines,
  recentRecipes,
  standingPaper,
  type EditionContext,
  type KnownEdition,
} from "@/lib/frontPage/edition";
import { utcDay, type EditionEntry } from "@/lib/frontPage/observerSite";
import { fetchBlob, leadHeadline } from "@/services/observerSite";

/** How many of the newest editions are read back for the masthead, motto and sections. */
export const PAGES_READ_BACK = 7;

/** How many of this browser's own prints it remembers, per account. */
const PRINTS_KEPT = 60;

/** How long the newest edition's page is waited for, before the print goes on without it. */
const NEWEST_PAGE_TIMEOUT_MS = 8_000;

/** One print this browser made: its day (the UTC day that names the site's file), headline and recipe. */
export interface LocalPrint {
  day: string;
  headline: string | null;
  recipe: string | null;
}

const printsKey = (pubkey: string) => accountKey("frontPage:prints", pubkey);

/** This browser's own prints for the account, newest first. */
export function readLocalPrints(pubkey: string): LocalPrint[] {
  try {
    const raw = localStorage.getItem(printsKey(pubkey));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((e): e is LocalPrint => !!e && typeof e === "object" && typeof (e as LocalPrint).day === "string")
      .map((e) => ({
        day: e.day,
        headline: typeof e.headline === "string" ? e.headline : null,
        recipe: typeof e.recipe === "string" ? e.recipe : null,
      }));
  } catch {
    return [];
  }
}

/** A print made here, remembered for the next editions (its day's earlier one is replaced). */
export function rememberLocalPrint(pubkey: string, print: LocalPrint) {
  try {
    const kept = [print, ...readLocalPrints(pubkey).filter((p) => p.day !== print.day)].slice(0, PRINTS_KEPT);
    localStorage.setItem(printsKey(pubkey), JSON.stringify(kept));
  } catch {
    // Private window or full storage: the next print knows less.
  }
}

/** A page this browser holds, or null. */
async function held(sha256: string): Promise<string | null> {
  try {
    return await readBlob(sha256.toLowerCase());
  } catch {
    return null;
  }
}

export interface EditionHistory {
  /** The reader's own Observer site's editions. */
  site: readonly EditionEntry[];
  /** The editions on the site of the runner the reader's schedule names; none without one. */
  runnerSite?: readonly EditionEntry[];
  /** Where either site's files are. */
  servers: readonly string[];
  /** This tab's last paper, when it has one: html and when it was printed (ms). */
  session?: { html: string; printedAt: number } | null;
}

/**
 * The edition's context as of a print at `now` (ms) for `pubkey`, on the schedule's `zone`
 * (else this browser's). The newest edition's page may be fetched from a site; the rest
 * only if this browser holds them.
 */
export async function loadEditionContext({
  pubkey,
  history,
  zone,
  now = Date.now(),
  signal,
}: {
  pubkey: string;
  history: EditionHistory;
  zone: string | null;
  now?: number;
  signal?: AbortSignal;
}): Promise<EditionContext> {
  const today = utcDay(now);
  const local = readLocalPrints(pubkey);
  const fromSites = [...history.site, ...(history.runnerSite ?? [])];
  const session = history.session ?? null;
  const known: KnownEdition[] = [
    ...fromSites.map((e) => ({ day: e.day, headline: e.headline ?? null })),
    ...local,
    ...(session ? [{ day: utcDay(session.printedAt), headline: leadHeadline(session.html) }] : []),
  ];

  // The newest pages, one per day: this tab's paper is in hand, a site's is fetched by hash.
  type Page = { day: string; at: number; html: () => Promise<string | null>; fetched: boolean };
  const pages: Page[] = fromSites.map((e) => ({
    day: e.day,
    at: e.printedAt ?? Date.parse(`${e.day}T12:00:00Z`) / 1000,
    html: () => held(e.sha256),
    fetched: true,
  }));
  if (session) {
    pages.push({
      day: utcDay(session.printedAt),
      at: session.printedAt / 1000 + 0.5,
      html: async () => session.html,
      fetched: false,
    });
  }
  pages.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.at - a.at));
  const newest = pages.filter((p, i) => pages.findIndex((q) => q.day === p.day) === i).slice(0, PAGES_READ_BACK);
  const read = await Promise.all(
    newest.map(async (page, index) => {
      try {
        const html = await page.html();
        if (html !== null || index > 0 || !page.fetched) return html;
        const entry = fromSites.find((e) => e.day === page.day);
        return entry
          ? await fetchBlob(entry.sha256, [...history.servers], { signal, timeoutMs: NEWEST_PAGE_TIMEOUT_MS })
          : null;
      } catch {
        return null;
      }
    }),
  );

  return {
    paper: standingPaper(read.filter((html): html is string => !!html)),
    number: editionNumber(
      known.map((e) => e.day),
      today,
    ),
    recent: recentHeadlines(known, today),
    clock: EditionClock.forReader(zone),
    recentRecipes: recentRecipes(local, today),
  };
}
