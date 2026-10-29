/**
 * A Treasure Map — the reader's kind 10040 — read as duties: which Assistant
 * they entrust with which Scores, Lists and Concepts, and the duties their
 * Brainstorm Assistant offers that the Map gives to no one. Pure.
 *
 * Keys are read by the Treasure Maps grammar through lib/treasureMapCards,
 * the reader Settings › Treasure Map uses, so the two views say the same
 * thing about one Map (nous-clawds4/tapestry protocols/drafts/treasure-maps.md):
 * - the kind slot is a kind (`30382`), a family (`3038x`, `3039x`) or `*`;
 *   segments after it narrow it (`30382:rank` is one Score);
 * - a bare `39998` is every Concept header — `39998:dlist-header` is the same
 *   key — a bare `39999` those declared as kind-39999 items, and
 *   `39998:<d>` one curated DList (§ 4.5);
 * - `39998:` and `39999:` name nothing, nor do the reserved
 *   `39999:dlist-header` and `39999:duty-menu` (§§ 4.5–4.6).
 * This view once read keys by Tapestry's older classifier (dlist-curation ADR
 * 0006), written before the grammar gave bare Concept kinds, families and `*`
 * a meaning, so it dropped them; the Treasure Map tab didn't.
 *
 * An offered duty the Map doesn't name by its own key is covered by the most
 * specific key that reaches it (§ 6), else it's unassigned.
 */
import { appliesTo, CATEGORIES, entryOf, SYSTEM_WORDS, type MapCategory, type MapEntry } from "@/lib/treasureMapCards";

const KIND = /^\d{5}$/;
const FAMILY = /^\d{4}x$/;
const HEX64 = /^[0-9a-f]{64}$/i;

/** `everything` is a bare `*`: every Score, List and Concept. */
export type DutyGroup = "everything" | MapCategory;
export type DutyLevel = "Scope" | "Exact";

export interface Duty {
  /** The key as the grammar reads it: `39998:dlist-header` is `39998`, `30396:tag::` is `30396:tag`. */
  key: string;
  group: DutyGroup;
  /** Scope: a whole kind, family or system, or every Concept. Exact: one. */
  level: DutyLevel;
  title: string;
  /** What the Assistant publishes and maintains, to finish "I entrust … to publish and maintain". */
  what: string;
  /** Its delegates in the Map's order, without repeats: the first is Preferred, the rest Alternates. Empty: unassigned. */
  assistants: string[];
  /** Every tag on the Map with this key, as written (for a covered duty, the covering key's). */
  entries: string[][];
  /** Where on the Map the duty first appears, and each Assistant first appears under it. */
  at: number;
  seenAt: number[];
  /** The Brainstorm Assistant that offers it by default (the server's `/setup`), when one does. */
  offeredBy: string | null;
  /** An offered duty the Map doesn't name by its own key: the broader key that covers it. Its Assistants are that key's. */
  through: string | null;
}

/** A duty the reader's Brainstorm Assistant offers: a Map key and the Assistant's pubkey. */
export interface OfferedDuty {
  key: string;
  pubkey: string;
}

/**
 * The Concept duties the local Brainstorm Assistant offers beside the
 * server's rows: it is to manage the reader's Dictionary by publishing
 * kind-39998 and kind-39999 events (planned, 2026-10-27), before `/setup`
 * says so itself.
 */
export const PLANNED_OFFERS = ["39998", "39999"] as const;

/** The server's `/setup` rows as offered duties, the planned Concept duties added for the same Assistant. */
export function offeredDuties(rows: unknown): OfferedDuty[] {
  const out: OfferedDuty[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "string" || !HEX64.test(row[1]))
      continue;
    const pubkey = row[1].toLowerCase();
    if (!out.some((o) => o.key === row[0])) out.push({ key: row[0], pubkey });
  }
  const assistant = out[0]?.pubkey;
  if (assistant)
    for (const key of PLANNED_OFFERS) if (!out.some((o) => o.key === key)) out.push({ key, pubkey: assistant });
  return out;
}

/** Keys the grammar reads as naming nothing: a Concept kind and a colon alone, and the reserved 39999 `d`s. */
function namesNothing(entry: MapEntry): boolean {
  if (!entry.concept) return false;
  if (entry.key === `${entry.slot}:`) return true;
  return entry.slot === "39999" && (entry.rest === "dlist-header" || entry.rest === "duty-menu");
}

/** The view's group: a bare `*` is everything; anything else, the one category it applies to. */
function groupOf(entry: MapEntry): DutyGroup | null {
  if (entry.slot === "*") return appliesTo("scores", entry) ? "everything" : null;
  return CATEGORIES.find((c) => appliesTo(c, entry)) ?? null;
}

/** A Score or List kind's subject, plural and singular, from its last digit; a family's is any subject. */
function subjectOf(slot: string): [string, string] {
  if (!KIND.test(slot)) return ["subjects", "subject"];
  switch (Number(slot) % 10) {
    case 2:
      return ["profiles", "profile"];
    case 3:
      return ["events", "event"];
    case 4:
      return ["addressable events", "addressable event"];
    case 6:
      return ["content categories", "content category"];
    default:
      return ["items", "item"];
  }
}

function describe(entry: MapEntry, group: DutyGroup): Pick<Duty, "level" | "title" | "what"> {
  if (group === "everything") {
    return {
      level: "Scope",
      title: "Everything",
      what: "every Score, List and Concept, except where this Map says otherwise.",
    };
  }
  if (entry.concept) {
    if (entry.norm === "39998") {
      return {
        level: "Scope",
        title: "All Concept headers",
        what: "my Concept Graph — my DList headers and the items filed under them, except where this Map says otherwise.",
      };
    }
    if (entry.norm === "39999") {
      return {
        level: "Scope",
        title: "Concept headers declared as items",
        what: "my Concept headers declared as kind-39999 items, and the items filed under them, except where this Map says otherwise.",
      };
    }
    // The list's d tag stands for its name: its header's would need a read per list.
    return {
      level: "Exact",
      title: `Curated DList: ${entry.rest}`,
      what: `my curated copy of ${entry.rest}: its header, and a copy of each item.`,
    };
  }
  const [things, thing] = subjectOf(entry.slot);
  const name = entry.segments.filter(Boolean).join(":");
  // A key that names no value — a kind, a family, a system — is a scope.
  if (entry.segments.every((s) => s === "" || SYSTEM_WORDS.has(s))) {
    const family = FAMILY.test(entry.slot);
    const [title, every] =
      group === "scores"
        ? family
          ? ["All Scores", "every Score"]
          : [`All Scores about ${things}`, `every Score about ${things}`]
        : family
          ? ["All Lists", "every Trusted List"]
          : [`All Lists of ${things}`, `every Trusted List of ${things}`];
    return {
      level: "Scope",
      title: name ? `${title} (${name})` : title,
      what: `${name ? `${every}, ${name}-based` : every}, except where this Map says otherwise.`,
    };
  }
  if (group === "scores") {
    return {
      level: "Exact",
      title: name,
      what:
        name === "rank"
          ? `a rank for every ${thing}, as seen from my trusted community.`
          : `a “${name}” score for every ${thing}.`,
    };
  }
  return { level: "Exact", title: name, what: `the Trusted List “${name}” of ${things}.` };
}

/**
 * How specifically Map key `m` reaches everything key `o` names, as a tuple
 * compared left to right (§ 6: the kind slot — exact, then family, then `*`;
 * then each segment, a value before empty); null when it reaches only part of
 * it, or none.
 */
function reach(m: MapEntry, o: MapEntry): number[] | null {
  if (m.slot === "*") return m.segments.length === 0 ? [0] : null;
  if (m.concept || o.concept) {
    if (!m.concept || !o.concept) return null;
    const mBare = m.norm === m.slot;
    if (!mBare && m.norm !== o.norm) return null; // one list reaches only itself
    if (m.slot === o.slot) return [2, mBare ? 0 : 1];
    // A bare 39998 reaches the headers declared as kind-39999 items, below every 39999 key.
    return mBare && m.slot === "39998" && o.slot === "39999" ? [1] : null;
  }
  let slot: number;
  if (m.slot === o.slot) slot = 2;
  else if (FAMILY.test(m.slot) && KIND.test(o.slot) && o.slot.startsWith(m.slot.slice(0, 4))) slot = 1;
  else return null;
  if (m.segments.length > o.segments.length) return null;
  const segments: number[] = [];
  for (let i = 0; i < o.segments.length; i++) {
    const v = m.segments[i] ?? "";
    if (v !== "" && v !== o.segments[i]) return null;
    segments.push(v === "" ? 0 : 1);
  }
  return [slot, ...segments];
}

const before = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) > (b[i] ?? -1);
  }
  return false;
};

const GROUP_RANK: Record<DutyGroup, number> = { everything: 0, scores: 1, lists: 2, concepts: 3 };
const LEVEL_RANK: Record<DutyLevel, number> = { Scope: 0, Exact: 1 };

/**
 * Every duty on a Treasure Map, one per key the grammar reads, then each
 * offered duty the Map doesn't name by its own key — covered by the most
 * specific key that reaches it, else unassigned. Most generic first: Scope
 * before Exact, then everything, Scores, Lists, Concepts, then the Map's order
 * (offered duties after the Map's). Never throws: no event, no tags, or
 * garbage give the offered duties alone, unassigned.
 */
export function treasureMapDuties(
  event: { tags?: unknown } | null | undefined,
  offered: readonly OfferedDuty[] = [],
): Duty[] {
  const tags = Array.isArray(event?.tags) ? (event.tags as unknown[]) : [];
  const byKey = new Map<string, { duty: Duty; entry: MapEntry }>();
  tags.forEach((tag, at) => {
    const entry = entryOf(tag);
    if (!entry || namesNothing(entry)) return;
    const group = groupOf(entry);
    if (!group) return;
    let held = byKey.get(entry.norm);
    if (!held) {
      const duty: Duty = {
        key: entry.norm,
        group,
        ...describe(entry, group),
        assistants: [],
        entries: [],
        at,
        seenAt: [],
        offeredBy: null,
        through: null,
      };
      held = { duty, entry };
      byKey.set(entry.norm, held);
    }
    if (!held.duty.assistants.includes(entry.pubkey)) {
      held.duty.assistants.push(entry.pubkey);
      held.duty.seenAt.push(at);
    }
    held.duty.entries.push(tag as string[]);
  });

  const onMap = [...byKey.values()];
  const extra: Duty[] = [];
  offered.forEach((offer, i) => {
    const entry = entryOf([offer.key, offer.pubkey]);
    if (!entry || namesNothing(entry)) return;
    const group = groupOf(entry);
    if (!group) return;
    const own = byKey.get(entry.norm);
    if (own) {
      own.duty.offeredBy ??= offer.pubkey;
      return;
    }
    if (extra.some((d) => d.key === entry.norm)) return;
    let cover: { duty: Duty; rank: number[] } | null = null;
    for (const held of onMap) {
      const rank = reach(held.entry, entry);
      if (rank && (!cover || before(rank, cover.rank))) cover = { duty: held.duty, rank };
    }
    extra.push({
      key: entry.norm,
      group,
      ...describe(entry, group),
      assistants: cover ? [...cover.duty.assistants] : [],
      entries: cover ? cover.duty.entries : [],
      at: tags.length + i,
      seenAt: [],
      offeredBy: offer.pubkey,
      through: cover?.duty.key ?? null,
    });
  });

  return [...onMap.map((h) => h.duty), ...extra].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.at - b.at,
  );
}

export type AssistantDuties = Record<DutyGroup, Duty[]> & { count: number };

/**
 * One Assistant's duties — as Preferred or as an Alternate — grouped, in duty
 * order. A covered duty is its covering key's, so it isn't counted again.
 */
export function dutiesOf(pubkey: string, duties: readonly Duty[]): AssistantDuties {
  const out: AssistantDuties = { everything: [], scores: [], lists: [], concepts: [], count: 0 };
  for (const duty of duties) {
    if (duty.through || !duty.assistants.includes(pubkey)) continue;
    out[duty.group].push(duty);
    out.count += 1;
  }
  return out;
}

/** The Assistants with duties who aren't `listed`, each with its duty count, in the order the Map first names them. */
export function mapOnlyAssistants(
  duties: readonly Duty[],
  listed: ReadonlySet<string>,
): { pubkey: string; count: number }[] {
  const found = new Map<string, { pubkey: string; count: number; first: number }>();
  for (const duty of duties) {
    if (duty.through) continue;
    duty.assistants.forEach((pubkey, i) => {
      if (listed.has(pubkey)) return;
      const seen = found.get(pubkey) ?? { pubkey, count: 0, first: Infinity };
      seen.count += 1;
      seen.first = Math.min(seen.first, duty.seenAt[i] ?? Infinity);
      found.set(pubkey, seen);
    });
  }
  return [...found.values()].sort((a, b) => a.first - b.first).map(({ pubkey, count }) => ({ pubkey, count }));
}

/** "Preferred" for the first, then "Alternate" — numbered when there's more than one. */
export function assistantRole(index: number, total: number): string {
  if (index === 0) return "Preferred";
  return total > 2 ? `Alternate ${index}` : "Alternate";
}

/**
 * The duty as a sentence: "I entrust {Preferred} to publish and maintain {what}", then " If it can’t, ask {Alternates}."
 * An unassigned duty: "No Assistant is entrusted to publish and maintain {what}"
 */
export function dutySentence(duty: Pick<Duty, "assistants" | "what">, nameOf: (pubkey: string) => string): string {
  const [preferred, ...alternates] = duty.assistants;
  if (!preferred) return `No Assistant is entrusted to publish and maintain ${duty.what}`;
  const sentence = `I entrust ${nameOf(preferred)} to publish and maintain ${duty.what}`;
  if (!alternates.length) return sentence;
  return `${sentence} If it can’t, ask ${alternates.map(nameOf).join(", then ")}.`;
}
