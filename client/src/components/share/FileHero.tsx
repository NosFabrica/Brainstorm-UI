import { Download, FileText, Package } from "lucide-react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { formatBytes } from "@/lib/formatBytes";
import { fileMime } from "@/lib/fileMetadata";

const APK = "application/vnd.android.package-archive";

/** What a file's mime is called to a reader: "Android app", "PDF", "Image". */
export function fileKindLabel(mime: string): string {
  if (mime === APK) return "Android app";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  const sub = mime.split("/")[1];
  return sub ? sub.replace(/^x-/, "").replace(/^vnd\./, "").toUpperCase() : "File";
}

/**
 * A NIP-94 file (kind 1063) on its page: what it is and where to get it.
 * Zap Store publishes one per app release — "com.vitorpamplona.amethyst@1.05.1",
 * an Android installer on GitHub — which read as a bare note before.
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
  const facts = [fileKindLabel(mime), version ? `v${version}` : "", size].filter(Boolean);
  const Icon = isApk ? Package : FileText;
  return (
    <div className="flex items-start gap-3" data-testid="file-hero">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-base font-semibold text-slate-900 dark:text-slate-100" data-testid="file-hero-name">{name}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{facts.join(" · ")}</p>
        {url && (
          <a
            href={url}
            download
            target="_blank"
            rel="noopener"
            title={hash ? `SHA-256 ${hash}` : undefined}
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors"
            data-testid="file-hero-download"
          >
            <Download className="h-3 w-3" />
            {isApk ? "Download APK" : "Download"}
          </a>
        )}
      </div>
    </div>
  );
}
