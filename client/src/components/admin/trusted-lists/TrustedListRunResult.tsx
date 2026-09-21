import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TrustedListMembers } from "./TrustedListMembers";
import { Chip } from "@/components/ui/chip";
import { StatTile } from "@/components/ui/stat-tile";
import type { Tone } from "@/lib/tones";
import type { TrustedListRunData, TrustedListTagResult } from "@/services/api";

const STATUS: Record<TrustedListTagResult["status"], { label: string; tone: Tone }> = {
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  retracted: { label: "Retracted", tone: "neutral" },
};

/** Why a run published nothing, and what the admin can do about it. */
const EMPTY: Record<NonNullable<TrustedListRunData["empty_reason"]>, { title: string; body: string }> = {
  no_taggings_ingested: {
    title: "No taggings yet",
    body: "No taggings have reached the server yet, so there was nothing to build lists from. Nothing was published or retracted.",
  },
  no_qualifying_asserters: {
    title: "Nobody they trust has tagged anyone",
    body: "Usually their trust network hasn't been calculated yet — calculate it from the Users tab, then publish again. Nothing was published or retracted.",
  },
  no_tags_met_use_threshold: {
    title: "No tag qualified",
    body: "No tag was used by enough people they trust, so there's nothing to publish. Their older lists were retracted.",
  },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What one run did for one observer: the counts, then every list it touched. */
export function TrustedListRunResult({ run, observerName }: { run: TrustedListRunData; observerName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4" data-testid="trusted-lists-result">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
        Published {plural(run.published, "list", "lists")} for {observerName}
        {run.signing_pubkey && (
          <span className="font-normal text-slate-500 dark:text-slate-400">
            {" "}· signed by {run.signing_pubkey.slice(0, 8)}…
          </span>
        )}
      </p>
      {run.empty_reason && EMPTY[run.empty_reason] && (
        <Alert data-testid="trusted-lists-empty">
          <AlertTitle>{EMPTY[run.empty_reason].title}</AlertTitle>
          <AlertDescription>{EMPTY[run.empty_reason].body}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile compact label="Qualifying asserters" value={run.qualifying_asserters} />
        <StatTile compact label="Lists" value={run.dictionary_size} />
        <StatTile compact label="Published" value={run.published} tone="success" />
        <StatTile compact label="Failed" value={run.failed} tone={run.failed > 0 ? "danger" : "neutral"} />
        <StatTile compact label="Retracted" value={run.retracted} tone="neutral" />
      </div>
      {run.tags.length > 0 && (
        <ul className="space-y-1.5">
          {run.tags.map((t) => (
            <li
              key={t.d_tag}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60"
              data-testid={`trusted-list-row-${t.slug}`}
            >
              <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={t.d_tag}>
                {t.slug}
              </span>
              <Chip tone={STATUS[t.status].tone} size="sm">{STATUS[t.status].label}</Chip>
              {/* Its own line on a phone, beside the name on a desk. */}
              <span
                className="basis-full text-xs text-slate-500 dark:text-slate-400 sm:basis-auto"
                data-testid={`trusted-list-meta-${t.slug}`}
              >
                {t.status === "retracted"
                  ? "No longer qualifies"
                  : `${plural(t.member_count, "member", "members")} · ${plural(t.taggings_considered, "tagging", "taggings")}`}
              </span>
              {t.status === "failed" && t.error && (
                <span className="basis-full text-xs text-red-600 dark:text-red-400">{t.error}</span>
              )}
              {/* Only a published list has anything on the relay to read back. */}
              {t.status === "published" && run.signing_pubkey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={() => setOpen((o) => (o === t.d_tag ? null : t.d_tag))}
                  data-testid={`trusted-list-view-${t.slug}`}
                >
                  {open === t.d_tag ? "Hide list" : "View list"}
                </Button>
              )}
              {open === t.d_tag && run.signing_pubkey && (
                <TrustedListMembers
                  observer={run.observer}
                  signingPubkey={run.signing_pubkey}
                  dTag={t.d_tag}
                  testId={`trusted-list-members-${t.slug}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
