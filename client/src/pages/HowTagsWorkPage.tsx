import { Link } from "wouter";
import {
  Eye,
  Globe,
  MessageSquareOff,
  Search,
  ThumbsDown,
  Users,
  type LucideIcon,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

/**
 * `/how-tags-work` — the user-facing explainer for tagging.
 *
 * Written to the project's copy rule: no tech talk, nothing a normal person
 * would need a glossary for. No "assertion", "polarity", "relay event kind",
 * "web of trust score", "npub". The reference client's guide is good but speaks
 * in kind numbers and a-coordinates; this one doesn't.
 *
 * It is also where we say the things the product would otherwise only admit in
 * code comments:
 *
 *  1. Nothing can be deleted, ever. You can disagree; the original stays.
 *  2. Counts are a rough guide, not a verdict. This started as a confessional
 *     amber panel about our filter being weak. That was oversharing — an
 *     anxious paragraph about our internals that a normal reader can do
 *     nothing with. It is now one sentence, and the claim ABOVE it was weakened
 *     to match reality so the confession isn't needed. Don't reintroduce a
 *     strong filtering claim without reintroducing the caveat.
 *  3. Some real tags are left off the browse LIST because their creator has no
 *     track record yet, and search still finds them. If the list/query split is
 *     ever reverted, "Search finds every tag" becomes a lie and this section
 *     must change with it the same day.
 *
 * If any of those stop being true, this page must change the same day.
 *
 * House style, learned the hard way: no em-dash-per-sentence cadence, no
 * "it's not X, it's Y", and no explaining Nostr. A reader here wants to know
 * what happens when someone labels them, not what protocol it rides on.
 */
export default function HowTagsWorkPage() {
  return (
    <InfoPageLayout testId="page-how-tags-work">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fade-up space-y-12">
          <PageHeader
            size="hero"
            kicker="Tags"
            title={<>What people say <span className="text-brand-link">about each other</span>.</>}
            subtitle="A tag is a short label like Musician, Photographer or Vendor that someone puts on a person or a post. Anyone can add one, and nobody is in charge of the list."
            testId="section-htw-header"
          />

          {/* ── The one-paragraph version ─────────────────────────────── */}
          <Card className="p-6 sm:p-8" data-testid="section-htw-simple">
            <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-200">
              Think of a tag like a friend saying{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "oh, she's a great photographer"
              </span>
              . It's their opinion, said out loud, with their name on it. Other
              people can agree, disagree, or say nothing. What you see is
              everyone's opinions added up.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-slate-700 dark:text-slate-200">
              The difference is that here it's written down in public, and it
              stays there.
            </p>
          </Card>

          {/* ── The number on a tag ───────────────────────────────────── */}
          <Section
            icon={Users}
            title="The number is how many people said it"
            testId="section-htw-counts"
          >
            <p>
              A tag showing <Chip tone="brand" size="sm">Musician 3</Chip> means
              three <em>other</em> people said it. If there's no number, one
              person did.
            </p>
            <p>
              People can also tag themselves. When someone has only said it
              about their own profile we show it in grey and label it, because
              "I'm a musician" and "three other people say she's a musician"
              are different claims and it wouldn't be fair to show them the
              same way.
            </p>
          </Section>

          {/* ── The hard one ──────────────────────────────────────────── */}
          <Section
            icon={MessageSquareOff}
            title="You can disagree. You can't delete."
            tone="warn"
            testId="section-htw-no-delete"
          >
            <p>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                This is the part worth understanding before you tag anyone.
              </span>{" "}
              When someone puts a tag on you, there is no button that takes it
              away. Not for you, not for us, not for anyone. Once something is
              published it stays published.
            </p>
            <p>
              What you <em>can</em> do is disagree. Your disagreement is public
              and has your name on it too, and it counts against the tag. Once
              more people disagree than agree, the tag stops counting. The
              original is still out there either way; it just stops adding up
              to anything.
            </p>
            <p>
              So we never say "remove". We say{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">disagree</span>.
              Promising to delete something would be a lie.
            </p>
          </Section>

          {/* ── POV, honestly ─────────────────────────────────────────── */}
          <Section
            icon={Eye}
            title="Numbers are a guide, not a verdict"
            testId="section-htw-pov"
          >
            <p>
              Anyone can tag anyone, so if every opinion counted equally tags
              would be easy to fake. We lean on how much standing someone has
              built up in the network, worked out from your point of view. Two
              people can see slightly different numbers on the same tag, and
              that's normal. There's no single official answer.
            </p>
            <p>
              All of that standing is still being built up, so read the numbers
              as a rough guide rather than the last word. If we can't work it
              out at all, we say so on the page instead of guessing.
            </p>
          </Section>

          {/* ── Discovery gate ────────────────────────────────────────── */}
          <Section
            icon={Search}
            title="The browse list is shorter than the real list"
            testId="section-htw-discovery"
          >
            <p>
              Making a tag is free, so anyone can make thousands, and plenty
              have. The list only shows tags whose creator has built up some
              standing. Without that rule it would be mostly junk.
            </p>
            <p>
              It's a blunt rule and it catches real people too. Someone new
              looks the same as someone throwaway. So it applies to the{" "}
              <em>list</em> and nothing else.{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Search finds every tag, including those.
              </span>{" "}
              If you know the name, type it anywhere you can search and you'll
              get it, marked "Unknown creator" so you know what we can and
              can't tell you.
            </p>
            <p>Tags left off the list still work in every other way:</p>
            <ul className="ml-1 space-y-1.5">
              <Bullet>a direct link to one still opens</Bullet>
              <Bullet>it still shows on the profiles and posts it's been put on</Bullet>
              <Bullet>you can still put it on someone</Bullet>
              <Bullet>your own tags are always visible to you</Bullet>
            </ul>
            <p>
              Nothing needs redoing either. Once the creator earns some
              standing, their tags start showing in the list again.
            </p>
          </Section>

          {/* ── Disputed ──────────────────────────────────────────────── */}
          <Section
            icon={ThumbsDown}
            title="Disagreed-with doesn't mean disappeared"
            testId="section-htw-disputed"
          >
            <p>
              When more people disagree than agree, that person drops off the
              tag's main list. You'll still see a{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "Show disputed"
              </span>{" "}
              link that brings them back into view.
            </p>
            <p>
              Hiding it altogether would make the page look tidier than things
              really are, and you can't judge a disagreement you aren't allowed
              to see.
            </p>
          </Section>

          {/* ── Where it lives ────────────────────────────────────────── */}
          <Section
            icon={Globe}
            title="You choose where tags come from"
            testId="section-htw-where"
          >
            <p>
              Tags aren't kept in a Brainstorm database. They sit on open
              servers that anyone can read, and we add up what's there. Other
              apps read the same tags and may add them up a little differently.
              That's normal, and it's the point.
            </p>
            <p>
              It also means you aren't locked in. You can pick which servers we
              read your tags from, and send yours to, in{" "}
              <Link
                href="/settings?tab=trust&focus=tag-relays"
                className="font-semibold text-brand-link hover:underline"
                data-testid="htw-tag-relays"
              >
                Where tags come from
              </Link>
              .
            </p>
          </Section>

          {/* ── Footer nav ────────────────────────────────────────────── */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-slate-200 pt-8 text-sm dark:border-slate-800">
            <Link href="/tags" className="font-semibold text-brand-link hover:underline" data-testid="htw-browse">
              Browse tags →
            </Link>
            <Link href="/tags/mine" className="font-semibold text-brand-link hover:underline" data-testid="htw-mine">
              Your tags →
            </Link>
            <Link href="/what-is-wot" className="font-semibold text-brand-link hover:underline" data-testid="htw-wot">
              What is a Web of Trust? →
            </Link>
          </div>
        </div>
      </div>
    </InfoPageLayout>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  tone = "normal",
  testId,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  /** `warn` marks the section people most need to read before acting. */
  tone?: "normal" | "warn";
  testId: string;
}) {
  const accent =
    tone === "warn"
      ? "border-amber-200/70 dark:border-amber-500/25"
      : "border-border";
  const iconWrap =
    tone === "warn"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
      : "bg-brand-accent/10 text-brand-deep dark:text-brand-link";

  return (
    <section data-testid={testId}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <h2
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
      </div>
      <div className={`space-y-3 border-l-2 ${accent} pl-5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300`}>
        {children}
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-brand-accent" />
      <span>{children}</span>
    </li>
  );
}
