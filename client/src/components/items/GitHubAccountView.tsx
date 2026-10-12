/**
 * A GitHub account on its own page (ADR 0007, tier three). The handle leads,
 * as GitHub shows an account — the name, once our origin has GitHub's facts
 * (useGitHubAccount), with the handle under it; beside it the account's own
 * avatar, fetched from github.com through the image proxy like any picture,
 * falling back to the list's mark; under it the bio and the byline the list
 * gives it. Then what GitHub says — followers, repos, last activity, where —
 * and the account's best repos by stars, so a reader can judge a developer
 * at a glance. None of it is asked of GitHub by the page itself. The buttons are
 * the links the definition's URL templates build (the profile), plus the
 * repositories tab of that profile, as two icon buttons side by side; a
 * definition that names no template gives none, and the view adds no link
 * of its own.
 *
 * What it reads is the governing definition's `github-username` and
 * `description` fields — the community concept's names for them — so a
 * copy that renames the handle leaves the item to the tier-two page.
 *
 * Under the name, GitHub's numbers and the account's best repos; then what
 * the reader's network says as labelled facts (FromYourNetwork): who vouches (the
 * endorsers' faces, the people the reader follows first, with an Endorse
 * button for a signed-in reader: one "+", public and signed), and how far
 * the lister is. Then which Nostr profiles in the reader's web of trust
 * claim the handle (useItemEngagement). Strangers' claims are read but not
 * shown.
 *
 * The rest of the list follows, for everyone; the definition line and the
 * "More fields" fold are an admin's, since a reader came for the account.
 */
import type { ReactNode } from "react";
import { Activity, BadgeCheck, FolderGit2, Github, MapPin, Star, Users } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useNetworkView, WhoStandsBehindIt, type NetworkView } from "@/components/items/WhoStandsBehindIt";
import type { GitHubClaimant } from "@/lib/itemEngagement";
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
import { useGitHubAccount } from "@/hooks/useGitHubAccount";
import { topRepos, type GitHubAccountFacts } from "@/services/github";
import { compactCount } from "@/lib/compactCount";
import { relativeTime } from "@/lib/relativeTime";
import type { ReadyItemView } from "@/hooks/useItemView";
import { useAvatarSrc } from "@/lib/avatarSrc";
import { useConnectionSpeed } from "@/lib/connection";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import type { ItemPresentation } from "@/lib/itemPresentation";
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

/**
 * How a GitHub account reads wherever it is one among many (ADR 0007): the
 * handle first, the account's own avatar, the description as the line —
 * whatever the copy's display hints say the title is. The handle is read
 * through the definition (githubAccountOf); nothing is asked of GitHub.
 */
export function githubPresentation(
  item: { tags: string[][] },
  definition: ConceptDefinition,
  shown: ItemPresentation,
): ItemPresentation {
  const account = githubAccountOf(item, definition);
  if (!account) return shown;
  const summary = account.byline ?? (shown.summary !== account.handle ? shown.summary : null);
  return {
    ...shown,
    title: account.handle,
    titleField: HANDLE_FIELD,
    summary: summary === account.handle ? null : summary,
    summaryField: account.byline ? BYLINE_FIELD : shown.summaryField,
    image: avatarUrl(account.handle),
  };
}

export function GitHubAccountView({ event, view }: { event: ItemEvent; view: ReadyItemView }) {
  const { resolved: r, shown, links, usedFields } = view;
  const account = githubAccountOf(event, r.governing)!;
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;
  const facts = useGitHubAccount(account.handle).data ?? null;
  const network = useNetworkView(event, account.handle);

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
      {/* Phone: the kicker and the buttons share the top row, the name has the next to itself —
          a long name never meets a button. From sm up the buttons sit beside the name. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 [grid-template-areas:'kicker_buttons''title_title'] sm:[grid-template-areas:'kicker_kicker''title_buttons']">
        <p className="min-w-0 self-center truncate text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary [grid-area:kicker]">
          <ConceptLink event={event}>{r.governing.singular}</ConceptLink>
        </p>
        <div className="flex min-w-0 items-center gap-4 [grid-area:title]">
          <AccountPicture handle={account.handle} listImage={shown.listImage} />
          <div className="min-w-0 flex-1">
            <h1
              className="break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="github-account-name"
            >
              {facts?.name ?? <span data-testid="github-account-handle">{account.handle}</span>}
            </h1>
            {facts?.name && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400" data-testid="github-account-handle">
                {account.handle}
              </p>
            )}
            {facts?.bio && (
              <p
                className="mt-1 break-words text-[15px] leading-relaxed text-slate-700 dark:text-slate-200"
                data-testid="github-account-bio"
              >
                {facts.bio}
              </p>
            )}
            {account.byline && (
              <p
                className={`mt-1 break-words leading-relaxed ${facts?.bio ? "text-sm text-slate-500 dark:text-slate-400" : "text-[15px] text-slate-600 dark:text-slate-300"}`}
                data-testid="github-account-byline"
              >
                <EmojiText text={account.byline} tags={event} />
              </p>
            )}
          </div>
        </div>
        {(profile || others.length > 0) && (
          <div className="flex items-center gap-2 self-center [grid-area:buttons]" data-testid="github-account-buttons">
            {profile && (
              <IconButton href={profile.href} label={profile.label} primary testId="github-account-profile">
                <Github className="h-4 w-4 sm:h-5 sm:w-5" />
              </IconButton>
            )}
            {repos && (
              <IconButton href={repos} label="Repositories on GitHub" testId="github-account-repos">
                <FolderGit2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </IconButton>
            )}
            {others.map((l) => (
              <IconButton key={l.href} href={l.href} label={`${l.label} · ${l.host}`} testId="dlist-item-link">
                <Favicon host={l.host} className="h-4 w-4 text-slate-500" />
              </IconButton>
            ))}
          </div>
        )}
      </div>

      {facts && <GitHubStats facts={facts} />}

      {facts && <TopRepos facts={facts} />}

      <WhoStandsBehindIt network={network} noun="account" idPrefix="github-account" />

      <OnNostr event={event} network={network} />

      {isAdmin && <MoreFields cells={unshown} extras={extras} singular={r.governing.singular} />}

      <DListItemNeighbours event={event} resolved={r} alsoListed={false} />

      {isAdmin && <DefinitionLine event={event} resolved={r} />}
    </div>
  );
}

/**
 * A square icon button that opens elsewhere: the icon is the whole face, the
 * label is for screen readers and the hover. Two sit side by side: in the
 * top right corner on a phone, at the right of the title from `sm` up.
 */
function IconButton({
  href,
  label,
  primary = false,
  testId,
  children,
}: {
  href: string;
  label: string;
  primary?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={label}
      title={label}
      className={
        primary
          ? "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover sm:h-11 sm:w-11"
          : "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:h-11 sm:w-11"
      }
      data-testid={testId}
    >
      {children}
    </a>
  );
}

/** The claimants in the reader's web of trust, when there are any; the endorsers are on the strip above. */
function OnNostr({ event: _event, network: n }: { event: ItemEvent; network: NetworkView }) {
  const { split } = n;
  if (split.trusted.length === 0) return null;
  return (
    <Claimants
      trusted={split.trusted}
      nameOf={n.nameOf}
      pictureOf={n.pictureOf}
      npubOf={n.npubOf}
      scoreOf={n.scoreOf}
    />
  );
}

/**
 * Who on Nostr says this GitHub account is theirs (a NIP-39 claim on their
 * profile): the ones in the reader's web of trust, each a link. Strangers'
 * claims aren't counted or shown (the team, 2026-10-12: a count of them
 * reads as a warning about the account, not about the strangers).
 */
function Claimants({
  trusted,
  nameOf,
  pictureOf,
  npubOf,
  scoreOf,
}: {
  trusted: GitHubClaimant[];
  nameOf: (pk: string) => string;
  pictureOf: (pk: string) => string | undefined;
  npubOf: (pk: string) => string | undefined;
  scoreOf: (pk: string) => number | null | undefined;
}) {
  const tierRing = useTierRing();
  return (
    <div className="space-y-2" data-testid="github-account-claimants">
      {trusted.length > 0 && (
        <ul className="space-y-1.5">
          {trusted.map((c) => {
            const npub = npubOf(c.pubkey);
            const name = nameOf(c.pubkey);
            return (
              <li
                key={c.pubkey}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                data-testid="github-account-claimant"
              >
                <Avatar
                  className={`h-7 w-7 rounded-full bg-white dark:bg-slate-900 ${tierRing(scoreOf(c.pubkey), false, "sm", true) ?? ""}`}
                >
                  {pictureOf(c.pubkey) ? (
                    <AvatarImage src={pictureOf(c.pubkey)} alt="" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="overflow-hidden rounded-full">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
                {npub ? (
                  <Link
                    href={`/p/${npub}`}
                    className="min-w-0 truncate font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">says this GitHub account is theirs</span>
                <Chip tone="success" icon={BadgeCheck} size="sm">
                  In your network
                </Chip>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TOP_REPOS = 3;
const toUnix = (iso: string | null) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : 0);

/** GitHub's numbers, right under the name: the ones a reader judges a developer by. */
function GitHubStats({ facts }: { facts: GitHubAccountFacts }) {
  const joined = facts.joinedAt ? new Date(facts.joinedAt).getUTCFullYear() : null;
  const active = facts.lastActiveAt ? relativeTime(toUnix(facts.lastActiveAt)) : null;
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300"
      data-testid="github-account-stats"
    >
      <li className="inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {compactCount(facts.followers)}
        </span>{" "}
        followers
      </li>
      <li className="inline-flex items-center gap-1.5">
        <FolderGit2 className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {compactCount(facts.publicRepos)}
        </span>{" "}
        repos
      </li>
      {active && (
        <li className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-slate-400" />
          Active {active}
        </li>
      )}
      {joined && <li className="hidden sm:list-item">Joined {joined}</li>}
      {facts.location && (
        <li className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          {facts.location}
        </li>
      )}
    </ul>
  );
}

/** The account's best repos by stars, with GitHub's numbers above them. Nothing here is a field of the list. */
function TopRepos({ facts }: { facts: GitHubAccountFacts }) {
  const repos = topRepos(facts.repos, TOP_REPOS);
  if (repos.length === 0) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-3" data-testid="github-account-repos">
      {repos.map((repo) => (
        <li
          key={repo.url}
          className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700"
          data-testid="github-account-repo"
        >
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
            title={repo.url}
          >
            {repo.name}
          </a>
          {repo.description && (
            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:line-clamp-2">
              {repo.description}
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Star className="h-3 w-3" /> {compactCount(repo.stars)}
            </span>
            {repo.language && <span>{repo.language}</span>}
            {repo.pushedAt && <span>{relativeTime(toUnix(repo.pushedAt))}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The account's own picture; when GitHub has none to give, the list's mark, else GitHub's. */
function AccountPicture({ handle, listImage }: { handle: string; listImage: string | null }) {
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
