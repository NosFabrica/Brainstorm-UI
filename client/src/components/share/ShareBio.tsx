import { useState } from "react";
import { useShareNav } from "@/components/share/ShareNavContext";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { searchByText } from "@/lib/profileSearch";

type ProfileLite = { name?: string; display_name?: string; picture?: string };

// Split on, in order: URLs, mail the author labelled as mail, real Nostr
// mentions (nostr:npub/nprofile), #hashtags, or a plain "@Name" org/person
// mention. The plain-@ branch requires a
// Title-cased name (so "@ SOUND HSA" matches but "jon@soundhsa.com" — where @ is
// preceded by a word char — and lowercase noise do not), capturing up to four
// capitalized words so multi-word org names resolve.
// An email address the author CALLS mail — "email:", "e-mail", "mail -",
// "contact", or written as mailto:. A bare name@domain is left as text: on
// Nostr it is more often a Fediverse handle (suedioh77@mas.to), a lightning
// address or a NIP-05 than an email (census of 600 profiles, 2026-09-05).
const EMAIL = "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+";
const LABELLED_EMAIL = `(?<=(?:[Ee]-?[Mm]ail|[Mm]ail|[Cc]ontact)\\s*[:=\\-–—]?\\s*)${EMAIL}`;
const TOKEN = new RegExp(
  `(https?:\\/\\/[^\\s<>"')\\]]+|mailto:${EMAIL}|${LABELLED_EMAIL}|nostr:(?:npub1|nprofile1)[a-z0-9]+|#[\\p{L}\\p{N}_]+|(?<![\\w@./])@ ?[A-Z][\\p{L}\\p{N}]*(?: [A-Z][\\p{L}\\p{N}&]*){0,3})`,
  "gu",
);
const IS_EMAIL = new RegExp(`^(?:mailto:)?${EMAIL}$`);

/**
 * A plain-text "@Name" bio mention (e.g. "Co-founder @ SOUND HSA"). There's no
 * npub in the data, so on click we resolve the name against Brainstorm's profile
 * search and open the top match's profile (gated by the nav-confirm dialog, which
 * shows who you're about to visit). Falls back silently if nothing resolves.
 */
function PlainMention({ name }: { name: string }) {
  const requestNav = useShareNav();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="bio-orgmention"
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          const { results } = await searchByText(name, "nosfabrica", undefined, 5);
          const top = results[0];
          if (top) requestNav({ kind: "profile", target: top.npub, label: top.displayName || top.name || `@${name}`, picture: top.picture });
        } catch { /* ignore — leave as plain text on failure */ }
        setBusy(false);
      }}
      className="font-medium text-brand-link hover:underline disabled:opacity-60"
    >
      @{name}
    </button>
  );
}

/**
 * Renders a profile bio with: bare URLs as links, real `nostr:` @mentions and
 * plain "@Name" mentions as clickable links to the person/org, and #hashtags as
 * clickable text into the hashtag-explore flow. Lives inside ShareNavProvider.
 */
export function ShareBio({ text, profiles }: { text: string; profiles?: Map<string, ProfileLite> }) {
  const requestNav = useShareNav();
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (!part) return null;
        if (IS_EMAIL.test(part)) {
          const address = part.replace(/^mailto:/, "");
          return (
            <a key={i} href={`mailto:${address}`} title="Send an email" className="break-words text-brand-primary hover:underline" data-testid="bio-email">
              {address}
            </a>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener" className="break-words text-brand-primary hover:underline">
              {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          );
        }
        if (/^nostr:(npub1|nprofile1)/i.test(part)) {
          const bech32 = part.replace(/^nostr:/i, "");
          const { pubkey } = decodeNostrEntity(bech32);
          const prof = pubkey ? profiles?.get(pubkey) : undefined;
          const name = prof?.display_name || prof?.name;
          const label = name ? `@${name}` : `@${bech32.slice(0, 10)}…`;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); requestNav({ kind: "profile", target: bech32, label: name || bech32.slice(0, 12) + "…", picture: prof?.picture }); }}
              className="font-medium text-brand-link hover:underline"
              data-testid="bio-mention"
            >
              {label}
            </button>
          );
        }
        if (/^#[\p{L}\p{N}_]+$/u.test(part)) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); requestNav({ kind: "hashtag", target: part, label: part }); }}
              className="font-medium text-brand-link hover:underline"
              data-testid="bio-hashtag"
            >
              {part}
            </button>
          );
        }
        if (/^@/.test(part)) {
          return <PlainMention key={i} name={part.replace(/^@\s?/, "").trim()} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
