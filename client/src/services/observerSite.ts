/**
 * Publishing to, and reading from, the reader's Observer site (quartz
 * `plans/2026-11-11-observer-site.md`; the pure rules are `lib/frontPage/observerSite`).
 *
 * The site is public by design. Only a page the front page's validator passed is ever
 * handed here (`printFrontPage` returns no other page), and its pictures stay where
 * their authors published them: nothing is downloaded or re-uploaded but the site's
 * own files.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs } from "@/accounts/signing";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { outboxRelays } from "@/lib/relayRouting";
import { loadBlossomServers, normalizeServer } from "@/lib/blossomServers";
import { BLOSSOM_SERVER, nostrAuthHeader, serverScopeTags } from "@/services/blossom";
import { publishToRelays } from "@/services/nostr";
import {
  EDITIONS_PATH,
  OBSERVER_D,
  OBSERVER_SITE_KIND,
  aggregateHash,
  archiveHtml,
  eventBudget,
  editionPath,
  manifestTemplate,
  observerNaddr,
  observerUrl,
  parseEditions,
  rebuildFromPaths,
  rollOff,
  serializeEditions,
  sha256Text,
  siteDescription,
  siteTitle,
  upsertEdition,
  utcDay,
  type EditionEntry,
  type EditionsIndex,
} from "@/lib/frontPage/observerSite";

/** What `signAs` adds to a 35128 (`["client", "Brainstorm"]`) and the measure doesn't see. */
const SIGNER_TAG_SLACK = 64;

export interface ObserverSite {
  event: NostrEvent | null;
  index: EditionsIndex;
  /** Where its files are: the manifest's `server` hints, then the author's own list. */
  servers: string[];
  relays: string[];
}

function serverHints(event: NostrEvent | null | undefined): string[] {
  return (event?.tags ?? [])
    .filter((t) => t[0] === "server" && t[1])
    .map((t) => normalizeServer(t[1]))
    .filter((s): s is string => !!s);
}

const dedupe = (list: string[]) => [...new Set(list)];

/** One blob by its sha256 from the first server that serves bytes with that hash. */
export async function fetchBlob(
  sha256: string,
  servers: string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<string | null> {
  for (const server of servers) {
    try {
      const response = await fetch(`${server}/${sha256}`, { signal });
      if (!response.ok) continue;
      const text = await response.text();
      // Any server can answer; only the hash says it answered with the right file.
      if ((await sha256Text(text)) === sha256) return text;
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}

/**
 * The reader's site as it stands: the newest manifest from their write relays and its
 * `editions.json`, or — when that file can't be fetched — the entries its dated paths
 * still name. A reader with no site yet gets an empty index.
 */
export async function loadObserverSite(
  pubkey: string,
  { timeoutMs = 6_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ObserverSite> {
  const relays = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: 2_500 }).catch(() => PROFILE_RELAYS);
  const [event, own] = await Promise.all([
    loadReplaceable(OBSERVER_SITE_KIND, pubkey, { identifier: OBSERVER_D, relays, timeoutMs, fromRelays: true }),
    loadBlossomServers(pubkey, { timeoutMs }).catch(() => ({ servers: [] as string[], found: false })),
  ]);
  const site = event ?? (eventStore.getReplaceable(OBSERVER_SITE_KIND, pubkey, OBSERVER_D) as NostrEvent | undefined);
  const servers = dedupe([...serverHints(site), ...own.servers]);
  if (!site) return { event: null, index: { v: 1, title: "", editions: [] }, servers, relays };

  const editionsHash = site.tags.find((t) => t[0] === "path" && t[1] === EDITIONS_PATH)?.[2];
  const json = editionsHash ? await fetchBlob(editionsHash, servers, { signal }) : null;
  const parsed = json ? parseEditions(json) : null;
  const title = site.tags.find((t) => t[0] === "title")?.[1] ?? "";
  const index = parsed ?? { v: 1 as const, title, editions: rebuildFromPaths(site.tags) };
  // The index can name days the manifest no longer lists (a racing producer); the path
  // tags are what the site serves.
  const listed = new Set(site.tags.filter((t) => t[0] === "path").map((t) => t[1]));
  return {
    event: site,
    index: { ...index, editions: index.editions.filter((e) => listed.has(e.path)) },
    servers,
    relays,
  };
}

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

interface Upload {
  text: string;
  type: string;
  sha256: string;
}

/**
 * The site's new files, under ONE signature: a BUD-11 upload token naming every hash and
 * scoped to these servers, so publishing asks the signer once for the files (and once
 * more for the manifest). Each file goes to the first server that takes it; at least
 * one must, or nothing is published.
 */
async function uploadAll(uploads: Upload[], servers: string[]): Promise<string[]> {
  const auth = await nostrAuthHeader({
    kind: 24242,
    tags: [
      ["t", "upload"],
      ...uploads.map((u) => ["x", u.sha256]),
      ...serverScopeTags(servers),
      ["expiration", String(Math.floor(Date.now() / 1000) + 600)],
    ],
    content: "Publish my Observer",
  });
  const used = new Set<string>();
  for (const upload of uploads) {
    let stored = false;
    for (const server of servers) {
      try {
        const response = await fetch(`${server}/upload`, {
          method: "PUT",
          headers: { Authorization: auth, "Content-Type": upload.type },
          body: new Blob([upload.text], { type: upload.type }),
        });
        if (!response.ok) continue;
        const descriptor = (await response.json().catch(() => null)) as { sha256?: string } | null;
        if (descriptor?.sha256 && descriptor.sha256 !== upload.sha256) continue;
        used.add(server);
        stored = true;
        break;
      } catch {
        // Unreachable: the next server.
      }
    }
    if (!stored) throw new PublishError("None of your file servers took the page.");
  }
  return servers.filter((s) => used.has(s));
}

export interface PublishInput {
  pubkey: string;
  html: string;
  /** The reader's display name, for the site's title. */
  name: string;
  printedAt: number;
  headline?: string | null;
  code?: string;
  posts?: number;
  quotesVerified?: number;
  model?: string;
}

export interface Published {
  url: string;
  naddr: string;
  editions: EditionEntry[];
}

/**
 * Today's paper into the reader's Observer site: read, upload, upsert, roll off,
 * regenerate the archive and index, assemble, sign, publish (the spec's steps 1–7).
 * Throws `PublishError` (or a signer error) and publishes nothing when a step fails.
 */
export async function publishToObserver(input: PublishInput): Promise<Published> {
  const account = activeAccount();
  if (!account || account.pubkey !== input.pubkey) throw new PublishError("Sign in as yourself to publish.");

  const site = await loadObserverSite(input.pubkey);
  const own = (await loadBlossomServers(input.pubkey).catch(() => ({ servers: [] as string[] }))).servers;
  // Their own servers first; with none listed, the one Brainstorm uploads to by default.
  const servers = own.length ? own : [BLOSSOM_SERVER];

  const day = utcDay(input.printedAt);
  const sha256 = await sha256Text(input.html);
  const entry: EditionEntry = {
    day,
    path: editionPath(day),
    sha256,
    ...(input.headline ? { headline: input.headline } : {}),
    ...(input.code ? { code: input.code } : {}),
    printedAt: Math.floor(input.printedAt / 1000),
    ...(input.posts !== undefined ? { posts: input.posts } : {}),
    ...(input.quotesVerified !== undefined ? { quotesVerified: input.quotesVerified } : {}),
    ...(input.model ? { model: input.model } : {}),
  };

  const title = siteTitle(input.name);
  const description = siteDescription(input.name);
  const createdAt = Math.max(Math.floor(Date.now() / 1000), (site.event?.created_at ?? 0) + 1);
  const kept = rollOff(upsertEdition(site.index.editions, entry), {
    // Brainstorm reads no NIP-11 documents, so the spec's default budget applies.
    budget: eventBudget([]) - SIGNER_TAG_SLACK,
    servers,
    title,
    description,
    createdAt,
  });

  const index: EditionsIndex = { v: 1, title, editions: kept };
  const editionsJson = serializeEditions(index);
  const archive = archiveHtml(index);
  const files = { archive: await sha256Text(archive), editions: await sha256Text(editionsJson) };

  const stored = await uploadAll(
    [
      { text: input.html, type: "text/html", sha256 },
      { text: archive, type: "text/html", sha256: files.archive },
      { text: editionsJson, type: "application/json", sha256: files.editions },
    ],
    servers,
  );

  const draft = manifestTemplate({
    entries: kept,
    files,
    servers: dedupe([...stored, ...servers]),
    title,
    description,
    aggregate: "",
  });
  const aggregate = await aggregateHash(draft.tags);
  const template = manifestTemplate({
    entries: kept,
    files,
    servers: dedupe([...stored, ...servers]),
    title,
    description,
    aggregate,
  });

  const signed = await signAs(account, { ...template, created_at: createdAt });
  const outcome = await publishToRelays(signed, site.relays, { need: 1, timeoutMs: 8000 });
  if (!outcome.success) throw new PublishError("None of your relays took the site.");
  eventStore.add(signed);
  return { url: observerUrl(input.pubkey), naddr: observerNaddr(input.pubkey, site.relays), editions: kept };
}

/**
 * The lead headline, as the brief defines it: the first `h2.lead-head` / `h2.main-head`,
 * else the first h2 or h1 outside the masthead (whose h1 is the paper's name, not news).
 */
export function leadHeadline(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const outsideMasthead = (el: Element) => !el.closest(".masthead");
    const lead =
      doc.querySelector("h2.lead-head, h2.main-head") ??
      Array.from(doc.querySelectorAll("h2")).find(outsideMasthead) ??
      Array.from(doc.querySelectorAll("h1")).find(outsideMasthead);
    const text = (lead?.textContent ?? "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 200) : null;
  } catch {
    return null;
  }
}
