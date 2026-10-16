/**
 * Opening hours as OpenStreetMap writes them (`opening_hours`), the subset
 * the Food and Drink list carries: rules separated by `;`, each a day or
 * day range (`Mo`, `Tu-Sa`, `Sa-Mo` wrapping the week) with one or more
 * `HH:MM-HH:MM` spans separated by `,`, or `off`; and `24/7`. A later rule
 * replaces an earlier one for its days, as the syntax means it. A span past
 * midnight (`10:00-02:00`) closes at 26:00 the same day, so a place is still
 * open in the next day's small hours. Anything the subset can't read is
 * null — no week is better than a wrong one.
 *
 * Times are minutes since the place's local midnight; what "now" is in the
 * place's time zone is the caller's business (components/items/PlaceView
 * estimates it from the longitude).
 */

export type Day = "mo" | "tu" | "we" | "th" | "fr" | "sa" | "su";
export const DAYS: Day[] = ["mo", "tu", "we", "th", "fr", "sa", "su"];

export interface Span {
  /** Minutes since local midnight. */
  open: number;
  /** Minutes since the same midnight; past 1440 when the span runs into the next day. */
  close: number;
}

export type Week = Record<Day, Span[]>;

export type OpeningStatus =
  { open: true; until: number } | { open: false; opensAt: number | null; opensDay: Day | null };

const DAY_NAMES: Record<string, Day> = { mo: "mo", tu: "tu", we: "we", th: "th", fr: "fr", sa: "sa", su: "su" };
const TIME = /^(\d{1,2}):(\d{2})$/;

function minutesOf(text: string): number | null {
  const m = TIME.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function daysOf(text: string): Day[] | null {
  const out: Day[] = [];
  for (const part of text.split(",")) {
    const range = part.trim().toLowerCase().split("-");
    if (range.length === 1) {
      const d = DAY_NAMES[range[0]];
      if (!d) return null;
      out.push(d);
      continue;
    }
    if (range.length !== 2) return null;
    const from = DAYS.indexOf(DAY_NAMES[range[0]]);
    const to = DAYS.indexOf(DAY_NAMES[range[1]]);
    if (from < 0 || to < 0) return null;
    for (let i = from; ; i = (i + 1) % 7) {
      out.push(DAYS[i]);
      if (i === to) break;
    }
  }
  return out;
}

function spansOf(text: string): Span[] | null {
  const out: Span[] = [];
  for (const part of text.split(",")) {
    const [a, b, ...rest] = part.trim().split("-");
    if (rest.length || b == null) return null;
    const open = minutesOf(a);
    let close = minutesOf(b);
    if (open == null || close == null) return null;
    if (close <= open) close += 1440; // past midnight
    out.push({ open, close });
  }
  return out;
}

const emptyWeek = (): Week => ({ mo: [], tu: [], we: [], th: [], fr: [], sa: [], su: [] });

export function parseOpeningHours(text: string | null | undefined): Week | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  if (s === "24/7") {
    const w = emptyWeek();
    for (const d of DAYS) w[d] = [{ open: 0, close: 1440 }];
    return w;
  }
  const week = emptyWeek();
  for (const rule of s.split(";")) {
    const r = rule.trim();
    if (!r) continue;
    // "Tu-Sa 11:00-20:00", "Mo,We 09:00-12:00", "Tu off"; days first, then the rest.
    const m = /^([A-Za-z]{2}(?:-[A-Za-z]{2})?(?:,[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+(.+)$/.exec(r);
    if (!m) return null;
    const days = daysOf(m[1]);
    if (!days) return null;
    const rest = m[2].trim().toLowerCase();
    const spans = rest === "off" || rest === "closed" ? [] : spansOf(rest);
    if (!spans) return null;
    for (const d of days) week[d] = spans.map((x) => ({ ...x }));
  }
  return week;
}

/** Whether the place is open at a local moment, and when that changes. */
export function openingStatus(week: Week, now: { day: Day; minutes: number }): OpeningStatus {
  const i = DAYS.indexOf(now.day);
  const today = week[now.day];
  const yesterday = week[DAYS[(i + 6) % 7]];
  // Still open from yesterday's span past midnight?
  for (const s of yesterday)
    if (s.close > 1440 && now.minutes < s.close - 1440) return { open: true, until: s.close - 1440 };
  for (const s of today)
    if (now.minutes >= s.open && now.minutes < s.close)
      return { open: true, until: s.close > 1440 ? s.close - 1440 : s.close };
  // Later today?
  const later = today.filter((s) => s.open > now.minutes).sort((a, b) => a.open - b.open)[0];
  if (later) return { open: false, opensAt: later.open, opensDay: now.day };
  // The next day with a span.
  for (let k = 1; k <= 7; k++) {
    const d = DAYS[(i + k) % 7];
    const first = [...week[d]].sort((a, b) => a.open - b.open)[0];
    if (first) return { open: false, opensAt: first.open, opensDay: d };
  }
  return { open: false, opensAt: null, opensDay: null };
}
