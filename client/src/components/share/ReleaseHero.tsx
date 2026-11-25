/**
 * A software release (kind 30063, lib/release) on /e: the app it belongs to,
 * its version and channel, the platforms it runs on, its files — each named,
 * typed, sized, with its platforms and a download where it has one — and the
 * release notes. NIP-51's shape names 1063 file metadata and the app by `a`;
 * NIP-82's names 3063 software assets and the app by `i`.
 */
import { useMemo } from "react";
import { AlertTriangle, Download, Package } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { MarkdownBody } from "@/components/share/MarkdownBody";
import { useRefEvents } from "@/hooks/useRefEvents";
import { useReleaseAssets } from "@/hooks/useReleaseAssets";
import { formatBytes } from "@/lib/formatBytes";
import type { MinimalEvent } from "@/lib/noteRefs";
import {
  platformLabel,
  readRelease,
  readReleaseAsset,
  releaseName,
  runtimeOf,
  type ReleaseAssetFile,
} from "@/lib/release";
import { eventPath } from "@/lib/shareId";

/** One file of the release, as a row: what it is, for what, how big, and where to get it. */
export function ReleaseAssetRow({ asset, event }: { asset: ReleaseAssetFile; event: MinimalEvent }) {
  const runtime = runtimeOf(asset.mime);
  const facts = [
    runtime ?? asset.mime,
    asset.size ? formatBytes(asset.size) : null,
    asset.version ? `v${asset.version}` : null,
    asset.minPlatformVersion ? `min ${asset.minPlatformVersion}` : null,
  ].filter((f): f is string => !!f);
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
      data-testid={`release-asset-${event.id}`}
    >
      <a href={eventPath(event)} className="min-w-0 flex-1 hover:opacity-80">
        <span
          className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100"
          title={asset.hash ?? undefined}
        >
          {asset.name ?? runtime ?? "File"}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400" data-testid="release-asset-facts">
          {facts.join(" · ")}
        </span>
        {asset.platforms.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {asset.platforms.map((p) => (
              <Chip key={p} size="sm" tone="slate">
                {platformLabel(p)}
              </Chip>
            ))}
          </span>
        )}
      </a>
      {asset.url && (
        <a
          href={asset.url}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-200"
          data-testid="release-asset-download"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      )}
    </li>
  );
}

export function ReleaseHero({ event }: { event: MinimalEvent }) {
  const release = useMemo(() => readRelease(event), [event]);
  // The app it is a release of, or — an `a` naming someone else's app — the one it only claims to be.
  const named = release.app ?? release.claimedApp;
  const appRefs = useMemo(() => (named ? [{ addr: named.address, relay: named.relay }] : []), [named]);
  const found = useRefEvents(appRefs);
  const namedApp = named ? found.get({ addr: named.address }) : undefined;
  const namedName =
    namedApp?.tags.find((t) => t[0] === "name")?.[1]?.trim() || named?.address.split(":").slice(2).join(":");
  const app = release.app ? namedApp : undefined;
  const appName = release.app ? namedName : undefined;
  const { assets, settled } = useReleaseAssets(release);
  const files = useMemo(() => assets.map((a) => ({ event: a, file: readReleaseAsset(a) })), [assets]);
  const missing = release.assets.length - files.length;

  return (
    <div className="space-y-5" data-testid="release-hero">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
        <div className="min-w-0">
          <h1
            className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="release-title"
          >
            {appName ? `${appName} ${releaseName(release)}` : releaseName(release)}
          </h1>
          <div
            className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
            data-testid="release-facts"
          >
            <span>Release</span>
            {release.channel && (
              <Chip size="sm" tone={release.channel === "main" ? "success" : "warning"} data-testid="release-channel">
                {release.channel}
              </Chip>
            )}
            <span>
              {release.assets.length} {release.assets.length === 1 ? "file" : "files"}
            </span>
            {release.platforms.map((p) => (
              <Chip key={p} size="sm" tone="slate">
                {platformLabel(p)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {app && <EmbeddedNoteCard event={app} href={eventPath(app)} nested />}

      {release.claimedApp && (
        // Anyone can sign a release naming any app: one by someone else than the app's publisher
        // is not that app's, and its files are not the app's files.
        <section className="space-y-2" data-testid="release-claimed-app">
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Claims to be a release of <span className="font-semibold">{namedName}</span>, but wasn&apos;t published by
              that app&apos;s publisher. Its files may not be the app&apos;s.
            </span>
          </p>
          {namedApp && <EmbeddedNoteCard event={namedApp} href={eventPath(namedApp)} nested />}
        </section>
      )}

      {release.assets.length > 0 && (
        <section className="space-y-2" data-testid="release-assets">
          <SectionHeader kicker="Files" />
          <ul className="space-y-2">
            {files.map(({ event: ev, file }) => (
              <ReleaseAssetRow key={ev.id} asset={file} event={ev} />
            ))}
          </ul>
          {settled && missing > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="release-assets-missing">
              {missing === release.assets.length
                ? "Its files weren't found on the relays asked."
                : `${missing} more ${missing === 1 ? "file wasn't" : "files weren't"} found on the relays asked.`}
            </p>
          )}
        </section>
      )}

      {release.notes && (
        <section className="space-y-2" data-testid="release-notes">
          <SectionHeader kicker="Release notes" />
          <MarkdownBody text={release.notes} tags={event.tags} />
        </section>
      )}
    </div>
  );
}
