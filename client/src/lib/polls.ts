/**
 * Polls, read from their events: NIP-88 polls (kind 1068, answered by kind-1018
 * responses) and zap polls (kind 6969, NIP-69, answered by zapping an option).
 *
 * Pure: the tag layouts, who counts and how much. Fetching and drawing live in
 * `components/share/PollCard.tsx`; publishing a response in `services/polls.ts`.
 * The counting rules follow Amethyst's `PollTallyPolicy` (quartz/commons
 * nip88Polls) so the two clients give one answer for the same poll.
 */
import { parseZapReceipt } from "@/services/search";

export const POLL_KIND = 1068;
export const POLL_RESPONSE_KIND = 1018;
export const ZAP_POLL_KIND = 6969;
export const ZAP_RECEIPT_KIND = 9735;
/** Kinds drawn with a poll card under their question. */
export const POLL_KINDS = new Set([POLL_KIND, ZAP_POLL_KIND]);

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][] };

const RELAY_URL = /^wss?:\/\/\S+$/i;

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name && typeof t[1] === "string")?.[1];
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ——— NIP-88 ———

export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  pubkey: string;
  createdAt: number;
  question: string;
  options: PollOption[];
  /** `polltype` multiplechoice; singlechoice (the default) otherwise. */
  multiple: boolean;
  /** `endsAt`: responses stamped after it do not count. Null for a poll that never closes. */
  endsAt: number | null;
  /** `relay` tags: where the author expects responses. */
  relays: string[];
}

/** A kind-1068 poll's question and options; null for anything else, or a poll with no options. */
export function parsePoll(ev: EventLike): Poll | null {
  if (ev.kind !== POLL_KIND) return null;
  const options: PollOption[] = [];
  const seen = new Set<string>();
  for (const t of ev.tags) {
    if (t[0] !== "option" || typeof t[1] !== "string" || !t[1] || seen.has(t[1])) continue;
    seen.add(t[1]);
    options.push({ id: t[1], label: typeof t[2] === "string" ? t[2] : "" });
  }
  if (!options.length) return null;
  const relays = Array.from(
    new Set(ev.tags.filter((t) => t[0] === "relay" && RELAY_URL.test(t[1] ?? "")).map((t) => t[1])),
  );
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    createdAt: ev.created_at,
    question: ev.content,
    options,
    multiple: (tagValue(ev.tags, "polltype") ?? "").trim().toLowerCase() === "multiplechoice",
    endsAt: positiveInt(tagValue(ev.tags, "endsAt")),
    relays,
  };
}

/** Whether a NIP-88 poll has closed at `now` (unix seconds). */
export function pollClosed(poll: Pick<Poll, "endsAt">, now: number): boolean {
  return poll.endsAt !== null && poll.endsAt < now;
}

/** The option ids a response's `response` tags name, in order. */
export function responseCodes(vote: { tags: string[][] }): string[] {
  return vote.tags.filter((t) => t[0] === "response" && typeof t[1] === "string").map((t) => t[1]);
}

/**
 * What a response actually casts. NIP-88: on a single-choice poll the first
 * `response` tag is the answer — a response naming every option casts nothing
 * valid rather than one vote each; on a multiple-choice poll each id counts
 * once, order aside. Ids the poll never declared are dropped.
 */
export function acceptedChoices(poll: Pick<Poll, "options" | "multiple">, codes: string[]): string[] {
  const valid = new Set(poll.options.map((o) => o.id));
  if (!poll.multiple) return codes[0] !== undefined && valid.has(codes[0]) ? [codes[0]] : [];
  return Array.from(new Set(codes.filter((c) => valid.has(c))));
}

/** Whether a response falls inside the poll's window: not before the question, not after `endsAt`. */
export function inPollWindow(poll: Pick<Poll, "createdAt" | "endsAt">, at: number): boolean {
  return at >= poll.createdAt && (poll.endsAt === null || at <= poll.endsAt);
}

export interface PollTally {
  /** Option id → voters who picked it, newest vote first. */
  votersByOption: Map<string, string[]>;
  /** Everyone whose counted response casts at least one valid option, newest first. */
  voters: string[];
  /** Each voter's counted response (the latest inside the window). */
  latest: Map<string, EventLike>;
}

/**
 * Count a poll's responses: one per person, their latest inside the poll's
 * window (NIP-88). A response after `endsAt` is not a late vote that wins — it
 * is not a vote. Ties on `created_at` keep the lower id, so every reader agrees.
 */
export function tallyPoll(poll: Poll, votes: EventLike[]): PollTally {
  const latest = new Map<string, EventLike>();
  for (const v of votes) {
    if (v.kind !== POLL_RESPONSE_KIND) continue;
    if (!v.tags.some((t) => t[0] === "e" && t[1] === poll.id)) continue;
    if (!inPollWindow(poll, v.created_at)) continue;
    const held = latest.get(v.pubkey);
    if (held && (held.created_at > v.created_at || (held.created_at === v.created_at && held.id <= v.id))) continue;
    latest.set(v.pubkey, v);
  }
  const votersByOption = new Map<string, string[]>(poll.options.map((o) => [o.id, []]));
  const voters: string[] = [];
  const newestFirst = [...latest.values()].sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
  for (const v of newestFirst) {
    const picked = acceptedChoices(poll, responseCodes(v));
    if (!picked.length) continue;
    voters.push(v.pubkey);
    for (const id of picked) votersByOption.get(id)?.push(v.pubkey);
  }
  return { votersByOption, voters, latest };
}

/** The choices `pubkey`'s counted response casts; [] when they have not voted. */
export function choicesOf(poll: Poll, tally: PollTally, pubkey: string | null | undefined): string[] {
  const vote = pubkey ? tally.latest.get(pubkey) : undefined;
  return vote ? acceptedChoices(poll, responseCodes(vote)) : [];
}

/** A share of voters as a whole percent; 0 when nobody has voted. On a multiple-choice poll the shares may sum past 100. */
export function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

// ——— Zap polls (kind 6969) ———

export interface ZapPollOption {
  index: number;
  label: string;
}

export interface ZapPoll {
  id: string;
  pubkey: string;
  createdAt: number;
  question: string;
  options: ZapPollOption[];
  /** `value_minimum` / `value_maximum`, in sats: zaps outside the range do not count. */
  min: number | null;
  max: number | null;
  /** `closed_at`: zaps after it do not count. */
  closedAt: number | null;
  /** `consensus_threshold`, a percent (0–100) of the zapped total an option needs. */
  threshold: number | null;
}

/** A kind-6969 zap poll's options and rules; null for anything else, or a poll with no options. */
export function parseZapPoll(ev: EventLike): ZapPoll | null {
  if (ev.kind !== ZAP_POLL_KIND) return null;
  const options: ZapPollOption[] = [];
  const seen = new Set<number>();
  for (const t of ev.tags) {
    if (t[0] !== "poll_option" || !/^\d+$/.test(t[1] ?? "")) continue;
    const index = Number(t[1]);
    if (seen.has(index)) continue;
    seen.add(index);
    options.push({ index, label: typeof t[2] === "string" ? t[2] : "" });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.index - b.index);
  const closedRaw = positiveInt(tagValue(ev.tags, "closed_at"));
  // Early Amethyst builds wrote `closed_at` as a number of days after posting;
  // a value that would close the poll before it was posted can only mean that.
  const closedAt =
    closedRaw === null ? null : closedRaw < ev.created_at ? ev.created_at + closedRaw * 86_400 : closedRaw;
  const thresholdRaw = Number(tagValue(ev.tags, "consensus_threshold"));
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    createdAt: ev.created_at,
    question: ev.content,
    options,
    min: positiveInt(tagValue(ev.tags, "value_minimum")),
    max: positiveInt(tagValue(ev.tags, "value_maximum")),
    closedAt,
    threshold: Number.isFinite(thresholdRaw) && thresholdRaw > 0 && thresholdRaw <= 100 ? thresholdRaw : null,
  };
}

/** Whether a zap poll has closed at `now` (unix seconds). */
export function zapPollClosed(poll: Pick<ZapPoll, "closedAt">, now: number): boolean {
  return poll.closedAt !== null && poll.closedAt < now;
}

/** The option a zap receipt's embedded request (`description`) votes for, or null. */
export function zappedPollOption(receipt: { tags: string[][] }): number | null {
  try {
    const raw = receipt.tags.find((t) => t[0] === "description")?.[1];
    if (!raw) return null;
    const request = JSON.parse(raw) as { tags?: unknown };
    if (!Array.isArray(request?.tags)) return null;
    const tag = (request.tags as unknown[]).find(
      (t): t is string[] => Array.isArray(t) && t[0] === "poll_option" && typeof t[1] === "string",
    );
    return tag && /^\d+$/.test(tag[1]) ? Number(tag[1]) : null;
  } catch {
    return null;
  }
}

export interface ZapPollTally {
  /** Option index → sats zapped to it. */
  sats: Map<number, number>;
  /** Option index → who zapped it (distinct, newest first). */
  zappers: Map<number, string[]>;
  /** Sats across every counted zap. */
  total: number;
  /** Counted zaps. */
  zaps: number;
}

/**
 * Sum a zap poll's receipts per option: receipts naming the poll whose request
 * carries a `poll_option` it declares, with an amount inside the poll's range,
 * received by `closed_at`. A receipt whose invoice and request disagree on the
 * amount is not counted (see `parseZapReceipt`).
 */
export function tallyZapPoll(poll: ZapPoll, receipts: EventLike[]): ZapPollTally {
  const sats = new Map<number, number>(poll.options.map((o) => [o.index, 0]));
  const zappers = new Map<number, string[]>(poll.options.map((o) => [o.index, []]));
  let total = 0;
  let zaps = 0;
  const seen = new Set<string>();
  const newestFirst = [...receipts].sort((a, b) => b.created_at - a.created_at);
  for (const r of newestFirst) {
    if (r.kind !== ZAP_RECEIPT_KIND || seen.has(r.id)) continue;
    seen.add(r.id);
    if (!r.tags.some((t) => t[0] === "e" && t[1] === poll.id)) continue;
    if (poll.closedAt !== null && r.created_at > poll.closedAt) continue;
    const option = zappedPollOption(r);
    if (option === null || !sats.has(option)) continue;
    const receipt = parseZapReceipt(r as Parameters<typeof parseZapReceipt>[0]);
    if (!receipt.msats) continue;
    const amount = Math.floor(receipt.msats / 1000);
    if (amount <= 0 || (poll.min !== null && amount < poll.min) || (poll.max !== null && amount > poll.max)) continue;
    sats.set(option, (sats.get(option) ?? 0) + amount);
    total += amount;
    zaps += 1;
    const who = zappers.get(option)!;
    if (receipt.pubkey && !who.includes(receipt.pubkey)) who.push(receipt.pubkey);
  }
  return { sats, zappers, total, zaps };
}

/** "100–1,000 sats", "at least 100 sats", "up to 1,000 sats"; null when any amount counts. */
export function zapRangeWords(poll: Pick<ZapPoll, "min" | "max">): string | null {
  const n = (v: number) => new Intl.NumberFormat("en-US").format(v);
  if (poll.min !== null && poll.max !== null)
    return poll.min === poll.max ? `${n(poll.min)} sats a vote` : `${n(poll.min)}–${n(poll.max)} sats`;
  if (poll.min !== null) return `at least ${n(poll.min)} sats`;
  if (poll.max !== null) return `up to ${n(poll.max)} sats`;
  return null;
}

// ——— Shared ———

/**
 * When a poll closes, in words: "Ends in 3 days", "Ends in 5 hours", "Ends in
 * 12 minutes", or "Ended Oct 3, 2026". Null for a poll with no end.
 */
export function closingWords(closesAt: number | null, now: number): string | null {
  if (closesAt === null) return null;
  const left = closesAt - now;
  if (left < 0) {
    const date = new Date(closesAt * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `Ended ${date}`;
  }
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (left < 3600) return `Ends in ${plural(Math.max(1, Math.ceil(left / 60)), "minute")}`;
  if (left < 86_400) return `Ends in ${plural(Math.floor(left / 3600), "hour")}`;
  return `Ends in ${plural(Math.floor(left / 86_400), "day")}`;
}
