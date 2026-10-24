/**
 * A Treasure Map — the reader's kind 10040 — read as duties: which Assistant
 * they entrust with which Scores, Lists and Concepts. Pure.
 *
 * Ported from Tapestry (ui/src/utils/treasureMap.js `classifyEntry`, and the
 * duties of pages/assistants/myAssistants.js; ADRs tl-treasure-map/0001 and
 * my-assistants/0003) so the two apps say the same thing about one Map.
 *
 * An entry is `["<kind>" | "<kind>:<name>", <assistant pubkey>, <relay>?]`:
 * - 30380–30389 is a Score (NIP-85 `kind:metric`; a bare kind, all of them);
 * - 30390–30399 a Trusted List (a bare kind, all of them; a name, one list);
 * - a named 39998/39999 one curated DList, except `39998:dlist-header`, every
 *   Concept header.
 * Anything else, and any entry without a valid pubkey, is not a duty.
 */

const HEX64 = /^[0-9a-f]{64}$/i;
const ENTRY = /^(\d{5})(?::(.+))?$/;

export type EntryClass = "ta" | "tl" | "dlist" | "designation" | "other";

export interface TreasureMapEntry {
  /** The entry's first element, as written: the duty's key. */
  raw: string;
  kind: number | null;
  name: string | null;
  cls: EntryClass;
  /** The delegate, lowercased; null when the second element isn't a key. */
  pubkey: string | null;
  relay: string | null;
}

/** One 10040 tag, classified. Never throws: anything unparseable is `other`. */
export function classifyEntry(tag: unknown): TreasureMapEntry {
  const t = Array.isArray(tag) ? tag : [];
  const raw = typeof t[0] === "string" ? t[0] : "";
  const m = raw.match(ENTRY);
  const kind = m ? Number(m[1]) : null;
  const name = m?.[2] ?? null;
  const pubkey = typeof t[1] === "string" && HEX64.test(t[1]) ? t[1].toLowerCase() : null;
  const cls: EntryClass =
    pubkey === null || kind === null
      ? "other"
      : (kind === 39998 || kind === 39999) && name
        ? kind === 39998 && name === "dlist-header"
          ? "designation"
          : "dlist"
        : kind >= 30380 && kind <= 30389
          ? "ta"
          : kind >= 30390 && kind <= 30399
            ? "tl"
            : "other";
  const relay = typeof t[2] === "string" && t[2] !== "" ? t[2] : null;
  return { raw, kind, name, cls, pubkey, relay };
}

export type DutyGroup = "scores" | "lists" | "concepts";
export type DutyLevel = "Scope" | "Exact";

export interface Duty {
  key: string;
  group: DutyGroup;
  /** Scope: a whole kind of Score or List, or every Concept. Exact: one. */
  level: DutyLevel;
  title: string;
  /** What the Assistant publishes and maintains, to finish "I entrust … to publish and maintain". */
  what: string;
  /** Its delegates in the Map's order, without repeats: the first is Preferred, the rest Alternates. */
  assistants: string[];
  /** Every tag on the Map with this key, as written. */
  entries: string[][];
  /** Where on the Map the duty first appears, and each Assistant first appears under it. */
  at: number;
  seenAt: number[];
}

const GROUP_OF: Partial<Record<EntryClass, DutyGroup>> = {
  ta: "scores",
  tl: "lists",
  dlist: "concepts",
  designation: "concepts",
};
const GROUP_RANK: Record<DutyGroup, number> = { scores: 0, lists: 1, concepts: 2 };
const LEVEL_RANK: Record<DutyLevel, number> = { Scope: 0, Exact: 1 };

/** A Score or List kind's subject, plural and singular, from its last digit. */
function subjectOf(kind: number): [string, string] {
  switch (kind % 10) {
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

function describeEntry(entry: TreasureMapEntry): Pick<Duty, "level" | "title" | "what"> {
  const [things, thing] = subjectOf(entry.kind ?? 0);
  if (entry.cls === "designation") {
    return {
      level: "Scope",
      title: "All Concept headers",
      what: "my Concept Graph — my DList headers and the items filed under them, except where this Map says otherwise.",
    };
  }
  if (entry.cls === "dlist") {
    // The list's d tag stands for its name: its header's would need a read per list.
    return {
      level: "Exact",
      title: `Curated DList: ${entry.name}`,
      what: `my curated copy of ${entry.name}: its header, and a copy of each item.`,
    };
  }
  if (entry.cls === "ta") {
    if (!entry.name) {
      return {
        level: "Scope",
        title: `All Scores about ${things}`,
        what: `every Score about ${things}, except where this Map says otherwise.`,
      };
    }
    return {
      level: "Exact",
      title: entry.name,
      what:
        entry.name === "rank"
          ? `a rank for every ${thing}, as seen from my trusted community.`
          : `a “${entry.name}” score for every ${thing}.`,
    };
  }
  if (!entry.name) {
    return {
      level: "Scope",
      title: `All Lists of ${things}`,
      what: `every Trusted List of ${things}, except where this Map says otherwise.`,
    };
  }
  return { level: "Exact", title: entry.name, what: `the Trusted List “${entry.name}” of ${things}.` };
}

/**
 * Every duty on a Treasure Map: one per distinct entry key the app can place,
 * most generic first — Scope before Exact, then Scores, Lists, Concepts, then
 * the Map's order. Never throws: no event, no tags, or garbage give [].
 */
export function treasureMapDuties(event: { tags?: unknown } | null | undefined): Duty[] {
  const tags = Array.isArray(event?.tags) ? (event.tags as unknown[]) : [];
  const byKey = new Map<string, Duty>();
  tags.forEach((tag, at) => {
    const entry = classifyEntry(tag);
    const group = GROUP_OF[entry.cls];
    if (!group || !entry.pubkey) return;
    let duty = byKey.get(entry.raw);
    if (!duty) {
      duty = { key: entry.raw, group, ...describeEntry(entry), assistants: [], entries: [], at, seenAt: [] };
      byKey.set(entry.raw, duty);
    }
    if (!duty.assistants.includes(entry.pubkey)) {
      duty.assistants.push(entry.pubkey);
      duty.seenAt.push(at);
    }
    duty.entries.push(tag as string[]);
  });
  return [...byKey.values()].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.at - b.at,
  );
}

export type AssistantDuties = Record<DutyGroup, Duty[]> & { count: number };

/** One Assistant's duties — as Preferred or as an Alternate — grouped, in duty order. */
export function dutiesOf(pubkey: string, duties: readonly Duty[]): AssistantDuties {
  const out: AssistantDuties = { scores: [], lists: [], concepts: [], count: 0 };
  for (const duty of duties) {
    if (!duty.assistants.includes(pubkey)) continue;
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

/** The duty as a sentence: "I entrust {Preferred} to publish and maintain {what}", then " If it can’t, ask {Alternates}." */
export function dutySentence(duty: Pick<Duty, "assistants" | "what">, nameOf: (pubkey: string) => string): string {
  const [preferred, ...alternates] = duty.assistants;
  const sentence = `I entrust ${nameOf(preferred)} to publish and maintain ${duty.what}`;
  if (!alternates.length) return sentence;
  return `${sentence} If it can’t, ask ${alternates.map(nameOf).join(", then ")}.`;
}
