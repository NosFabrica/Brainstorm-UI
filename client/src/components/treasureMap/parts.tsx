/**
 * The smaller pieces of Settings › Treasure Map: an Assistant's avatar, a
 * labelled switch, the raw Map viewer and the FAQ. Words are Tapestry's
 * (ui/src/pages/treasure-map/manageTreasureMap.js), so the two apps say the
 * same thing about one Map.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { PersonAvatar, type Profiles } from "@/components/messages/people";
import { cn } from "@/lib/utils";

/** Where the Advanced page's promise is kept: every entry and who provides it, in Assistants & Duties' Duties view. */
export const ADVANCED_PATH = "/settings?tab=assistants&view=duties";
/** Where the reader's Assistants are kept. */
export const ASSISTANTS_PATH = "/settings?tab=assistants";

/** An Assistant's face; the reader's own Assistant here is ringed in the accent. */
export function MapAvatar({
  pubkey,
  profiles,
  local,
  size = 28,
}: {
  pubkey: string;
  profiles: Profiles;
  local: boolean;
  size?: number;
}) {
  return (
    <PersonAvatar
      pubkey={pubkey}
      profiles={profiles}
      size={size}
      className={cn("rounded-full", local && "ring-2 ring-brand-accent")}
    />
  );
}

/** A switch with its label and what it does now, under it. */
export function SwitchRow({
  id,
  label,
  note,
  on,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  note: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white px-3 py-2.5 dark:bg-slate-900">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{label}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{note}</span>
      </label>
      <Switch id={id} checked={on} onCheckedChange={onChange} disabled={disabled} data-testid={id} />
    </div>
  );
}

/** A disclosure button and the JSON behind it: the published Map, or in Edit mode the Map as Save would sign it. */
export function RawMapViewer({
  show,
  hide,
  chip,
  label,
  children,
}: {
  show: string;
  hide: string;
  chip: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      >
        <Code2 className="h-4 w-4" aria-hidden />
        {open ? hide : show}
        {chip}
      </button>
      {open && (
        <div
          className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          tabIndex={0}
          role="region"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function KindChip({ children }: { children: ReactNode }) {
  return (
    <Chip tone="slate" size="sm" className="font-mono">
      {children}
    </Chip>
  );
}

const FAQS = [
  {
    q: "What is a Treasure Map?",
    a: "A public record that points other nostr apps to the insights your Assistant calculates for you, so every app you use can benefit from your trusted community.",
  },
  {
    q: "Do I need to do anything?",
    a: "Not usually. Brainstorm creates your Treasure Map during setup and keeps it current. You only need to sign again when something important changes.",
  },
  {
    q: "Who can see it?",
    a: "Anyone. It’s published to relays like any other nostr event, so any app can read it.",
  },
  {
    q: "What’s on the Advanced page?",
    a: "Every individual entry in your Treasure Map — scores, lists, and concepts — along with which Assistant provides each one. Most people never need it.",
  },
];

/** "Frequently asked questions", closed at first; one answer open at a time, and hiding them closes it. */
export function TreasureMapFaq() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid="button-treasure-map-faq"
      >
        Frequently asked questions
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <Accordion type="single" collapsible className="mt-2">
          {FAQS.map(({ q, a }) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="text-sm">{q}</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600 dark:text-slate-300">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
