/**
 * The kinds whose meaning is not in a title or words — a reaction, a zap, a
 * follow list, a report, a trust score — read into the All tab's row: what it
 * did, to whom, and the event it is about. Surveyed against the production
 * relay (2026-10-07): a sample of every kind the relay's own UI names, run
 * through the generic reading, left these with nothing but a byline and a pill.
 *
 * A reader fills the row's own fields; it never draws. People are written as
 * `nostr:npub…` tokens, which the row renders as names; the event a row is
 * about is a `ref` the list resolves in one batch (components/search/AllResults).
 */
import { nip19 } from "nostr-tools";
import { kindTypeLabel } from "@/lib/kindLabel";
import { parseZapReceipt } from "@/services/search";
import { contentShape } from "@/lib/contentShape";

export type ReaderEvent = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

/** The event a row is about: by id, by address, or carried inside it (a repost's). */
export interface ResultRef {
  id?: string;
  addr?: string;
  relay?: string;
}

export interface ReaderResult {
  title?: string | null;
  body?: string | null;
  facts?: string[];
  ref?: ResultRef | null;
  /** Who the row is from when the event's signer is a service: a zap receipt's payer, not the wallet's key. */
  by?: string | null;
  /** The content is code: shown as it is, not read as prose. */
  code?: boolean;
  /** The content is private on purpose — said, not read. */
  encrypted?: boolean;
}

// ---- shared by the All tab's reading (lib/resultSummary, components/search/AllResults) ----

export const HEX64 = /^[0-9a-f]{64}$/i;
/** A `d` that is a UUID, a hex blob or a bare timestamp is never a name. */
export const OPAQUE_D = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{10,})$/i;

/** The first non-empty value of the first of `names` the event carries. */
export const tagValue = (ev: { tags: string[][] }, ...names: string[]): string | null => {
  for (const name of names) {
    const v = ev.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1].trim())?.[1];
    if (v) return v.trim();
  }
  return null;
};

/** A url or relay as its host: "wss://nos.lol/" → "nos.lol". */
export const hostOf = (url: string) =>
  url
    .replace(/^(?:wss?|https?):\/\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/\/+$/, "");

/**
 * Text cut to `n` characters says it was cut — and is cut between words, so a
 * `nostr:npub…` token is never left half there (a half token shows as a key).
 */
export const clip = (text: string, n: number) => {
  if (text.length <= n) return text;
  const cut = text.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** The first `max` of a list, and how many more there are. */
export const firstOf = (items: string[], max: number, sep = ", ") =>
  items.length > max ? `${items.slice(0, max).join(sep)} and ${items.length - max} more` : items.join(sep);

/** Facts, at most `max`, the rest counted in one more. */
const someFacts = (facts: string[], max: number) =>
  facts.length > max ? [...facts.slice(0, max), `+${facts.length - max} more`] : facts;

/** The first lines of a block of code or text, and "…" when there are more. */
const firstLines = (text: string, n: number) => {
  const lines = text.split("\n");
  return lines.length > n ? `${lines.slice(0, n).join("\n")}\n…` : text;
};

const tagsOf = (ev: ReaderEvent, name: string) => ev.tags.filter((t) => t[0] === name && typeof t[1] === "string");
const tagOf = (ev: ReaderEvent, name: string): string | null => tagValue(ev, name);
const lastTag = (ev: ReaderEvent, name: string): string[] | null => tagsOf(ev, name).at(-1) ?? null;

/** A person as the row writes them: a token it renders as their name. */
export function who(pubkey: string | null | undefined): string {
  if (!pubkey || !HEX64.test(pubkey)) return "someone";
  try {
    return `nostr:${nip19.npubEncode(pubkey.toLowerCase())}`;
  } catch {
    return "someone";
  }
}

const unique = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v)));

/** "@a, @b and 12 others". */
export function people(pubkeys: string[], max = 3): string {
  const keys = unique(pubkeys.filter((p) => HEX64.test(p)));
  const named = keys.slice(0, max).map(who);
  const rest = keys.length - named.length;
  if (!named.length) return "";
  if (!rest) return named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0];
  return `${named.join(", ")} and ${rest.toLocaleString()} ${rest === 1 ? "other" : "others"}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The `e` or `a` an event points at — NIP-25 and NIP-57 name the target last. */
function refOf(ev: ReaderEvent, prefer: "first" | "last" = "last"): ResultRef | null {
  const pick = (name: string) => (prefer === "last" ? lastTag(ev, name) : (tagsOf(ev, name)[0] ?? null));
  const a = pick("a");
  const e = pick("e");
  if (e && HEX64.test(e[1])) return { id: e[1].toLowerCase(), relay: e[2] || undefined };
  if (a && /^\d+:[0-9a-f]{64}:/i.test(a[1])) return { addr: a[1], relay: a[2] || undefined };
  return null;
}

const sats = (n: number) => `${Math.round(n).toLocaleString()} sats`;

/** A reaction's content, as the mark it is. */
function reactionMark(content: string): string {
  const c = content.trim();
  if (!c || c === "+") return "❤";
  if (c === "-") return "👎";
  return c.length > 12 ? `${c.slice(0, 12)}…` : c;
}

/** The numbers a score carries, said in words: "Rank 87 · 3,057 followers". */
function scoreFacts(ev: ReaderEvent): string[] {
  const out: string[] = [];
  for (const t of ev.tags) {
    if (out.length >= 4 || t[0] === "d" || t[0] === "p" || t[0] === "e" || t[0] === "a" || t[0] === "client") continue;
    const n = Number(t[1]);
    if (!Number.isFinite(n) || t[1] === "") continue;
    const noun = t[0].replace(/_cnt$/, "").replace(/_/g, " ");
    out.push(t[0] === "rank" ? `Rank ${n}` : t[0].endsWith("_cnt") ? plural(n, noun) : `${n.toLocaleString()} ${noun}`);
  }
  return out;
}

/** What a list holds, counted by what each tag is. */
const LIST_NOUNS: [tag: string, one: string, many?: string][] = [
  ["p", "person", "people"],
  ["e", "note"],
  ["a", "item"],
  ["t", "hashtag"],
  ["r", "relay"],
  ["relay", "relay"],
  ["server", "server"],
  ["emoji", "emoji", "emoji"],
  ["word", "muted word"],
  ["group", "group"],
];

/** The kinds that are lists of things — counted and previewed rather than read. */
export function isListKind(kind: number): boolean {
  if (kind >= 10000 && kind < 10200) return ![10040, 10100, 10154, 10166].includes(kind);
  return [
    30000, 30001, 30002, 30003, 30004, 30005, 30006, 30007, 30008, 30015, 30030, 30267, 30392, 30393, 30394, 30395,
    39001, 39002, 39089, 39092,
  ].includes(kind);
}

function readList(ev: ReaderEvent): ReaderResult {
  // An `a` is counted as what it points at: three badges, two emoji packs.
  const byKind = new Map<number, number>();
  for (const t of tagsOf(ev, "a")) {
    const k = Number(t[1].split(":")[0]);
    if (Number.isFinite(k)) byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const counts = [
    ...LIST_NOUNS.filter(([tag]) => tag !== "a").map(([tag, one, many]) => ({ n: tagsOf(ev, tag).length, one, many })),
    ...[...byKind].map(([k, n]) => {
      const one = kindTypeLabel(k).toLowerCase();
      return { n, one, many: one.endsWith("y") ? `${one.slice(0, -1)}ies` : `${one}s` };
    }),
  ]
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const total = counts.reduce((sum, c) => sum + c.n, 0);
  const facts = someFacts(
    counts.map((c) => plural(c.n, c.one, c.many)),
    3,
  );
  const encrypted = contentShape(ev.content).kind === "encrypted";
  if (encrypted) facts.push("and private items");
  // A preview of what is in it, in the list's own terms.
  const peopleIn = tagsOf(ev, "p").map((t) => t[1]);
  const hashtags = tagsOf(ev, "t").map((t) => `#${t[1]}`);
  const hosts = [...tagsOf(ev, "r"), ...tagsOf(ev, "relay"), ...tagsOf(ev, "server")].map((t) => hostOf(t[1]));
  const emoji = tagsOf(ev, "emoji").map((t) => `:${t[1]}:`);
  const preview = peopleIn.length
    ? people(peopleIn)
    : hashtags.length
      ? firstOf(hashtags, 8, " ")
      : hosts.length
        ? firstOf(hosts, 4)
        : emoji.length
          ? firstOf(emoji, 8, " ")
          : "";
  return {
    // Nothing in the open and nothing sealed: say so. Sealed only: the row says it is private.
    // A named list keeps its name (the row's title), however empty.
    title: total || encrypted || tagOf(ev, "title") || tagOf(ev, "name") || tagOf(ev, "d") ? null : "An empty list",
    body: preview || null,
    facts: total ? facts : [],
    encrypted,
  };
}

type Reader = (ev: ReaderEvent) => ReaderResult | null;

const READERS = new Map<number, Reader>();
const read = (kinds: number[], fn: Reader) => kinds.forEach((k) => READERS.set(k, fn));

read([3], (ev) => {
  const n = unique(tagsOf(ev, "p").map((t) => t[1])).length;
  return { title: `Follows ${plural(n, "person", "people")}`, body: people(tagsOf(ev, "p").map((t) => t[1])) || null };
});

read([5], (ev) => {
  const n = tagsOf(ev, "e").length + tagsOf(ev, "a").length;
  const kinds = unique(tagsOf(ev, "k").map((t) => (/^\d+$/.test(t[1]) ? kindTypeLabel(Number(t[1])) : null)));
  return {
    title: `Deleted ${plural(n, "event")}`,
    body: ev.content.trim() || null,
    facts: someFacts(kinds, 3),
    ref: refOf(ev, "first"),
  };
});

read([7, 17], (ev) => {
  const to = lastTag(ev, "p")?.[1];
  return {
    title: `Reacted ${reactionMark(ev.content)}`,
    body: null,
    facts: to ? [`to ${who(to)}`] : [],
    ref: refOf(ev),
  };
});

read([8], (ev) => {
  const badge = tagOf(ev, "a");
  const d = badge?.split(":").slice(2).join(":") || null;
  // A badge's `d` is often a UUID: then the badge itself, quoted below, says its name.
  const name = d && !OPAQUE_D.test(d) ? d : null;
  const to = tagsOf(ev, "p").map((t) => t[1]);
  return {
    title: name ? `Awarded the “${name}” badge` : "Awarded a badge",
    body: to.length ? `to ${people(to)}` : null,
    ref: badge ? { addr: badge } : null,
  };
});

read([14], (ev) => ({ title: null, body: null, facts: [`to ${who(tagOf(ev, "p"))}`], encrypted: true }));

read([15], (ev) => ({
  title: "Encrypted file",
  body: null,
  facts: unique([tagOf(ev, "file-type"), tagOf(ev, "p") ? `to ${who(tagOf(ev, "p"))}` : null]),
}));

/** A NIP-28 moderation's public reason: `{"reason": "Spam"}`. */
function reasonOf(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { reason?: unknown };
    return typeof parsed?.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null;
  } catch {
    return content.trim() || null;
  }
}

read([43], (ev) => {
  const reason = reasonOf(ev.content);
  return { title: "Hid a message", body: null, facts: reason ? [reason] : [], ref: refOf(ev) };
});

// Public, unlike a mute list: the reason is JSON anyone can read.
read([44], (ev) => {
  const reason = reasonOf(ev.content);
  return { title: `Muted ${who(tagOf(ev, "p"))}`, body: null, facts: reason ? [reason] : [] };
});

read([62], (ev) => {
  const relays = tagsOf(ev, "relay").map((t) => t[1]);
  return {
    title: "Asked relays to erase everything they posted",
    body: ev.content.trim() || null,
    facts: relays.includes("ALL_RELAYS") ? ["All relays"] : someFacts(relays.map(hostOf), 3),
  };
});

read([1018], (ev) => {
  const n = tagsOf(ev, "response").length;
  return { title: "Voted in a poll", body: null, facts: n > 1 ? [plural(n, "choice")] : [], ref: refOf(ev, "first") };
});

read([1312], (ev) => {
  const target = tagsOf(ev, "a").find((t) => t[3] === "mention") ?? tagsOf(ev, "a").at(-1);
  return {
    title: "Raided another stream",
    body: ev.content.trim() || null,
    ref: target ? { addr: target[1], relay: target[2] || undefined } : null,
  };
});

read([1337], (ev) => ({
  title: tagOf(ev, "name") ?? tagOf(ev, "title"),
  body: firstLines(ev.content.trim(), 6) || null,
  facts: unique([tagOf(ev, "l"), tagOf(ev, "extension") ? `.${tagOf(ev, "extension")}` : null]),
  code: true,
}));

read([1984], (ev) => {
  const p = tagsOf(ev, "p")[0];
  const e = tagsOf(ev, "e")[0];
  const reason = e?.[2] || p?.[2] || null;
  return {
    title: p && !e ? `Reported ${who(p[1])}` : "Reported an event",
    body: ev.content.trim() || null,
    facts: unique([reason ? cap(reason) : null, p && e ? `by ${who(p[1])}` : null]),
    ref: e ? { id: e[1] } : null,
  };
});

read([1985], (ev) => {
  const labels = unique(tagsOf(ev, "l").map((t) => t[1]));
  const ns = tagOf(ev, "L");
  const targets = tagsOf(ev, "e").length + tagsOf(ev, "a").length;
  const persons = tagsOf(ev, "p").map((t) => t[1]);
  return {
    title: labels.length
      ? `Labelled ${firstOf(
          labels.map((l) => `“${l}”`),
          3,
        )}`
      : "Labelled",
    body: persons.length ? people(persons) : ev.content.trim() || null,
    facts: unique([ns, targets ? plural(targets, "event") : null]),
    ref: persons.length ? null : refOf(ev, "first"),
  };
});

read([4550], (ev) => {
  const community = tagOf(ev, "a")?.split(":").slice(2).join(":") || null;
  return { title: "Approved a post", body: null, facts: community ? [community] : [], ref: refOf(ev, "first") };
});

read([9021, 9022], (ev) => ({
  title: ev.kind === 9021 ? "Asked to join a group" : "Asked to leave a group",
  body: ev.content.trim() || null,
  facts: tagOf(ev, "h") ? [clip(tagOf(ev, "h")!, 17)] : [],
}));

read([9321], (ev) => {
  let total = 0;
  for (const t of tagsOf(ev, "proof")) {
    try {
      const amount = Number((JSON.parse(t[1]) as { amount?: unknown }).amount);
      if (Number.isFinite(amount)) total += amount;
    } catch {
      /* a proof we cannot read counts nothing */
    }
  }
  const unit = tagOf(ev, "unit") ?? "sat";
  const mint = tagOf(ev, "u");
  return {
    title: `⚡ ${total ? `${total.toLocaleString()} ${unit === "sat" ? "sats" : unit}` : "Nutzap"} to ${who(tagOf(ev, "p"))}`,
    body: ev.content.trim() || null,
    facts: mint ? [hostOf(mint)] : [],
    ref: refOf(ev),
  };
});

read([9734], (ev) => {
  const msats = Number(tagOf(ev, "amount"));
  return {
    title: `⚡ ${msats > 0 ? sats(msats / 1000) : "Zap"} to ${who(tagOf(ev, "p"))}`,
    body: ev.content.trim() || null,
    facts: ["Requested"],
    ref: refOf(ev),
  };
});

read([9735], (ev) => {
  const receipt = parseZapReceipt(ev as Parameters<typeof parseZapReceipt>[0]);
  return {
    title: `⚡ ${receipt.msats ? sats(receipt.msats / 1000) : "Zap"} to ${who(tagOf(ev, "p"))}`,
    body: receipt.memo || null,
    // A receipt is signed by the recipient's wallet service; the row is the payer's.
    by: receipt.pubkey,
    ref: refOf(ev),
  };
});

read([9737], (ev) => {
  const amount = Number(tagOf(ev, "amount"));
  return {
    title: `⚡ ${amount > 0 ? sats(amount) : "Zap"} to ${who(tagOf(ev, "p"))}`,
    body: ev.content.trim() || null,
    facts: unique([tagOf(ev, "network"), tagOf(ev, "P") ? `from ${who(tagOf(ev, "P"))}` : null]),
    ref: refOf(ev),
  };
});

read([11871], (ev) => {
  const kinds = unique(tagsOf(ev, "k").map((t) => (/^\d+$/.test(t[1]) ? kindTypeLabel(Number(t[1])) : null)));
  return { title: "Attests to what others publish", body: ev.content.trim() || null, facts: someFacts(kinds, 4) };
});

read([30382, 30383, 30384, 30385], (ev) => {
  const d = tagOf(ev, "d") ?? "";
  if (ev.kind === 30382)
    return { title: `Trust score for ${who(HEX64.test(d) ? d : null)}`, body: null, facts: scoreFacts(ev) };
  const ref: ResultRef | null =
    ev.kind === 30383 && HEX64.test(d)
      ? { id: d }
      : ev.kind === 30384 && /^\d+:[0-9a-f]{64}:/i.test(d)
        ? { addr: d }
        : null;
  return {
    title: ev.kind === 30385 ? `Score for ${clip(d, 60) || "an identifier"}` : "Score for an event",
    body: null,
    facts: scoreFacts(ev),
    ref,
  };
});

read([31925], (ev) => {
  const status = (tagOf(ev, "status") ?? "").toLowerCase();
  const word =
    status === "accepted"
      ? "Going"
      : status === "declined"
        ? "Not going"
        : status === "tentative"
          ? "Maybe going"
          : "Replied";
  const fb = tagOf(ev, "fb");
  return {
    title: word,
    body: ev.content.trim() || null,
    facts: fb ? [cap(fb)] : [],
    ref: tagOf(ev, "a") ? { addr: tagOf(ev, "a")! } : refOf(ev, "first"),
  };
});

read([38383], (ev) => {
  const side = tagOf(ev, "k");
  const fiat = tagOf(ev, "fa");
  const currency = tagOf(ev, "f");
  const amt = Number(tagOf(ev, "amt"));
  const premium = Number(tagOf(ev, "premium"));
  const status = tagOf(ev, "s");
  return {
    title: `${side ? cap(side) : "P2P"} order${fiat ? ` · ${Number(fiat) ? Number(fiat).toLocaleString() : fiat} ${currency ?? ""}`.trimEnd() : ""}`,
    body: tagOf(ev, "pm"),
    facts: unique([
      status ? cap(status) : null,
      amt > 0 ? sats(amt) : "Market price",
      premium ? `${premium > 0 ? "+" : ""}${premium}%` : null,
      tagOf(ev, "layer"),
    ]),
  };
});

read([39003], (ev) => ({
  title: "Group roles",
  body: unique(tagsOf(ev, "role").map((t) => t[1])).join(", ") || null,
}));

read([30054, 30055], (ev) => {
  // Not a playable episode (parseTrack had none): a listening or reading position.
  const pos = Number(tagOf(ev, "position"));
  const dur = Number(tagOf(ev, "duration"));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return {
    title: pos > 0 ? "Progress" : null,
    body: ev.content.trim() || null,
    facts: pos > 0 ? [dur > 0 ? `${mmss(pos)} of ${mmss(dur)}` : mmss(pos)] : [],
    ref: refOf(ev, "first"),
  };
});

read([30312], (ev) => ({ ref: refOf(ev, "first") }));

read([1163], (ev) => ({ facts: unique([tagOf(ev, "dim")]), ref: refOf(ev, "first") }));

/** DVM job requests (5000–5999), results (6000–6999) and feedback (7000). */
function readJob(ev: ReaderEvent): ReaderResult | null {
  if (ev.kind >= 5000 && ev.kind < 6000) {
    if (ev.tags.some((t) => t[0] === "encrypted") || contentShape(ev.content).kind === "encrypted")
      return { title: null, body: null, encrypted: true };
    const text = tagsOf(ev, "i")
      .filter((t) => t[2] === "text" || !t[2])
      .map((t) => t[1])
      .join(" ");
    const params = tagsOf(ev, "param").map((t) => `${t[1]}: ${t[2] ?? ""}`.trim());
    const input = tagsOf(ev, "i").find((t) => t[2] === "event");
    return {
      title: null,
      body: text || firstLines(ev.content.trim(), 4) || null,
      facts: someFacts(params, 3),
      ref: input && HEX64.test(input[1]) ? { id: input[1] } : null,
      code: !text && !!ev.content.trim(),
    };
  }
  // A job result (6969 is a zap poll, not one): ciphertext said as private; JSON and
  // words left to the generic reading, which knows a payload from prose.
  if (ev.kind >= 6000 && ev.kind < 7000 && ev.kind !== 6969) {
    const sealed = ev.tags.some((t) => t[0] === "encrypted") || contentShape(ev.content).kind === "encrypted";
    return sealed ? { body: null, encrypted: true, ref: refOf(ev, "first") } : { ref: refOf(ev, "first") };
  }
  if (ev.kind === 7000) {
    const status = tagsOf(ev, "status")[0];
    return {
      title: status?.[1] ? cap(status[1]) : "Job feedback",
      body: status?.[2] || ev.content.trim() || null,
      ref: refOf(ev, "first"),
    };
  }
  return null;
}

/** What a reader knows of this kind, or null where the generic reading is the right one. */
export function readKind(ev: ReaderEvent): ReaderResult | null {
  const reader = READERS.get(ev.kind);
  if (reader) return reader(ev);
  const job = readJob(ev);
  if (job) return job;
  if (isListKind(ev.kind)) return readList(ev);
  return null;
}
