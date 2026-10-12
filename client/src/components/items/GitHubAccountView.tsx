/**
 * A GitHub account on its own page (ADR 0007, tier three). The handle leads,
 * as GitHub shows an account; beside it the account's own avatar, fetched
 * from github.com through the image proxy like any picture, falling back to
 * the list's mark; under it the byline the list gives it. The buttons are
 * the links the definition's URL templates build (the profile), plus the
 * repositories tab of that profile; a definition that names no template
 * gives none, and the view adds no link of its own.
 *
 * What it reads is the governing definition's `github-username` and
 * `description` fields — the community concept's names for them — so a
 * copy that renames the handle leaves the item to the tier-two page.
 *
 * The rest of the list follows, for everyone; the definition line and the
 * "More fields" fold are an admin's, since a reader came for the account.
 */
import { ExternalLink, FolderGit2, Github } from "lucide-react";
import { Favicon } from "@/components/share/LinkPreview";
import { DListItemNeighbours } from "@/components/dictionary/DListItemNeighbours";
import {
  ConceptLink,
  DefinitionLine,
  MoreFields,
  type FieldCells,
  type ItemEvent,
} from "@/components/share/DListItemParts";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import type { ReadyItemView } from "@/hooks/useItemView";
import { useAvatarSrc } from "@/lib/avatarSrc";
import { useConnectionSpeed } from "@/lib/connection";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { fieldCell, undeclaredFields } from "@/lib/dlistFields";
import { EmojiText } from "@/components/ui/custom-emoji";

const HANDLE_FIELD = "github-username";
const BYLINE_FIELD = "description";

export interface GitHubAccount {
  handle: string;
  byline: string | null;
}

/**
 * The account the item names, read through the definition: null when the
 * definition doesn't declare the handle field or the item doesn't fill it.
 */
export function githubAccountOf(item: { tags: string[][] }, definition: ConceptDefinition): GitHubAccount | null {
  const handleDecl = definition.fields.find((f) => f.name === HANDLE_FIELD);
  if (!handleDecl) return null;
  const handle = fieldCell(item, handleDecl).value?.trim();
  if (!handle) return null;
  const bylineDecl = definition.fields.find((f) => f.name === BYLINE_FIELD);
  const byline = bylineDecl ? fieldCell(item, bylineDecl).value?.trim() || null : null;
  return { handle, byline };
}

/** GitHub serves an account's avatar at its handle; the proxy keeps the page from contacting github.com itself. */
const avatarUrl = (handle: string) => `https://github.com/${encodeURIComponent(handle)}.png?size=160`;

export function GitHubAccountView({ event, view }: { event: ItemEvent; view: ReadyItemView }) {
  const { resolved: r, shown, links, usedFields } = view;
  const account = githubAccountOf(event, r.governing)!;
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;

  // The profile is the first link the templates build on github.com; the rest are offered as they are.
  const profile = links.find((l) => l.host === "github.com") ?? null;
  const others = links.filter((l) => l !== profile);
  const repos = profile ? `${profile.href}?tab=repositories` : null;

  // The admin's fold: declared fields the page doesn't show, and tags outside the definition.
  const used = new Set([...usedFields, HANDLE_FIELD, BYLINE_FIELD]);
  const unshown: FieldCells = r.governing.fields
    .map((field) => ({ field, cell: fieldCell(event, field) }))
    .filter((c) => !used.has(c.field.name) && c.cell.value != null);
  const extras = undeclaredFields(event, r.governing.fields);

  return (
    <div className="space-y-5" data-testid="dlist-item-hero" data-definition="read" data-view="github-account">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          {r.governing.singular}{" "}
          <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
            in <ConceptLink event={event}>{r.governing.plural}</ConceptLink>
          </span>
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar handle={account.handle} listImage={shown.listImage} />
            <div className="min-w-0 flex-1">
              <h1
                className="break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="github-account-handle"
              >
                {account.handle}
              </h1>
              {account.byline && (
                <p
                  className="mt-1 break-words text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
                  data-testid="github-account-byline"
                >
                  <EmojiText text={account.byline} tags={event} />
                </p>
              )}
            </div>
          </div>
          {(profile || others.length > 0) && (
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end [&>a]:flex-1 sm:[&>a]:flex-none">
              {profile && (
                <a
                  href={profile.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                  data-testid="github-account-profile"
                  title={profile.href}
                >
                  <Github className="h-4 w-4" />
                  {profile.label}
                  <span className="sr-only">· {profile.host}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </a>
              )}
              {repos && (
                <a
                  href={repos}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  data-testid="github-account-repos"
                  title={repos}
                >
                  <FolderGit2 className="h-4 w-4" />
                  Repositories
                  <span className="sr-only">· github.com</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </a>
              )}
              {others.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  data-testid="dlist-item-link"
                  title={l.href}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-white">
                    <Favicon host={l.host} className="h-3.5 w-3.5 text-slate-500" />
                  </span>
                  {l.label}
                  <span className="sr-only">· {l.host}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && <MoreFields cells={unshown} extras={extras} singular={r.governing.singular} />}

      <DListItemNeighbours event={event} resolved={r} />

      {isAdmin && <DefinitionLine event={event} resolved={r} />}
    </div>
  );
}

/** The account's own picture; when GitHub has none to give, the list's mark, else GitHub's. */
function Avatar({ handle, listImage }: { handle: string; listImage: string | null }) {
  const speed = useConnectionSpeed();
  const { src, onError, spent } = useAvatarSrc(avatarUrl(handle), "lg", speed);
  if (!spent && src)
    return (
      <img
        src={src}
        onError={onError}
        alt=""
        className="h-16 w-16 shrink-0 rounded-full border border-border object-cover"
        data-testid="github-account-avatar"
      />
    );
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-700">
      {listImage ? (
        <img src={listImage} alt="" className="h-9 w-9 object-contain" data-testid="dlist-item-list-image" />
      ) : (
        <Github className="h-7 w-7" data-testid="github-account-mark" />
      )}
    </span>
  );
}
