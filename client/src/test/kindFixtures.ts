/**
 * One fixture per kind whose rendering the kind-surfaces work covers — NIP-34
 * statuses, repo state and the legacy reply, releases in both shapes, the
 * Trusted Lists of things and NIP-52 calendar events — each with what every
 * surface must show of it, so the full page, a quote, a search card, a row and
 * its label are checked against the same event (kindSurfaces.test.tsx, and the
 * grid's check in SearchResults.test.tsx).
 */
import type { NostrEvent } from "nostr-tools";

export const FX_OWNER = "a".repeat(64);
export const FX_AUTHOR = "b".repeat(64);
const NOW = 1_790_000_000;
const FUTURE = Math.floor(Date.now() / 1000) + 5 * 86_400;
let n = 0x7000;
const id = () => (++n).toString(16).padStart(64, "0");

const event = (kind: number, tags: string[][], content = "", pubkey = FX_OWNER): NostrEvent =>
  ({ id: id(), kind, pubkey, created_at: NOW, tags, content, sig: "" }) as NostrEvent;

export const FX_REPO = `30617:${FX_OWNER}:ngit`;

export interface KindFixture {
  name: string;
  event: NostrEvent;
  /** The full page's hero (EventScreen's chain). */
  hero: string;
  /** The search grid's card: its test id, the event's id after it ("embedded-note" stands alone). */
  grid: string;
  /** What a quote is drawn as (lib/embedShape). */
  shape: string;
  /** Words every card surface shows of it (a quote, a top-page row, a grid card). */
  cardText: RegExp;
  /** Words the All tab's row (lib/resultSummary) says of it, in its title, body or facts. */
  rowText: RegExp;
  /** Its kind's name (lib/kindLabel). */
  label: string;
}

export const KIND_FIXTURES: KindFixture[] = [
  ...[
    [1630, "Open"],
    [1631, "Merged"],
    [1632, "Closed"],
    [1633, "Draft"],
  ].map(([kind, word]) => ({
    name: `status ${kind}`,
    event: event(
      kind as number,
      [
        ["e", "c".repeat(64), "", "root"],
        ["a", FX_REPO],
        ...(kind === 1631 ? [["merge-commit", "abcdef1234567"]] : []),
      ],
      "Looks good.",
    ),
    hero: "git-status-hero",
    grid: "git-status-card-",
    shape: "git-status",
    cardText: new RegExp(`${word}.*in ngit`),
    rowText: new RegExp(`Marked ${String(word).toLowerCase()}`),
    label: "Git status",
  })),
  {
    name: "repo state 30618",
    event: event(30618, [
      ["d", "ngit"],
      ["refs/heads/master", "2222222bbbb"],
      ["refs/tags/v1.0.0", "3333333cccc"],
      ["HEAD", "ref: refs/heads/master"],
    ]),
    hero: "repo-state-hero",
    grid: "repo-state-card-",
    shape: "repo-state",
    cardText: /ngit.*master.*1 branch · 1 tag/,
    rowText: /HEAD master/,
    label: "Repo state",
  },
  {
    name: "legacy git reply 1622",
    event: event(
      1622,
      [
        ["a", FX_REPO],
        ["e", "d".repeat(64), "", "root"],
      ],
      "I can take this one.",
      FX_AUTHOR,
    ),
    hero: "git-reply-hero",
    grid: "embedded-note",
    // A reply is a comment: its words, its kind named.
    shape: "note",
    cardText: /Git reply.*I can take this one\./,
    rowText: /Git reply in ngit/,
    label: "Git reply",
  },
  {
    name: "release 30063 (NIP-82)",
    event: event(
      30063,
      [
        ["i", "com.example.app"],
        ["version", "1.2.3"],
        ["d", "com.example.app@1.2.3"],
        ["c", "main"],
        ["f", "android-arm64-v8a"],
        ["e", "e".repeat(64)],
      ],
      "Faster sync.",
    ),
    hero: "release-hero",
    grid: "release-card-",
    shape: "release",
    cardText: /com\.example\.app 1\.2\.3.*1 file/,
    rowText: /com\.example\.app 1\.2\.3/,
    label: "Release",
  },
  {
    name: "release 30063 (NIP-51)",
    event: event(30063, [
      ["d", "org.other@0.0.1"],
      ["e", "f".repeat(64)],
      ["a", `32267:${FX_OWNER}:org.other`],
    ]),
    hero: "release-hero",
    grid: "release-card-",
    shape: "release",
    cardText: /org\.other org\.other@0\.0\.1.*1 file/,
    rowText: /Release org\.other@0\.0\.1/,
    label: "Release",
  },
  {
    name: "trusted events 30393",
    event: event(
      30393,
      [
        ["d", "tl-pin-notes-x"],
        ["title", "stoicism Notes"],
        ["a", `39999:${FX_AUTHOR}:stoicism`],
        ["p", FX_AUTHOR],
        ["e", "1".repeat(64), "", "90"],
        ["e", "2".repeat(64), "", "40"],
      ],
      '{"members":[]}',
    ),
    hero: "trusted-list-hero",
    grid: "list-card-",
    shape: "item-list",
    cardText: /stoicism Notes.*2 notes/,
    rowText: /2 events/,
    label: "Trusted events",
  },
  {
    name: "trusted addressables 30394",
    event: event(
      30394,
      [
        ["d", "tl-books"],
        ["title", "espresso Books"],
        ["a", `30023:${FX_AUTHOR}:brewing`, "", "80"],
      ],
      '{"members":[]}',
    ),
    hero: "trusted-list-hero",
    grid: "list-card-",
    shape: "item-list",
    cardText: /espresso Books.*1 article/,
    rowText: /1 item/,
    label: "Trusted addressables",
  },
  {
    name: "trusted identifiers 30395",
    event: event(30395, [
      ["d", "tl-ids"],
      ["title", "Good books"],
      ["i", "isbn:9780141439518", "", "70"],
    ]),
    hero: "trusted-list-hero",
    grid: "list-card-",
    shape: "item-list",
    cardText: /Good books.*1 identifier/,
    rowText: /Book 9780141439518/,
    label: "Trusted identifiers",
  },
  {
    name: "calendar event 31923",
    event: event(31923, [
      ["d", "meetup"],
      ["title", "Cancelled: Python night"],
      ["start", String(FUTURE)],
      ["D", String(Math.floor(FUTURE / 86_400))],
      ["location", "Downtown library"],
      ["g", "9mudwj"],
    ]),
    hero: "event-hero",
    grid: "event-card-",
    shape: "calendar-event",
    cardText: /Cancelled.*Python night/,
    rowText: /Cancelled/,
    label: "Event",
  },
  {
    name: "calendar event 31922",
    event: event(31922, [
      ["d", "holiday"],
      ["title", "Bitcoin Pizza Day"],
      ["start", "2027-05-22"],
    ]),
    hero: "event-hero",
    grid: "event-card-",
    shape: "calendar-event",
    cardText: /Bitcoin Pizza Day/,
    rowText: /Bitcoin Pizza Day/,
    label: "Event",
  },
];
