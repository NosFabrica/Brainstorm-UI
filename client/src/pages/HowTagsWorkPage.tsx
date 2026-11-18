import { Link } from "wouter";
import { Globe, MessageSquareOff, Search, Tag, Users, type LucideIcon } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { ExplainerVideo } from "@/components/ExplainerVideo";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { TAGS_EXPLAINER } from "@/config/explainers";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";

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
 * The page follows the explainer video (config/explainers) chapter by chapter,
 * under the video's own headlines, so the two tell one story. The video's
 * "Bots don't [count]" is a stronger claim than point 2 allows on its own; it
 * is only here because "a rough guide, not the last word" sits in the same
 * section. HowTagsWorkPage.test pins the order and the three admissions.
 *
 * House style, learned the hard way: no em-dash-per-sentence cadence, no
 * "it's not X, it's Y", and no explaining Nostr. A reader here wants to know
 * what happens when someone labels them, not what protocol it rides on.
 */
export default function HowTagsWorkPage() {
  return (
    <InfoPageLayout testId="page-how-tags-work">
      <div className={cn(pageWidth("standard"), "py-10 sm:py-16")}>
        <div className="animate-fade-up space-y-12">
          <PageHeader
            size="hero"
            kicker="Tags"
            title={
              <>
                Word of mouth, <span className="text-brand-link">for the whole internet</span>.
              </>
            }
            subtitle="How did you find your favourite coffee place? Someone you know told you. Tags bring that to the internet: short labels like Coffee, Musician or Photographer that people put on each other."
            testId="section-htw-header"
          />

          {/* ── The video, for anyone who'd rather watch than read ────── */}
          <ExplainerVideo video={TAGS_EXPLAINER} id="watch" />

          {/* ── What a tag is (video: 02) ─────────────────────────────── */}
          <Card className="p-6 sm:p-8" data-testid="section-htw-simple">
            <p className="max-w-3xl text-lg leading-relaxed text-slate-700 dark:text-slate-200">
              A tag is a friend saying{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">“he makes the best coffee”</span>,
              written down.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-slate-700 dark:text-slate-200">
              Anyone can add one, to a person or a post. Everyone can see it, and see who said it.
            </p>
          </Card>

          {/* ── Who counts (video: 03), and what the number means ─────── */}
          <Section icon={Users} title="People you know count. Bots don't." testId="section-htw-counts">
            <p>
              A tag showing{" "}
              <Chip tone="brand" size="sm">
                Coffee 3
              </Chip>{" "}
              means three <em>other</em> people said it. With no number, one person did.
            </p>
            <p>
              A thousand fake accounts can say anything, so not every voice counts the same. Brainstorm adds tags up
              from where you stand, and people with a track record count for more. Two people can see slightly different
              numbers on the same tag, and that's normal.
            </p>
            <p>
              Read the number as a rough guide, not the last word. If we can't work it out, the page says so instead of
              guessing.
            </p>
            <p>
              People can tag themselves too. We show that in grey and label it, because "I'm a musician" is a different
              claim from three other people saying it.
            </p>
          </Section>

          {/* ── Disagree, don't delete (video: 04) ────────────────────── */}
          <Section
            icon={MessageSquareOff}
            title="Nobody can erase a tag. Anyone can disagree."
            tone="warn"
            testId="section-htw-no-delete"
          >
            <p>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Know this before you tag anyone.</span>{" "}
              There is no delete button. Not for you, not for the person you tagged, not for us. Once a tag is out
              there, it stays.
            </p>
            <p>
              What anyone can do is <span className="font-semibold text-slate-900 dark:text-slate-100">disagree</span>,
              in public, with their name on it. Once more people disagree than agree, the tag stops counting.
            </p>
            <p>
              A tag that has stopped counting drops off the main list, but it isn't hidden: a link on the tag's page
              brings it back into view. You can't judge a disagreement you aren't allowed to see.
            </p>
          </Section>

          {/* ── Take it anywhere (video: 05) ──────────────────────────── */}
          <Section icon={Globe} title="Your reputation goes where you go." testId="section-htw-where">
            <p>
              Tags aren't kept in a Brainstorm database. They sit on open servers that any app can read, so what people
              say about you isn't locked inside one company. Another app may add the same tags up a little differently.
            </p>
            <p>
              You can choose which servers we read tags from, and send yours to, in{" "}
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

          {/* ── The browse list is shorter than the real one ──────────── */}
          <Section icon={Search} title="Not in the list? Search for it." testId="section-htw-discovery">
            <p>
              Making a tag is free, so anyone can make thousands, and plenty have. To keep the junk out, the browse list
              only shows tags made by people with a track record.
            </p>
            <p>
              That rule catches some real newcomers too, so it applies to the list and nothing else.{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">Search finds every tag.</span> A tag
              left off the list still opens from a link, still shows on the profiles and posts it's on, and can still be
              put on someone. It joins the list once the person who made it has a track record.
            </p>
          </Section>

          {/* ── Try it (video: 06 and 08) ─────────────────────────────── */}
          <Section icon={Tag} title="Your turn." testId="section-htw-try">
            <p>
              Open someone's profile, choose{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">Add a tag</span>, and say what they're
              known for. If the tag is already there, add your name to it.
            </p>
            <p>To find people, search a word like "musician" or "podcast" and see who is known for it.</p>
            <p>One rule. There are no take-backs, so say it the way you'd say it in person.</p>
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
  const accent = tone === "warn" ? "border-amber-200/70 dark:border-amber-500/25" : "border-border";
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
      <div
        className={`max-w-3xl space-y-3 border-l-2 ${accent} pl-5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300`}
      >
        {children}
      </div>
    </section>
  );
}
