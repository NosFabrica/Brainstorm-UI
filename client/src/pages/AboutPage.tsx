import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Search,
  ArrowRight,
  ExternalLink,
  Play,
  Pause,
  Users,
  Music,
  Store,
  ShieldCheck,
  Globe,
  Lock,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import heroVideo from "@assets/generated_videos/about_hero_real_connection.mp4";
import heroPoster from "@assets/generated_images/about_hero_poster.png";
import imgTrust from "@assets/generated_images/about_trust_signal.png";
import imgEveryone from "@assets/generated_images/about_for_everyone.png";
import imgYours from "@assets/generated_images/about_yours_identity.png";

const HERO_SLIDES = [
  {
    title: "Who's actually real?",
    sub: "The internet is filling up with bots and AI. Brainstorm is search that finds the actual humans.",
  },
  {
    title: "Trust, built in",
    sub: "It taps the instincts of people you trust, so the good stuff rises and the junk sinks.",
  },
  {
    title: "More than search",
    sub: "It starts with finding real people. Vendors, communities, and music are coming next.",
  },
];

const SLIDE_MS = 5500;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function AboutPage() {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setPlaying(!mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % HERO_SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing]);

  const togglePlaying = useCallback(() => setPlaying((p) => !p), []);

  const active = HERO_SLIDES[slide];

  return (
    <InfoPageLayout testId="page-about">
      {/* ============ HERO ============ */}
      <section
        className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-6"
        data-testid="section-about-hero"
      >
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: copy */}
          <div className="space-y-6 animate-fade-up order-2 lg:order-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                About Brainstorm
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>

            <div className="min-h-[150px] sm:min-h-[190px]" key={slide} aria-live="polite">
              <h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight animate-fade-up"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-about-title"
              >
                <span className="text-[#333286] block pb-1">
                  {active.title}
                </span>
              </h1>
              <p
                className="mt-4 text-base sm:text-lg text-slate-600 font-medium max-w-xl leading-relaxed animate-fade-up"
                data-testid="text-about-subtitle"
              >
                {active.sub}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/search")}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors active:scale-[0.98] shadow-[0_4px_14px_rgba(99,102,241,0.25)]"
                data-testid="button-hero-search"
              >
                <Search className="h-4 w-4" />
                Try Brainstorm
              </button>
              <button
                onClick={() => navigate("/how-search-works")}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white/80 border border-slate-200 hover:border-[#7c86ff]/40 hover:text-indigo-600 rounded-full transition-colors active:scale-[0.98]"
                data-testid="button-hero-learn"
              >
                How it works
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Slide indicators */}
            <div className="flex items-center gap-2 pt-1" data-testid="hero-indicators">
              {HERO_SLIDES.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => setSlide(i)}
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === slide}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === slide
                      ? "w-7 bg-indigo-600"
                      : "w-1.5 bg-slate-300 hover:bg-slate-400"
                  }`}
                  data-testid={`hero-dot-${i}`}
                />
              ))}
            </div>
          </div>

          {/* Right: cinematic video */}
          <div className="order-1 lg:order-2 animate-fade-up">
            <div className="group relative rounded-3xl overflow-hidden bg-slate-950 ring-1 ring-white/10 shadow-[0_24px_70px_-20px_rgba(51,50,134,0.45)] aspect-[16/10]">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                src={heroVideo}
                poster={heroPoster}
                autoPlay={playing}
                muted
                loop
                playsInline
                preload="metadata"
                data-testid="video-hero"
              />
              {/* gentle vignette + brand wash */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#333286]/30 via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/5 rounded-3xl pointer-events-none" />

              <button
                onClick={togglePlaying}
                aria-label={playing ? "Pause hero animation" : "Play hero animation"}
                aria-pressed={playing}
                className="absolute bottom-3 right-3 h-9 w-9 inline-flex items-center justify-center rounded-full bg-black/45 hover:bg-black/65 text-white backdrop-blur-sm border border-white/15 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200"
                data-testid="button-hero-playpause"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MISSION ============ */}
      <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div
          className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          data-testid="card-about-mission"
        >
          <div className="p-6 sm:p-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-[#333286]" />
              </div>
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Why Brainstorm
              </h2>
            </div>
            <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed max-w-3xl">
              The web used to be people. Now it's people, bots, and AI all talking at once, and it's
              getting harder to tell who's who.
            </p>
            <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed max-w-3xl">
              Brainstorm is search built for that world. Instead of guessing, it reads who real people
              actually trust. The accounts that matter rise, and the noise quietly fades.
            </p>
          </div>
        </div>
      </section>

      {/* ============ BRAINSTORM FAMILY ============ */}
      <section
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12"
        data-testid="section-about-family"
      >
        <div className="max-w-2xl mb-8">
          <h2
            className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Brainstorm family
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            One simple idea powers it all: real human trust. We're starting with search, with more on
            the way.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search — live */}
          <button
            onClick={() => navigate("/search")}
            className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-[#7c86ff]/50 hover:shadow-md transition-all p-5 sm:p-6 flex flex-col gap-3"
            data-testid="card-family-search"
          >
            <div className="flex items-center justify-between">
              <div className="h-11 w-11 rounded-xl bg-indigo-600 shadow-[0_4px_14px_rgba(99,102,241,0.3)] flex items-center justify-center">
                <Search className="h-5 w-5 text-white" />
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
                <span className="w-1 h-1 rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Brainstorm Search
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed flex-1">
              Find real people across millions of profiles. Search by name, bio, or handle.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 group-hover:gap-2 transition-all">
              Open search <ArrowRight className="h-4 w-4" />
            </span>
          </button>

          {/* Vendors */}
          <ComingSoonCard
            icon={<Store className="h-5 w-5 text-sky-600" />}
            tint="bg-sky-50"
            title="Brainstorm Vendors"
            desc="Find sellers and services worth your money, vouched for by people you trust."
            testId="card-family-vendors"
          />
          {/* Communities */}
          <ComingSoonCard
            icon={<Users className="h-5 w-5 text-violet-600" />}
            tint="bg-violet-50"
            title="Brainstorm Communities"
            desc="Hang out in spaces full of people actually worth your time."
            testId="card-family-communities"
          />
          {/* Music */}
          <ComingSoonCard
            icon={<Music className="h-5 w-5 text-fuchsia-600" />}
            tint="bg-fuchsia-50"
            title="Brainstorm Music"
            desc="Tunes worth a listen, picked by ears you trust instead of the charts."
            testId="card-family-music"
          />
        </div>
      </section>

      {/* ============ THEMATIC BANDS ============ */}
      <section
        className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4"
        data-testid="section-about-themes"
      >
        <ThemeBand
          icon={<ShieldCheck className="h-5 w-5 text-[#333286]" />}
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
          icon={<Globe className="h-5 w-5 text-[#333286]" />}
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
          icon={<Lock className="h-5 w-5 text-[#333286]" />}
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
      <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div
          className="rounded-2xl bg-white border border-slate-200 shadow-sm px-6 py-5 flex flex-col sm:flex-row items-center justify-center gap-2 text-center"
          data-testid="about-parent-attribution"
        >
          <p className="text-sm text-slate-500">
            Brainstorm is a{" "}
            <a
              href="https://nosfabrica.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:text-indigo-600 hover:underline transition-colors"
              data-testid="link-about-nosfabrica"
            >
              NosFabrica
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            company, building open infrastructure for trust on{" "}
            <a
              href="https://nostr.how/en/what-is-nostr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-slate-700 hover:text-indigo-600 hover:underline transition-colors"
              data-testid="link-about-nostr"
            >
              Nostr
              <ExternalLink className="h-3 w-3" />
            </a>
            .
          </p>
        </div>
      </section>
    </InfoPageLayout>
  );
}

function ComingSoonCard({
  icon,
  tint,
  title,
  desc,
  testId,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  desc: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col gap-3"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <div className={`h-11 w-11 rounded-xl ${tint} border border-slate-100 flex items-center justify-center`}>
          {icon}
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
          Coming soon
        </span>
      </div>
      <h3 className="text-lg font-bold text-slate-800" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h3>
      <p className="text-sm text-slate-500 leading-relaxed flex-1">{desc}</p>
    </div>
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
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      data-testid={testId}
    >
      <div className="grid md:grid-cols-2 md:items-stretch">
        {/* Image */}
        <div
          className={`relative min-h-[200px] sm:min-h-[260px] md:min-h-[300px] bg-slate-950 ${
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
          <div className="absolute inset-0 bg-gradient-to-tr from-[#333286]/30 via-transparent to-transparent pointer-events-none" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />
        </div>

        {/* Copy */}
        <div
          className={`p-6 sm:p-10 flex flex-col justify-center ${
            reverse ? "md:order-1" : "md:order-2"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-9 w-9 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">{kicker}</p>
          </div>
          <h3
            className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <p className="mt-3 text-[15px] sm:text-base text-slate-600 leading-relaxed">{desc}</p>
          <button
            onClick={onClick}
            className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors self-start"
            data-testid={`${testId}-cta`}
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
