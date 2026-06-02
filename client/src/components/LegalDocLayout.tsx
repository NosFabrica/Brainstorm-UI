import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, FileText, ShieldCheck, HelpCircle, List, ChevronDown, Link2 } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export type Block =
  | { type: "p"; text: string }
  | { type: "address"; lines: string[] };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

type DocKind = "privacy" | "terms";

interface LegalDocLayoutProps {
  testId: string;
  docKind: DocKind;
  eyebrow: string;
  title: string;
  lastRevised: string;
  preamble: string[];
  sections: Section[];
  contactEmail: string;
  contactSubject: string;
}

function splitTitle(title: string): { num: string | null; rest: string } {
  const m = title.match(/^(\d+\.)([\s\S]*)$/);
  if (!m) return { num: null, rest: title };
  return { num: m[1], rest: m[2] };
}

export function LegalDocLayout({
  testId,
  docKind,
  eyebrow,
  title,
  lastRevised,
  preamble,
  sections,
  contactEmail,
  contactSubject,
}: LegalDocLayoutProps) {
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [showTop, setShowTop] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);

  const contactHref = useMemo(
    () => `mailto:${contactEmail}?subject=${encodeURIComponent(contactSubject)}`,
    [contactEmail, contactSubject],
  );

  function renderText(text: string): Array<string | JSX.Element> | string {
    const parts = text.split(contactEmail);
    if (parts.length === 1) return text;
    const nodes: Array<string | JSX.Element> = [];
    parts.forEach((part, i) => {
      if (i > 0) {
        nodes.push(
          <a
            key={`email-${i}`}
            href={contactHref}
            className="font-medium text-indigo-600 hover:text-indigo-700 underline underline-offset-2 break-words"
            data-testid={`link-contact-email-${i}`}
          >
            {contactEmail}
          </a>,
        );
      }
      if (part) nodes.push(part);
    });
    return nodes;
  }

  useEffect(() => {
    document.title = `${title} | Brainstorm`;
  }, [title]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        requestAnimationFrame(() =>
          el.scrollIntoView({ behavior: "auto", block: "start" }),
        );
      }
    }
  }, []);

  const goToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
      setActiveId(id);
    }
    setMobileTocOpen(false);
  };

  const OtherDocIcon = docKind === "privacy" ? FileText : ShieldCheck;
  const otherDocLabel = docKind === "privacy" ? "Terms of Use" : "Privacy Notice";
  const otherDocPath = docKind === "privacy" ? "/terms" : "/privacy";

  const tocList = (
    <nav className="space-y-0.5" aria-label="Table of contents">
      {sections.map((section) => {
        const { num, rest } = splitTitle(section.title);
        const isActive = activeId === section.id;
        return (
          <button
            key={section.id}
            onClick={() => goToSection(section.id)}
            className={`group flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-200 ${
              isActive
                ? "bg-[#7c86ff]/12 text-[#333286]"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
            data-testid={`toc-link-${docKind}-${section.id}`}
          >
            <span
              className={`mt-0.5 shrink-0 font-mono text-[10px] font-bold tabular-nums transition-colors ${
                isActive ? "text-[#7c86ff]" : "text-slate-400 group-hover:text-[#7c86ff]"
              }`}
            >
              {num ? num.replace(".", "") : "•"}
            </span>
            <span className="text-[11.5px] font-medium leading-snug line-clamp-2">
              {rest.trim()}
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <InfoPageLayout testId={testId}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-8 animate-fade-up" data-testid={`header-${docKind}`}>
          <div
            className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#7c86ff]/12 bg-white/70 px-2.5 py-0.5 shadow-sm backdrop-blur-sm"
            data-testid={`badge-${docKind}`}
          >
            <div className="h-1 w-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#333286]">
              {eyebrow}
            </p>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid={`text-${docKind}-title`}
          >
            <span className="block bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] bg-clip-text pb-1 text-transparent drop-shadow-sm animate-gradient-x">
              {title}
            </span>
          </h1>
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-500 backdrop-blur-sm"
            data-testid={`text-${docKind}-revised`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {lastRevised}
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[248px_1fr] lg:gap-8">
          {/* Desktop TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="rounded-2xl border border-[#7c86ff]/15 bg-white/70 p-3 shadow-[0_0_15px_rgba(124,134,255,0.06)] backdrop-blur-xl">
                <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                  <List className="h-3.5 w-3.5 text-[#7c86ff]" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    On this page
                  </p>
                </div>
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
                  {tocList}
                </div>
              </div>
            </div>
          </aside>

          <article ref={articleRef} className="min-w-0 animate-fade-up">
            {/* Mobile TOC */}
            <div className="mb-5 lg:hidden">
              <button
                onClick={() => setMobileTocOpen((v) => !v)}
                aria-expanded={mobileTocOpen}
                aria-controls={`toc-panel-${docKind}`}
                className="flex w-full items-center justify-between rounded-xl border border-[#7c86ff]/15 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl"
                data-testid={`button-toc-toggle-${docKind}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <List className="h-4 w-4 text-[#7c86ff]" />
                  Jump to a section
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${
                    mobileTocOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence>
                {mobileTocOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div
                      id={`toc-panel-${docKind}`}
                      className="mt-2 rounded-xl border border-[#7c86ff]/15 bg-white/80 p-2 shadow-sm backdrop-blur-xl"
                    >
                      {tocList}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Document panel */}
            <div className="relative overflow-hidden rounded-2xl border border-[#7c86ff]/20 bg-gradient-to-br from-white/95 via-white/85 to-indigo-50/40 shadow-[0_0_15px_rgba(124,134,255,0.07)] backdrop-blur-xl">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />

              <div className="px-5 py-7 sm:px-9 sm:py-10">
                {/* Preamble */}
                <div className="space-y-4 border-l-2 border-[#7c86ff]/40 pl-4 sm:pl-5">
                  {preamble.map((text, i) => (
                    <p
                      key={i}
                      className="text-[15px] font-medium leading-relaxed text-slate-700 sm:text-base"
                    >
                      {renderText(text)}
                    </p>
                  ))}
                </div>

                {/* Sections */}
                <div className="mt-10 space-y-10">
                  {sections.map((section, idx) => {
                    const { num, rest } = splitTitle(section.title);
                    return (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24"
                        data-testid={`section-${docKind}-${section.id}`}
                      >
                        {idx > 0 && (
                          <div className="mb-9 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                        )}
                        <div className="group flex items-start justify-between gap-3">
                          <h2
                            className="text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {num ? (
                              <>
                                <span className="text-indigo-500">{num}</span>
                                {rest}
                              </>
                            ) : (
                              section.title
                            )}
                          </h2>
                          <button
                            onClick={() => goToSection(section.id)}
                            className="mt-1 shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-[#7c86ff]/10 hover:text-[#7c86ff] focus:opacity-100 group-hover:opacity-100"
                            aria-label={`Link to section ${section.title}`}
                            data-testid={`anchor-${docKind}-${section.id}`}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-4 space-y-4">
                          {section.blocks.map((block, i) => {
                            if (block.type === "address") {
                              return (
                                <address
                                  key={i}
                                  className="not-italic rounded-lg border border-slate-200/70 bg-white/60 px-4 py-3 text-[15px] leading-relaxed text-slate-700 sm:text-base"
                                  data-testid="text-contact-address"
                                >
                                  {block.lines.map((line, j) => (
                                    <span key={j} className="block">
                                      {line}
                                    </span>
                                  ))}
                                </address>
                              );
                            }
                            return (
                              <p
                                key={i}
                                className="text-[15px] leading-relaxed text-slate-700 sm:text-base"
                              >
                                {renderText(block.text)}
                              </p>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cross-links */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => navigate(otherDocPath)}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-left shadow-sm backdrop-blur-sm transition-all hover:border-[#7c86ff]/30 hover:shadow-md"
                data-testid={`link-related-${docKind === "privacy" ? "terms" : "privacy"}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#7c86ff]/12 bg-white shadow-sm">
                  <OtherDocIcon className="h-4 w-4 text-[#333286]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Read next
                  </p>
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-[#333286]">
                    {otherDocLabel}
                  </p>
                </div>
              </button>
              <button
                onClick={() => navigate("/faq")}
                className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-left shadow-sm backdrop-blur-sm transition-all hover:border-[#7c86ff]/30 hover:shadow-md"
                data-testid={`link-related-faq-${docKind}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#7c86ff]/12 bg-white shadow-sm">
                  <HelpCircle className="h-4 w-4 text-[#333286]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Questions?
                  </p>
                  <p className="text-sm font-semibold text-slate-700 group-hover:text-[#333286]">
                    Visit the FAQ
                  </p>
                </div>
              </button>
            </div>
          </article>
        </div>
      </div>

      {/* Back to top */}
      <AnimatePresence>
        {showTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#7c86ff]/30 bg-[#3730a3] text-white shadow-lg shadow-[#3730a3]/30 transition-colors hover:bg-[#333286]"
            aria-label="Back to top"
            data-testid={`button-back-to-top-${docKind}`}
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </InfoPageLayout>
  );
}
