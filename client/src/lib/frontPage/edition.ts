/**
 * What an edition knows beyond the day's posts: the reader's clock, its number, the last
 * few front pages, and the masthead, motto and sections the last edition left. All of it
 * goes in the writer's message above the corpus, outside the data block, because it is
 * ours.
 *
 * Matched to Amethyst's `commons/.../frontpage/FrontPageEdition.kt`.
 */
import { browserTimeZone, isValidTimeZone, zoneOffset } from "@/lib/scheduledTasks";

/** The paper's house name: its masthead until an edition announces another (`standingPaper`). */
export const MASTHEAD = "The Nostr Observer";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const two = (n: number) => String(n).padStart(2, "0");

/** The civil date of a wall clock written as UTC seconds. */
function civil(wallSec: number) {
  const d = new Date(Math.floor(wallSec / 86_400) * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** "Friday, November 13, 2026". */
function longDate(c: ReturnType<typeof civil>): string {
  return `${WEEKDAYS[c.weekday]}, ${MONTHS[c.month - 1]} ${c.day}, ${c.year}`;
}

/** "2026-11-13". */
function dayKey(c: ReturnType<typeof civil>): string {
  return `${c.year}-${two(c.month)}-${two(c.day)}`;
}

/** A `yyyy-MM-dd` day key as a date, or null when it isn't one. */
function ofKey(key: string): ReturnType<typeof civil> | null {
  const m = /^(-?\d+)-(\d{1,2})-(\d{1,2})$/.exec(key.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const at = Date.UTC(y, mo - 1, d);
  // Hinnant's days-from-civil rolls an overflowing day over, as Date.UTC does.
  return civil(Math.floor(at / 1000));
}

/**
 * The reader's clock for one edition: the schedule's IANA zone, else this browser's, else
 * UTC. The date, the window's close and every time in the digest are told on it, with the
 * zone named, so the writer never converts between zones.
 */
export class EditionClock {
  constructor(
    /** The IANA name ("America/New_York"), or "UTC". */
    readonly zoneId: string,
    /** The zone's offset from UTC at an instant, in seconds. */
    private readonly offsetAt: (epochSec: number) => number,
  ) {}

  static readonly UTC = new EditionClock("UTC", () => 0);

  /** A clock at a fixed offset (tests, and the zone names that are one). */
  static fixed(zoneId: string, offsetSec: number): EditionClock {
    return new EditionClock(zoneId, () => offsetSec);
  }

  /** The zone named `zoneId`, when this browser knows it. */
  static of(zoneId: string | null | undefined): EditionClock | null {
    const id = zoneId?.trim();
    if (!id || !isValidTimeZone(id)) return null;
    return new EditionClock(id, (epochSec) => Math.round(zoneOffset(epochSec * 1000, id) / 1000));
  }

  /** The schedule's zone (`scheduleZone`), else this browser's, else UTC. */
  static forReader(scheduleZone: string | null | undefined): EditionClock {
    return EditionClock.of(scheduleZone) ?? EditionClock.of(browserTimeZone()) ?? EditionClock.UTC;
  }

  private wall(epochSec: number) {
    return epochSec + this.offsetAt(epochSec);
  }

  /** "Friday, November 13, 2026". */
  date(epochSec: number): string {
    return longDate(civil(this.wall(epochSec)));
  }

  /** "2026-11-13": the day on this clock. */
  day(epochSec: number): string {
    return dayKey(civil(this.wall(epochSec)));
  }

  /** "07:47", on the 24-hour clock. */
  time(epochSec: number): string {
    const seconds = ((this.wall(epochSec) % 86_400) + 86_400) % 86_400;
    return `${two(Math.floor(seconds / 3_600))}:${two(Math.floor((seconds % 3_600) / 60))}`;
  }

  /** "2026-11-13 07:47": a post's time in the digest. */
  stamp(epochSec: number): string {
    return `${this.day(epochSec)} ${this.time(epochSec)}`;
  }

  /** "UTC-05:00" at `epochSec`: the zone's offset then. */
  offset(epochSec: number): string {
    const total = this.offsetAt(epochSec);
    const sign = total < 0 ? "-" : "+";
    const minutes = Math.floor(Math.abs(total) / 60);
    return `UTC${sign}${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
  }

  /** "America/New_York, UTC-05:00", or "UTC". */
  zoneLabel(epochSec: number): string {
    return this.zoneId === "UTC" && this.offsetAt(epochSec) === 0 ? "UTC" : `${this.zoneId}, ${this.offset(epochSec)}`;
  }
}

/** "Friday, November 13, 2026" for a kept edition's `yyyy-MM-dd` `day`; the key itself when it isn't one. */
export function longDay(day: string): string {
  const c = ofKey(day);
  return c ? longDate(c) : day;
}

/** One front page the writer is reminded of: its day and its lead headline. */
export interface RecentHeadline {
  day: string;
  headline: string;
}

/** The paper as the last editions left it: its name, motto and standing sections. */
export interface StandingPaper {
  masthead: string;
  motto: string | null;
  sections: string[];
}

export const HOUSE_PAPER: StandingPaper = { masthead: MASTHEAD, motto: null, sections: [] };

/** Everything about the edition beyond its posts, for the writer's message. */
export interface EditionContext {
  paper: StandingPaper;
  /** `Vol. I · No. N`'s N; null when it can't be counted (then none is printed). */
  number: number | null;
  recent: RecentHeadline[];
  clock: EditionClock;
  /** The Kitchen's recipes recent editions ran (`recipeAddress`): not offered again (`pickRecipe`). */
  recentRecipes: ReadonlySet<string>;
}

export function emptyContext(clock: EditionClock = EditionClock.UTC): EditionContext {
  return { paper: HOUSE_PAPER, number: null, recent: [], clock, recentRecipes: new Set() };
}

/** What continuity needs of a kept edition: its day, and its headline or recipe when known. */
export interface KnownEdition {
  /** `yyyy-MM-dd`. */
  day: string;
  headline?: string | null;
  /** The Kitchen's recipe it ran, as its address. */
  recipe?: string | null;
}

/** The edition number of a print on `today`: one more than the distinct days printed before (or after) it. */
export function editionNumber(days: readonly string[], today: string): number {
  return new Set(days.filter((d) => d.trim() !== "" && d !== today)).size + 1;
}

/** How many recent editions' recipes the Kitchen won't offer again. */
export const RECENT_RECIPES = 14;

const newestFirst = <T extends KnownEdition>(editions: readonly T[]) =>
  [...editions].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));

/** The recipes the last `max` editions before `today` ran, as their addresses. */
export function recentRecipes(editions: readonly KnownEdition[], today: string, max = RECENT_RECIPES): Set<string> {
  return new Set(
    newestFirst(editions.filter((e) => e.day !== today))
      .slice(0, max)
      .map((e) => e.recipe)
      .filter((r): r is string => !!r),
  );
}

/** How many recent front pages the writer is shown. */
export const RECENT_HEADLINES = 5;

/** The last `max` front pages before `today` that have a headline, newest first, one per day. */
export function recentHeadlines(
  editions: readonly KnownEdition[],
  today: string,
  max = RECENT_HEADLINES,
): RecentHeadline[] {
  const seen = new Set<string>();
  const out: RecentHeadline[] = [];
  for (const e of newestFirst(editions.filter((e) => e.day !== today && !!e.headline?.trim()))) {
    if (seen.has(e.day)) continue;
    seen.add(e.day);
    out.push({ day: e.day, headline: clean(e.headline!, 160) });
    if (out.length >= max) break;
  }
  return out;
}

const ANNOUNCEMENT = /<!--\s*(masthead|motto|sections)\s*:([\s\S]*?)-->/gi;
const SECTION_SPLIT = /\s*[·•|,;]\s*/;

/** One line of the writer's own words read back: no markup, no line breaks, at most `max` characters. */
function clean(text: string, max: number): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** The masthead, motto and sections one page's comments announce; nulls where it says nothing. */
export interface Announced {
  masthead: string | null;
  motto: string | null;
  sections: string[] | null;
}

/**
 * The `<!-- masthead: … | why -->`, `<!-- motto: … | why -->` and `<!-- sections: A · B -->`
 * comments of `html`: the first of each. These are the writer's own words read back into the
 * next brief, so each is one short line without markup (`clean`).
 */
export function announcedIn(html: string): Announced {
  let masthead: string | null = null;
  let motto: string | null = null;
  let sections: string[] | null = null;
  for (const match of html.matchAll(ANNOUNCEMENT)) {
    const value = match[2].split("|")[0];
    switch (match[1].toLowerCase()) {
      case "masthead":
        if (masthead === null) masthead = clean(value, 60) || null;
        break;
      case "motto":
        if (motto === null) motto = clean(value, 120) || null;
        break;
      case "sections":
        if (sections === null) {
          const list = [
            ...new Set(
              value
                .split(SECTION_SPLIT)
                .map((s) => clean(s, 40))
                .filter(Boolean),
            ),
          ].slice(0, 12);
          sections = list.length ? list : null;
        }
        break;
    }
  }
  return { masthead, motto, sections };
}

/**
 * The paper as `pages` (newest first) leave it: each of the masthead, the motto and the
 * sections from the newest page that announces it; the house name, and none, otherwise.
 */
export function standingPaper(pages: readonly string[]): StandingPaper {
  const read = pages.map(announcedIn);
  return {
    masthead: read.find((r) => r.masthead)?.masthead ?? MASTHEAD,
    motto: read.find((r) => r.motto)?.motto ?? null,
    sections: read.find((r) => r.sections)?.sections ?? [],
  };
}
