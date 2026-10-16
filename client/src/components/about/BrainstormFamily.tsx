import type { ComponentType } from "react";
import { ArrowRight, Search, Store } from "lucide-react";
import { CommunitiesIcon, MusicLibraryIcon } from "@/components/brainstormAppIcons";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { tone as getTone, type NamedTone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * "The Brainstorm family" on /about. Live products open their own vertical of
 * the search page; what is still coming says so and goes last.
 */
type Member = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  tone: NamedTone;
  title: string;
  desc: string;
  /** Where the card goes; absent while the product is still coming. */
  live?: { cta: string; href: string };
};

const FAMILY: Member[] = [
  {
    id: "search",
    icon: Search,
    tone: "brand",
    title: "Brainstorm Search",
    desc: "Find real people across millions of profiles. Search by name, bio, or handle.",
    live: { cta: "Open search", href: "/" },
  },
  {
    id: "vendors",
    icon: Store,
    tone: "sky",
    title: "Brainstorm Vendors",
    desc: "Find sellers and services worth your money, vouched for by people you trust.",
    live: { cta: "Browse the shop", href: "/?t=shop" },
  },
  {
    id: "music",
    icon: MusicLibraryIcon,
    tone: "fuchsia",
    title: "Brainstorm Music",
    desc: "Tunes worth a listen, picked by ears you trust instead of the charts.",
    live: { cta: "Start listening", href: "/?t=music" },
  },
  {
    id: "communities",
    icon: CommunitiesIcon,
    tone: "violet",
    title: "Brainstorm Communities",
    desc: "Hang out in spaces full of people actually worth your time.",
  },
];

export function BrainstormFamily({ navigate }: { navigate: (href: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FAMILY.map((m) => {
        const c = getTone(m.tone);
        const Icon = m.icon;
        const iconChip =
          m.id === "search" ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary shadow-[0_4px_14px_rgb(var(--brand-primary)/0.3)]">
              <Icon className="h-5 w-5 text-white" />
            </div>
          ) : (
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", c.bg, c.border)}>
              <Icon className={cn("h-5 w-5", c.icon)} />
            </div>
          );
        if (m.live) {
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.live!.href)}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-accent/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-6"
              data-testid={`card-family-${m.id}`}
            >
              <div className="flex items-center justify-between">
                {iconChip}
                <Chip tone="emerald" dot size="sm" className="font-bold uppercase tracking-wide">
                  Live
                </Chip>
              </div>
              <h3
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {m.title}
              </h3>
              <p className="flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{m.desc}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary transition-all group-hover:gap-2">
                {m.live.cta} <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          );
        }
        return (
          <Card key={m.id} className="flex flex-col gap-3 p-5 sm:p-6" data-testid={`card-family-${m.id}`}>
            <div className="flex items-center justify-between">
              {iconChip}
              <Chip tone="slate" size="sm" className="font-bold uppercase tracking-wide">
                Coming soon
              </Chip>
            </div>
            <h3
              className="text-lg font-bold text-slate-800 dark:text-slate-200"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {m.title}
            </h3>
            <p className="flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{m.desc}</p>
          </Card>
        );
      })}
    </div>
  );
}
