import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * What can be typed into the box, as one sheet. Opened by the ? button beside Filters, or by
 * pressing `?` anywhere the box is not focused.
 *
 * It is the same sheet the relay's own operator page carries, because the grammar is the
 * relay's — a token documented here and not there (or the reverse) is the two drifting apart.
 * Every row is an example a person can copy, not a railroad diagram.
 */

/** One token, its example and what it does. */
interface Row {
  /** The token, with the part a person replaces in `em`. */
  token: string;
  em?: string;
  tail?: string;
  what: React.ReactNode;
}

const Tok = ({ token, em, tail }: Pick<Row, "token" | "em" | "tail">) => (
  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
    {token}
    {em && <em className="not-italic text-brand-link">{em}</em>}
    {tail}
  </code>
);

function Section({ title, intro, rows }: { title: string; intro?: React.ReactNode; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <SectionHeader kicker={title} />
      {intro && <p className="text-[13px] text-slate-500 dark:text-slate-400">{intro}</p>}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,15rem)_1fr]">
        {rows.map((r) => (
          <div key={r.token + (r.em ?? "")} className="contents">
            <dt className="min-w-0 pt-0.5">
              <Tok token={r.token} em={r.em} tail={r.tail} />
            </dt>
            <dd className="mb-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mb-0">{r.what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SearchSyntaxSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto" data-testid="search-syntax-sheet">
        <DialogHeader>
          <DialogTitle>Search syntax</DialogTitle>
          <DialogDescription>Type words. These narrow what comes back.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <Section
            title="Words"
            rows={[
              { token: "bitcoin mining", what: "Both words, anywhere in the event." },
              { token: '"exact phrase"', what: "Those words, in that order." },
              { token: "-word", what: <>Everything <b>except</b> results with that word.</> },
            ]}
          />

          <Section
            title="People"
            intro="Start typing a name after the colon and pick from the list — the box writes the key, and draws the person."
            rows={[
              { token: "from:", em: "npub1…", what: "Only what that person wrote." },
              { token: "to:", em: "npub1…", what: "Only events that mention them." },
              {
                token: "to:", em: "note1…",
                what: (
                  <>Only events that cite that event — its replies, its reactions, the labels written on it. An{" "}
                    <code className="font-mono text-[12px]">naddr1…</code> asks the same about an article, an app or a list.</>
                ),
              },
            ]}
          />

          <Section
            title="Days"
            intro="Whole days, in your own timezone, and a calendar opens as you type one."
            rows={[
              { token: "since:", em: "2026-08-06", what: "Written that day or after." },
              { token: "until:", em: "2026-08-06", what: "Written that day or before — the whole of it, midnight to midnight." },
            ]}
          />

          <Section
            title="Topics, labels and groups"
            rows={[
              { token: "#", em: "hashtag", what: "Events tagged with that topic, plus the labels and the comments written on it." },
              {
                token: "label:", em: "review/app",
                what: (
                  <>The NIP-32 labels carrying that mark — the labels themselves, not what they name. Add a{" "}
                    <code className="font-mono text-[12px]">to:</code> to read the ones written on one thing.</>
                ),
              },
              { token: "group:", em: "id", what: "A NIP-29 relay group. Type a few letters and pick one; the ids are not memorable." },
            ]}
          />

          <Section
            title="Things people commented on"
            intro="Comments about something that lives outside Nostr, found by what it is (NIP-73)."
            rows={[
              { token: "site:", em: "example.com/page", what: "A web page." },
              { token: "isbn:", em: "9780593330005", what: "A book." },
              { token: "doi:", em: "10.1000/182", what: "A paper." },
              { token: "geo:", em: "u4pruyd", what: "A place, as a geohash." },
              { token: "isan:", em: "0000-0000-401A-0000-7", what: "A film." },
              { token: "podcast:guid:", em: "guid", what: "A podcast feed…" },
              { token: "podcast:item:guid:", em: "guid", what: "…one episode of it…" },
              { token: "podcast:publisher:", em: "guid", what: "…or everything from its publisher." },
            ]}
          />

          <Section
            title="Ranking and order"
            intro={<>These reach the relay as typed. The <b>Filters</b> button writes every one of them.</>}
            rows={[
              { token: "sort:recent", what: "Newest first, ignoring how well anything matched." },
              {
                token: "sort:rank",
                what: <>Most trusted authors first. <code className="font-mono text-[12px]">sort:rank:asc</code> turns it upside down.</>,
              },
              { token: "sort:followers", what: "Most followed authors first." },
              { token: "sort:text", what: "Text match alone, trust not consulted. With none of these you get the default: best match." },
              {
                token: "observer:", em: "npub1…",
                what: (
                  <>Rank through <b>that</b> pubkey's web of trust instead of your own. Signing in does this for you, and
                    “Ranking as” under Filters writes it. Trust scores are public, so it needs no signature: signed out,
                    this is the one way to a ranked answer.</>
                ),
              },
              {
                token: "include:spam",
                what: (
                  <>Lift the trust floor: also show what your web of trust does not rank. It is also how a search with no
                    lens at all asks for the whole corpus — this relay answers a read that names neither with
                    <code className="font-mono text-[12px]"> auth-required:</code> rather than quietly handing over an
                    unranked index.</>
                ),
              },
              { token: "filter:rank:gte:", em: "50", what: "Raise it instead — drop authors ranking below that, 0 to 100." },
            ]}
          />

          <Section
            title="Only on this page"
            intro="The relay has no hops and no verification of its own, so these two are applied here, to what came back."
            rows={[
              { token: "trust:verified", what: "Only authors this page can verify." },
              { token: "reach:follows", what: <>Only people you follow. <code className="font-mono text-[12px]">reach:friends</code> widens it to friends of friends.</> },
            ]}
          />

          <p className="rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            Everything above combines, in any order:{" "}
            <Tok token="#nostr from:" em="npub1…" tail=" since:2026-01-01 sort:recent" />. The prefixes are filters, not
            words — they are lifted out of the query before the text is matched. The rest is{" "}
            <a href="https://github.com/nostr-protocol/nips/blob/master/50.md" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-link hover:underline">
              NIP-50
            </a>
            , as this relay extends it.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `?` opens the sheet — the shortcut every search surface carries. Ignored while somebody is
 * typing, since `?` is a character before it is a shortcut.
 */
export function useSyntaxSheetShortcut(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // `closest`, not `isContentEditable`: the key may land on a pill INSIDE the search box,
      // and jsdom does not compute `isContentEditable` at all.
      if (t && (t.isContentEditable || t.closest?.('[contenteditable="true"]') || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      onOpen();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
