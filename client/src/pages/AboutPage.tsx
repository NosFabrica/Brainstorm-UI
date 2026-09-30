import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ArrowRight, ExternalLink, Play, Pause, Store, ShieldCheck, Globe, Lock } from "lucide-react";
import { CommunitiesIcon, MusicLibraryIcon } from "@/components/brainstormAppIcons";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { tone as getTone, type NamedTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { BrainLogo } from "@/components/BrainLogo";
import heroVideo from "@assets/generated_videos/about_hero_real_connection.mp4";
import heroPoster from "@assets/generated_images/about_hero_poster.webp";
import heroVideoTrust from "@assets/generated_videos/about_hero_trust_built_in.mp4";
import heroPosterTrust from "@assets/generated_images/about_hero_trust_built_in_poster.png";
import heroVideoMore from "@assets/generated_videos/about_hero_more_than_search.mp4";
import heroPosterMore from "@assets/generated_images/about_hero_more_than_search_poster.png";
import imgTrust from "@assets/generated_images/about_trust_signal.webp";
import imgEveryone from "@assets/generated_images/about_for_everyone.webp";
import imgYours from "@assets/generated_images/about_yours_identity.webp";

const HERO_SLIDES = [
  {
    title: "Who's actually real?",
    sub: "The internet is filling up with bots and AI. Brainstorm is search that finds the actual humans.",
    video: heroVideo,
    poster: heroPoster,
  },
  {
    title: "Trust, built in",
    sub: "It taps the instincts of people you trust, so the good stuff rises and the junk sinks.",
    video: heroVideoTrust,
    poster: heroPosterTrust,
  },
  {
    title: "More than search",
    sub: "It starts with finding real people. Vendors, communities, and music are coming next.",
    video: heroVideoMore,
    poster: heroPosterMore,
  },
];

const SLIDE_MS = 5500;

export default function AboutPage() {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const reduced = usePrefersReducedMotion();
  // Seeded from the OS setting but user-overridable via the play/pause button;
  // flipping the OS setting takes back over.
  const [playing, setPlaying] = useState(() => !reduced);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    setPlaying(!reduced);
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % HERO_SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const prevSlideRef = useRef(slide);
  useEffect(() => {
    const prev = prevSlideRef.current;
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === slide) {
        if (playing) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      } else {
        v.pause();
        // Don't rewind the outgoing slide yet — let it finish fading out so
        // the crossfade stays smooth. Other inactive slides reset immediately.
        if (i !== prev) {
          try {
            v.currentTime = 0;
          } catch {
            /* ignore */
          }
        }
      }
    });

    // After the crossfade completes, rewind the outgoing slide too, unless we've
    // navigated back to it in the meantime.
    let timeout: number | undefined;
    if (prev !== slide) {
      const outgoing = videoRefs.current[prev];
      timeout = window.setTimeout(() => {
        if (outgoing && prevSlideRef.current !== prev) {
          try {
            outgoing.currentTime = 0;
          } catch {
            /* ignore */
          }
        }
      }, 700);
    }
    prevSlideRef.current = slide;
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [slide, playing]);

  const togglePlaying = useCallback(() => setPlaying((p) => !p), []);

  const active = HERO_SLIDES[slide];

  return (
    <InfoPageLayout testId="page-about">
      {/* ============ HERO ============ */}
      <section
        className="relative mx-auto w-full max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pt-14"
        data-testid="section-about-hero"
      >
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-12">
          {/* Left: copy — `contents` on mobile lets each piece reorder around the video */}
          <div className="contents animate-fade-up lg:order-1 lg:block lg:space-y-6">
            <div className="order-1 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-accent">
                About Brainstorm
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>

            <div className="order-2 min-h-[150px] sm:min-h-[190px]" key={slide} aria-live="polite">
              <h1
                className="font-brand animate-fade-up text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl"
                data-testid="text-about-title"
              >
                <span className="block pb-1 text-brand-deep dark:text-slate-100">{active.title}</span>
              </h1>
              <p
                className="mt-4 max-w-xl animate-fade-up text-base font-medium leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg"
                data-testid="text-about-subtitle"
              >
                {active.sub}
              </p>
            </div>

            <div className="order-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgb(var(--brand-primary)/0.25)] transition-colors hover:bg-brand-primary active:scale-[0.98]"
                data-testid="button-hero-search"
              >
                <Search className="h-4 w-4" />
                Try Brainstorm
              </button>
              <button
                onClick={() => navigate("/how-search-works")}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-accent/40 hover:text-brand-primary active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200"
                data-testid="button-hero-learn"
              >
                How it works
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Slide indicators */}
            <div className="order-5 flex items-center gap-2 pt-1" data-testid="hero-indicators">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => setSlide(i)}
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === slide}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === slide
                      ? "w-7 bg-brand-primary"
                      : "w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600"
                  }`}
                  data-testid={`hero-dot-${i}`}
                />
              ))}
            </div>
          </div>

          {/* Right: cinematic video — mobile order: between the slides copy and the CTAs */}
          <div className="order-3 animate-fade-up lg:order-2">
            <div className="group relative aspect-[16/10] overflow-hidden rounded-3xl bg-slate-950 shadow-[0_24px_70px_-20px_rgb(var(--brand-deep)/0.45)] ring-1 ring-white/10">
              {HERO_SLIDES.map((s, i) => (
                <video
                  key={s.title}
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
                    i === slide ? "opacity-100" : "opacity-0"
                  }`}
                  src={s.video}
                  poster={s.poster}
                  muted
                  loop
                  playsInline
                  preload={i === slide ? "auto" : "metadata"}
                  aria-hidden={i !== slide}
                  data-testid={i === slide ? "video-hero" : undefined}
                />
              ))}
              {/* gentle vignette + brand wash */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-deep/30 via-transparent to-transparent" />
              <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />

              <button
                onClick={togglePlaying}
                aria-label={playing ? "Pause hero animation" : "Play hero animation"}
                aria-pressed={playing}
                className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/65 focus-visible:opacity-100 group-hover:opacity-100"
                data-testid="button-hero-playpause"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MISSION ============ */}
      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          data-testid="card-about-mission"
        >
          <div className="space-y-4 p-6 sm:p-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10">
                <BrainLogo size={20} className="text-brand-deep" />
              </div>
              <h2
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Why Brainstorm
              </h2>
            </div>
            <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
              The web used to be people. Now it's people, bots, and AI all talking at once, and it's getting harder to
              tell who's who.
            </p>
            <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
              Brainstorm is search built for that world. Instead of guessing, it reads who real people actually trust.
              The accounts that matter rise, and the noise quietly fades.
            </p>
          </div>
        </div>
      </section>

      {/* ============ BRAINSTORM FAMILY ============ */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12" data-testid="section-about-family">
        <div className="mb-8 max-w-2xl">
          <h2
            className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Brainstorm family
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">
            One simple idea powers it all: real human trust. We're starting with search, with more on the way.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search — live */}
          <button
            onClick={() => navigate("/")}
            className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-accent/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-6"
            data-testid="card-family-search"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary shadow-[0_4px_14px_rgb(var(--brand-primary)/0.3)]">
                <Search className="h-5 w-5 text-white" />
              </div>
              <Chip tone="emerald" dot size="sm" className="font-bold uppercase tracking-wide">
                Live
              </Chip>
            </div>
            <h3
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Brainstorm Search
            </h3>
            <p className="flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Find real people across millions of profiles. Search by name, bio, or handle.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary transition-all group-hover:gap-2">
              Open search <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          {/* Vendors */}
          <ComingSoonCard
            icon={Store}
            tone="sky"
            title="Brainstorm Vendors"
            desc="Find sellers and services worth your money, vouched for by people you trust."
            testId="card-family-vendors"
          />
          {/* Communities */}
          <ComingSoonCard
            icon={CommunitiesIcon}
            tone="violet"
            title="Brainstorm Communities"
            desc="Hang out in spaces full of people actually worth your time."
            testId="card-family-communities"
          />
          {/* Music */}
          <ComingSoonCard
            icon={MusicLibraryIcon}
            tone="fuchsia"
            title="Brainstorm Music"
            desc="Tunes worth a listen, picked by ears you trust instead of the charts."
            testId="card-family-music"
          />
        </div>
      </section>

      {/* ============ THEMATIC BANDS ============ */}
      <section
        className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6 sm:py-12"
        data-testid="section-about-themes"
      >
        <ThemeBand
          icon={<ShieldCheck className="h-5 w-5 text-brand-deep" />}
          kicker="Trust over noise"
          title="The loudest voice doesn't win"
          desc="Bots can shout all day. Brainstorm only listens to real human signals, so one trusted friend still beats a thousand spammers."
          ctaLabel="See how search works"
          onClick={() => navigate("/how-search-works")}
          image={imgTrust}
          imageAlt="A single person standing clearly amid fading digital noise"
          testId="band-trust"
        />
        <ThemeBand
          icon={<Globe className="h-5 w-5 text-brand-deep" />}
          kicker="For everyone"
          title="Jump in, no setup"
          desc="Just start searching. No account, no fuss. Sign in whenever you want results tuned to your own circle."
          ctaLabel="What is a web of trust?"
          onClick={() => navigate("/what-is-wot")}
          image={imgEveryone}
          imageAlt="People walking toward a bright open doorway of light"
          reverse
          testId="band-everyone"
        />
        <ThemeBand
          icon={<Lock className="h-5 w-5 text-brand-deep" />}
          kicker="Yours by design"
          title="Your account goes where you go"
          desc="Your profile and reputation belong to you, and follow you everywhere. No lock-in, nothing to manage. It just works."
          ctaLabel="How personalization works"
          onClick={() => navigate("/personalization")}
          image={imgYours}
          imageAlt="A person holding a glowing orb representing their personal identity"
          testId="band-freedom"
        />
      </section>

      {/* ============ PARENT ATTRIBUTION ============ */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6 sm:pb-16">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row"
          data-testid="about-parent-attribution"
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Brainstorm is a{" "}
            <a
              href="https://nosfabrica.com/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-0.5 font-semibold text-slate-700 transition-colors hover:text-brand-primary hover:underline dark:text-slate-200"
              data-testid="link-about-nosfabrica"
            >
              NosFabrica
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            company, on a mission to make online trust real again.
          </p>
        </div>
      </section>
    </InfoPageLayout>
  );
}

function ComingSoonCard({
  icon: Icon,
  tone,
  title,
  desc,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: NamedTone;
  title: string;
  desc: string;
  testId: string;
}) {
  const c = getTone(tone);
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", c.bg, c.border)}>
          <Icon className={cn("h-5 w-5", c.icon)} />
        </div>
        <Chip tone="slate" size="sm" className="font-bold uppercase tracking-wide">
          Coming soon
        </Chip>
      </div>
      <h3
        className="text-lg font-bold text-slate-800 dark:text-slate-200"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{desc}</p>
    </Card>
  );
}

function ThemeBand({
  icon,
  kicker,
  title,
  desc,
  ctaLabel,
  onClick,
  image,
  imageAlt,
  reverse = false,
  testId,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  desc: string;
  ctaLabel: string;
  onClick: () => void;
  image: string;
  imageAlt: string;
  reverse?: boolean;
  testId: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
      data-testid={testId}
    >
      <div className="grid md:grid-cols-2 md:items-stretch">
        {/* Image */}
        <div
          className={`relative min-h-[200px] bg-slate-950 sm:min-h-[260px] md:min-h-[300px] ${
            reverse ? "md:order-2" : "md:order-1"
          }`}
        >
          <img
            src={image}
            alt={imageAlt}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            data-testid={`${testId}-image`}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-deep/30 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
        </div>

        {/* Copy */}
        <div className={`flex flex-col justify-center p-6 sm:p-10 ${reverse ? "md:order-1" : "md:order-2"}`}>
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10">
              {icon}
            </div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-accent">{kicker}</p>
          </div>
          <h3
            className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">{desc}</p>
          <button
            onClick={onClick}
            className="group mt-5 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand-primary transition-colors hover:text-brand-primary dark:text-brand-link dark:hover:text-brand-link"
            data-testid={`${testId}-cta`}
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
