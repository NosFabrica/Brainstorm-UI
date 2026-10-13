import { Download, FileAudio, FileImage, FileText, FileVideo, Package } from "lucide-react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { formatBytes } from "@/lib/formatBytes";
import { fileMime, isMediaFile } from "@/lib/fileMetadata";
import { mediaItemsOf } from "@/lib/mediaKind";
import { EmojiText } from "@/components/ui/custom-emoji";
import { EventMedia } from "@/components/share/EventMedia";

const APK = "application/vnd.android.package-archive";

/** What a file's mime is called to a reader: "Android app", "PDF", "Image". */
export function fileKindLabel(mime: string): string {
  if (mime === APK) return "Android app";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  const sub = mime.split("/")[1];
  return sub
    ? sub
        .replace(/^x-/, "")
        .replace(/^vnd\./, "")
        .toUpperCase()
    : "File";
}

/** The icon beside a file's name: the kind of media it is, an installer, or a document. */
function fileIcon(mime: string) {
  if (mime === APK) return Package;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  return FileText;
}

/**
 * A NIP-94 file (kind 1063) on its page: what it is and where to get it.
 * Zap Store publishes one per app release — "com.vitorpamplona.amethyst@1.05.1",
 * an Android installer on GitHub — which read as a bare note before. A picture,
 * a video or a sound shows first, drawn as what it is (EventMedia, behind a
 * cover when marked sensitive), with its exact mime and size under it.
 */
export function FileHero({ event }: { event: MinimalEvent }) {
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1] ?? "";
  const mime = fileMime(event);
  const url = tag("url");
  const isApk = mime === APK;
  // "package@version" is Zap Store's content; the version rides a tag too.
  const packaged = event.content.trim().match(/^([\w.-]+)@([\w.-]+)$/);
  const version = tag("version") || packaged?.[2] || "";
  const fileName = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    } catch {
      return "";
    }
  })();
  const name = packaged?.[1] || tag("alt") || event.content.trim() || fileName || "File";
  const size = formatBytes(Number(tag("size")));
  const hash = tag("x");
  const media = isMediaFile(event);
  const dim = /^(\d+)x(\d+)$/.exec(tag("dim"));
  const facts = [
    fileKindLabel(mime),
    // A media file's exact type ("image/webp") tells a reader what will open it; an installer's is noise.
    media ? mime : "",
    dim ? `${dim[1]}×${dim[2]}` : "",
    version ? `v${version}` : "",
    size,
  ].filter(Boolean);
  const Icon = fileIcon(mime);
  return (
    <div data-testid="file-hero">
      {media && <EventMedia key={event.id} event={event} items={mediaItemsOf(event)} />}
      <div className={`flex items-start gap-3 ${media ? "mt-3" : ""}`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="break-words text-base font-semibold text-slate-900 dark:text-slate-100"
            data-testid="file-hero-name"
          >
            <EmojiText text={name} tags={event} />
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" data-testid="file-hero-facts">
            {facts.join(" · ")}
          </p>
          {hash && (
            <p
              className="mt-0.5 truncate font-mono text-[11px] text-slate-400 dark:text-slate-500"
              title={`SHA-256 ${hash}`}
              data-testid="file-hero-hash"
            >
              SHA-256 {hash.slice(0, 12)}…{hash.slice(-6)}
            </p>
          )}
          {url && (
            <a
              href={url}
              download
              target="_blank"
              rel="noopener"
              title={hash ? `SHA-256 ${hash}` : undefined}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300"
              data-testid="file-hero-download"
            >
              <Download className="h-3 w-3" />
              {isApk ? "Download APK" : "Download"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
