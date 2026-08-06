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
 * More importantly it is where we say the things the product would otherwise
 * only admit in code comments:
 *
 *  1. Nothing can be deleted, ever. You can disagree; the original stays.
 *  2. The reputation filter is currently weak, so counts are more permissive
 *     than they look. (The reference client's banner claims filtering that its
 *     own guide later admits isn't really happening. We say it up front.)
 *  3. Some real tags are hidden from browsing because their creator has no
 *     track record yet — and what still works for them.
 *
 * If any of those three stop being true, this page must change the same day.
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
            subtitle="A tag is a short label — Musician, Verified Human, Bitcoin Vendor — that someone puts on a person or a post. Anyone can add one. Nobody is in charge of the list."
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
              The difference is that here it's written down permanently, in
              public, and it can't be unsaid.
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
              about their own profile, we show it in grey and label it — because
              "I'm a musician" and "three other people say she's a musician" are
              different claims, and it wouldn't be fair to show them the same
              way.
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
              When someone puts a tag on you, there is no button — for you, for
              us, or for anyone — that removes it. That's how Nostr works:
              what's published stays published.
            </p>
            <p>
              What you <em>can</em> do is disagree. Your disagreement is also
              public and signed by you, and it makes the tag stop counting. The
              original is still out there; it just no longer adds up to
              anything.
            </p>
            <p>
              So we never say "remove" — we say{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">disagree</span>.
              Promising deletion would be a lie.
            </p>
          </Section>

          {/* ── POV, honestly ─────────────────────────────────────────── */}
          <Section
            icon={Eye}
            title="Your view and someone else's may not match"
            testId="section-htw-pov"
          >
            <p>
              Anyone can tag anyone, so counting every opinion equally would
              make tags easy to fake. Instead we only count people with some
              standing in the network — and "standing" is judged from a
              particular point of view. There's no single official answer.
            </p>
            <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 text-sm dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
              <span className="font-semibold text-amber-800 dark:text-amber-400">
                Being straight with you:
              </span>{" "}
              that filtering is weaker than we'd like right now. The reputation
              data it relies on is still being built, so people we know nothing
              about are currently counted too. When we can't check at all, the
              page says so instead of pretending. Treat the numbers as a signal,
              not a verdict.
            </p>
          </Section>

          {/* ── Discovery gate ────────────────────────────────────────── */}
          <Section
            icon={Search}
            title="Why you won't find every tag by browsing"
            testId="section-htw-discovery"
          >
            <p>
              Making a tag is free, which means anyone can make thousands. To
              stop the browse list filling up with junk, it only shows tags
              whose creator has built up some standing.
            </p>
            <p>
              That's a blunt rule and it catches real people too — someone new
              looks exactly like someone throwaway. So it only affects{" "}
              <em>browsing</em>. A hidden tag still works everywhere else:
            </p>
            <ul className="ml-1 space-y-1.5">
              <Bullet>a direct link to it still opens</Bullet>
              <Bullet>it still shows on the profiles and posts it's been put on</Bullet>
              <Bullet>your own tags are always visible to you</Bullet>
            </ul>
            <p>
              And nothing needs redoing — when the creator earns some standing,
              their tags simply start appearing again.
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
              tag's main list — but you'll see a{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                "Show disputed"
              </span>{" "}
              link that brings them back into view.
            </p>
            <p>
              Hiding it completely would make the page look tidier than the
              network really is, and you can't judge a disagreement you're not
              allowed to see.
            </p>
          </Section>

          {/* ── Where it lives ────────────────────────────────────────── */}
          <Section
            icon={Globe}
            title="None of this is stored by us"
            testId="section-htw-where"
          >
            <p>
              Tags live on Nostr's open servers, not in a Brainstorm database.
              We just read them and add them up. Other apps read the same tags
              and may add them up slightly differently — that's normal, and it's
              the point.
            </p>
            <p>
              It also means you're not locked in. You can change which servers
              we read from in{" "}
              <Link href="/settings" className="font-semibold text-brand-link hover:underline">
                Settings
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
