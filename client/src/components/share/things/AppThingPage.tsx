/**
 * An app's page — a NIP-89 app handler, a NIP-5A Nostr site, or a NIP-5D mini
 * app — in app-store anatomy: icon, name, what it does, the way in. A handler
 * lists every kind it opens (each a search for that kind) and who recommends
 * it; a site or mini app lists the files it is made of, the servers that hold
 * them, and where its source lives.
 */
import { AppWindow, FileCode, Globe, Package, Server } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { MediaImg } from "@/components/ui/media-img";
import { ReadingText } from "@/components/share/ReadingText";
import { fetchFromSearch } from "@/services/search";
import { kindTypeLabel } from "@/lib/kindLabel";
import type { Thing } from "@/lib/thing";
import type { Detail } from "./types";
import {
  ActionLink,
  Actions,
  FactRows,
  InfoBox,
  Kicker,
  PageTitle,
  PeopleRoster,
  Section,
  SectionNote,
  hostOf,
  npubOf,
  useFetched,
  type PageEvent,
  SafeImg,
} from "./shared";

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
function jsonOf(content: string): Json | null {
  try {
    const v: unknown = JSON.parse(content);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

const VARIANT = {
  handler: { word: "App", icon: Package },
  site: { word: "Nostr site", icon: Globe },
  napplet: { word: "Mini app", icon: AppWindow },
} as const;

/** Where a handler says it runs: its `web`/`ios`/`android` tags, as the platform's front door. */
function platformsOf(event: PageEvent): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  for (const [name, label] of [
    ["web", "Open on the web"],
    ["ios", "iOS"],
    ["android", "Android"],
  ] as const) {
    const raw = event.tags.find((t) => t[0] === name && /^https?:\/\//i.test(t[1] ?? ""))?.[1];
    if (!raw) continue;
    // A web handler's URL is a template ("…/e/<bech32>"): its origin is the app.
    try {
      out.push({ label, url: name === "web" ? new URL(raw.replace(/<bech32>/g, "")).origin : raw });
    } catch {
      /* not a URL after all */
    }
  }
  return out;
}

/** A handled kind in words with its number: NIP-90 job requests and results are named as such. */
function kindWords(k: number): string {
  if (k >= 5000 && k <= 5999) return `DVM job · ${k}`;
  if (k >= 6000 && k <= 6999) return `DVM result · ${k}`;
  const label = kindTypeLabel(k);
  return label.startsWith("Kind ") ? label : `${label} · ${k}`;
}

/** A root Nostr site is served at its author's npub on an nsite gateway (named sites' gateway names are not guessed). */
function siteUrl(event: PageEvent): string | null {
  const npub = npubOf(event.pubkey);
  return event.kind === 15128 && npub ? `https://${npub}.nsite.lol` : null;
}

export function AppThingHero({ event, thing, detail }: { event: PageEvent; thing: Thing; detail: Detail<"app"> }) {
  const v = VARIANT[detail.variant];
  const json = detail.variant === "handler" ? jsonOf(event.content) : null;
  const banner = str(json?.banner);
  const platforms = detail.variant === "handler" ? platformsOf(event) : [];
  const open = detail.variant === "handler" ? thing.link : siteUrl(event);
  const source = event.tags.find((t) => t[0] === "source")?.[1];
  const sourceWeb = source && /^https?:\/\//i.test(source) ? source : null;
  const servers = event.tags.filter((t) => t[0] === "server" && /^https?:\/\//i.test(t[1] ?? "")).map((t) => t[1]);
  return (
    <div data-testid="thing-page-app">
      {banner && /^https?:\/\//.test(banner) && (
        <div className="relative -mx-1 -mt-1 mb-4 aspect-[3/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          <MediaImg src={banner} preset="media_1280" alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="flex items-start gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <SafeImg
            src={thing.image}
            className="h-full w-full object-cover"
            fallback={<v.icon className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={v.icon}>{v.word}</Kicker>
          <PageTitle testId="thing-page-title">{thing.title}</PageTitle>
          {detail.variant === "napplet" && detail.requires.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {detail.requires.map((r) => (
                <Chip key={r} size="sm" tone="slate">
                  Needs {r}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>
      <Actions testId="thing-page-actions">
        {open && (
          <ActionLink primary href={open} testId="thing-page-open">
            {detail.variant === "site" ? "Open site" : `Open ${thing.title.length <= 20 ? thing.title : "app"}`}
          </ActionLink>
        )}
        {platforms
          .filter((p) => p.url !== open)
          .map((p) => (
            <ActionLink key={p.url} href={p.url}>
              {p.label}
            </ActionLink>
          ))}
        {sourceWeb && <ActionLink href={sourceWeb}>Source</ActionLink>}
      </Actions>
      {thing.description && <ReadingText text={thing.description} className="mt-4" testId="thing-page-description" />}

      {detail.variant === "handler" && detail.handles.length > 0 && (
        <div className="mt-4">
          <InfoBox
            label={`Opens ${detail.handles.length} ${detail.handles.length === 1 ? "kind" : "kinds"}`}
            icon={FileCode}
            testId="thing-page-kinds"
          >
            <div className="flex flex-wrap gap-1.5">
              {detail.handles.map((k) => (
                <Link
                  key={k}
                  href={`/?q=${encodeURIComponent(`kind:${k}`)}`}
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                >
                  <Chip size="sm" tone="slate">
                    {kindWords(k)}
                  </Chip>
                </Link>
              ))}
            </div>
          </InfoBox>
        </div>
      )}
      {(detail.variant !== "handler" || json) && (
        <div className="mt-4">
          <InfoBox label="Details" icon={v.icon}>
            <FactRows
              rows={
                detail.variant === "handler"
                  ? [
                      ["Website", thing.link ? hostOf(thing.link) : null],
                      ["Lightning", str(json?.lud16)],
                      ["Verified as", str(json?.nip05)],
                    ]
                  : [
                      ["Files", detail.files > 0 ? detail.files.toLocaleString("en-US") : null],
                      [
                        "Served from",
                        servers.length
                          ? servers
                              .map((s) => hostOf(s))
                              .filter(Boolean)
                              .join(", ")
                          : null,
                      ],
                      ["Entry point", event.tags.find((t) => t[0] === "entrypoint")?.[1]],
                      ["Source", source && !sourceWeb ? source : null],
                    ]
              }
            />
          </InfoBox>
        </div>
      )}
    </div>
  );
}

const FILES_FOLD = 40;

export function AppThingSections({ event, detail }: { event: PageEvent; detail: Detail<"app"> }) {
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  // Who recommends this handler: NIP-89 recommendations (31989) that `a`-tag it.
  const recommenders = useFetched(detail.variant === "handler" ? `app-recs:${event.id}` : null, () =>
    fetchFromSearch([{ kinds: [31989], "#a": [`31990:${event.pubkey}:${d}`] }], { limit: 200 }).then((evs) => [
      ...new Set(evs.map((e) => e.pubkey)),
    ]),
  );
  const files = event.tags.filter((t) => t[0] === "path" && t[1]).map((t) => ({ path: t[1], hash: t[2] ?? "" }));
  if (detail.variant === "handler") {
    return (
      <Section title="Recommended by" count={recommenders?.length} testId="thing-page-recommenders">
        {recommenders === undefined ? (
          <SectionNote>Looking for recommendations…</SectionNote>
        ) : recommenders.length === 0 ? (
          <SectionNote>No one has recommended this app yet.</SectionNote>
        ) : (
          <PeopleRoster pubkeys={recommenders} />
        )}
      </Section>
    );
  }
  if (files.length === 0) return null;
  return <FileList files={files} />;
}

function FileList({ files }: { files: { path: string; hash: string }[] }) {
  return (
    <Section title="Files" count={files.length} testId="thing-page-files">
      <details
        className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        open={files.length <= FILES_FOLD}
      >
        <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {files.length <= FILES_FOLD ? "Every file this site is made of" : `Show all ${files.length} files`}
        </summary>
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {files.map((f, i) => (
            <li key={`${f.path}-${i}`} className="flex items-center justify-between gap-3 px-4 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <Server className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{f.path}</span>
              </span>
              {f.hash && (
                <span className="shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  {f.hash.slice(0, 8)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}
