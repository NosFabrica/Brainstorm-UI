/**
 * The pages of things that point at something to fetch: a learning resource
 * (the lesson itself, one tap away, with the facts a teacher filters by) and
 * a NIP-35 torrent (its magnet link, every file it holds, its trackers).
 */
import { useState } from "react";
import {
  Download,
  File as FileIcon,
  Film,
  GraduationCap,
  Hash,
  Image as ImageIcon,
  Music,
  Package,
  Archive,
  Radio,
} from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { MediaImg } from "@/components/ui/media-img";
import { ReadingText } from "@/components/share/ReadingText";
import { ThingCard, magnetOf } from "@/components/search/thingCards";
import { fetchFromSearch } from "@/services/search";
import { formatBytes } from "@/lib/formatBytes";
import { languageName } from "@/lib/translate";
import type { Thing, TorrentCategory } from "@/lib/thing";
import type { Detail } from "./types";
import {
  ActionLink,
  Actions,
  CopyButton,
  FactRows,
  InfoBox,
  Kicker,
  PageTitle,
  Section,
  hostOf,
  useFetched,
  type PageEvent,
  useAuthors,
} from "./shared";
import { EmojiText } from "@/components/ui/custom-emoji";

const tagOf = (e: PageEvent, k: string) => e.tags.find((t) => t[0] === k)?.[1];

// ——— Learning resource ———

export function LearningHero({ event, thing, detail }: { event: PageEvent; thing: Thing; detail: Detail<"learning"> }) {
  const licenseUrl = tagOf(event, "license:id");
  const creatorType = tagOf(event, "creator:type");
  return (
    <div data-testid="thing-page-learning">
      {thing.image && (
        <div className="relative -mx-1 -mt-1 mb-4 aspect-[2/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          <MediaImg
            src={thing.image}
            preset="media_1280"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <Kicker icon={GraduationCap}>Learning resource</Kicker>
      <PageTitle testId="thing-page-title">
        <EmojiText text={thing.title} tags={thing.emoji} />
      </PageTitle>
      {detail.creator && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {detail.creator}
          {creatorType && creatorType !== "Person" && <span className="text-slate-400"> · {creatorType}</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {detail.free && (
          <Chip size="sm" tone="success">
            Free
          </Chip>
        )}
        {detail.audience.map((a) => (
          <Chip key={a} size="sm" tone="slate">
            {a}
          </Chip>
        ))}
      </div>
      <Actions testId="thing-page-actions">
        {thing.link && (
          <ActionLink primary href={thing.link} testId="thing-page-open">
            Open resource
          </ActionLink>
        )}
      </Actions>
      {thing.link && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Opens {hostOf(thing.link)} in a new tab.</p>
      )}
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-4" testId="thing-page-description" />
      )}
      <div className="mt-4">
        <InfoBox label="About this resource" icon={GraduationCap} testId="thing-page-facts">
          <FactRows
            rows={[
              ["Language", detail.language ? languageName(detail.language) : null],
              [
                "Licence",
                detail.license ? (
                  licenseUrl && /^https?:\/\//.test(licenseUrl) ? (
                    <a href={licenseUrl} target="_blank" rel="noopener" className="text-brand-link hover:underline">
                      {detail.license}
                    </a>
                  ) : (
                    detail.license
                  )
                ) : null,
              ],
              ["Cost", detail.free ? "Free to use" : null],
              ["Made by", detail.creator],
              ["Topics", detail.topics.length ? detail.topics.join(", ") : null],
            ]}
          />
        </InfoBox>
      </div>
    </div>
  );
}

export function LearningSections({ event }: { event: PageEvent }) {
  const more = useFetched(`learning-more:${event.pubkey}`, () =>
    fetchFromSearch([{ kinds: [30142], authors: [event.pubkey] }], { limit: 12 }),
  );
  const others = (more ?? []).filter((e) => e.id !== event.id && tagOf(e, "d") !== tagOf(event, "d"));
  const authors = useAuthors([event.pubkey]);
  if (others.length === 0) return null;
  return (
    <Section title="More from this author" count={others.length} testId="thing-page-more">
      <div className="space-y-2">
        {others.slice(0, 6).map((e) => (
          <ThingCard key={e.id} event={e} author={authors.get(e.pubkey) ?? null} />
        ))}
      </div>
    </Section>
  );
}

// ——— Torrent ———

const TORRENT_ICONS: Record<TorrentCategory, typeof FileIcon> = {
  audio: Music,
  video: Film,
  image: ImageIcon,
  software: Package,
  archive: Archive,
  other: FileIcon,
};
const TORRENT_WORD: Record<TorrentCategory, string> = {
  audio: "Audio",
  video: "Video",
  image: "Images",
  software: "Software",
  archive: "Archive",
  other: "Files",
};

export function TorrentHero({ thing, detail }: { thing: Thing; detail: Detail<"torrent"> }) {
  const Icon = TORRENT_ICONS[detail.category];
  const magnet = magnetOf(thing.title, detail);
  return (
    <div data-testid="thing-page-torrent">
      <div className="flex items-start gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <Icon className="h-7 w-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={Download}>Torrent · {TORRENT_WORD[detail.category]}</Kicker>
          <PageTitle testId="thing-page-title">
            <EmojiText text={thing.title} tags={thing.emoji} />
          </PageTitle>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {[
              detail.files.length > 0 && `${detail.files.length} ${detail.files.length === 1 ? "file" : "files"}`,
              detail.totalBytes > 0 && formatBytes(detail.totalBytes),
              detail.trackers.length > 0 &&
                `${detail.trackers.length} ${detail.trackers.length === 1 ? "tracker" : "trackers"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <Actions testId="thing-page-actions">
        {magnet && (
          <ActionLink primary href={magnet} icon={Download} testId="thing-page-magnet">
            Open magnet link
          </ActionLink>
        )}
        {magnet && <CopyButton value={magnet} label="Copy magnet link" />}
      </Actions>
      {magnet && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Opens in your torrent client.</p>}
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-4" testId="thing-page-description" />
      )}
      {detail.infoHash && (
        <div className="mt-4">
          <InfoBox label="Info hash" icon={Hash}>
            <code
              className="break-all font-mono text-sm text-slate-700 dark:text-slate-200"
              data-testid="thing-page-hash"
            >
              {detail.infoHash}
            </code>
          </InfoBox>
        </div>
      )}
      {detail.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {detail.topics.map((t) => (
            <Chip key={t} size="sm" tone="slate">
              #{t}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

const FOLD = 50;

export function TorrentSections({ detail }: { detail: Detail<"torrent"> }) {
  const [allFiles, setAllFiles] = useState(false);
  const [allTrackers, setAllTrackers] = useState(false);
  const files = allFiles ? detail.files : detail.files.slice(0, FOLD);
  const trackers = allTrackers ? detail.trackers : detail.trackers.slice(0, 8);
  return (
    <>
      {detail.files.length > 0 && (
        <Section title="Files" count={detail.files.length} testId="thing-page-files">
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{f.name}</span>
                {f.bytes > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatBytes(f.bytes)}</span>
                )}
              </li>
            ))}
          </ul>
          {detail.files.length > FOLD && (
            <button
              type="button"
              onClick={() => setAllFiles((s) => !s)}
              className="mt-2 text-xs font-semibold text-brand-link hover:underline"
            >
              {allFiles ? "Show fewer" : `Show all ${detail.files.length} files`}
            </button>
          )}
        </Section>
      )}
      {detail.trackers.length > 0 && (
        <Section title="Trackers" count={detail.trackers.length} testId="thing-page-trackers">
          <ul className="space-y-1">
            {trackers.map((t, i) => (
              <li key={`${t}-${i}`} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Radio className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <span className="truncate font-mono">{t}</span>
              </li>
            ))}
          </ul>
          {detail.trackers.length > 8 && (
            <button
              type="button"
              onClick={() => setAllTrackers((s) => !s)}
              className="mt-2 text-xs font-semibold text-brand-link hover:underline"
            >
              {allTrackers ? "Show fewer" : `Show all ${detail.trackers.length}`}
            </button>
          )}
        </Section>
      )}
    </>
  );
}
