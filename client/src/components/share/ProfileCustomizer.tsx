import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useLocation } from "wouter";
import { Loader2, Check, GripVertical, ChevronUp, ChevronDown, Search, X, UserRound, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  SECTION_KEYS,
  HERO_KEYS,
  SECTION_LABELS,
  HERO_LABELS,
  type ProfilePrefs,
  type SectionKey,
} from "@/config/personalization";

const MAX_FOLLOWERS = 5;
type Candidate = { pubkey: string; name?: string; picture?: string };

/**
 * One reorderable section row. Drag is bound to the grip handle only (via
 * `useDragControls` + `dragListener={false}`) so the toggle, arrows, and panel
 * scroll stay fully responsive on touch. The parent commits the new order on
 * `onDragEnd` (not per drag tick), keeping the live preview smooth.
 */
function SectionRow({
  sectionKey, label, index, total, hidden, onToggle, onMoveUp, onMoveDown, onCommit,
}: {
  sectionKey: SectionKey;
  label: string;
  index: number;
  total: number;
  hidden: boolean;
  onToggle: (on: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCommit: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={sectionKey}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onCommit}
      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2"
      data-testid={`customize-section-${sectionKey}`}
    >
      <span
        onPointerDown={(e) => controls.start(e)}
        className="shrink-0 cursor-grab touch-none p-0.5 text-slate-300 dark:text-slate-600"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <button type="button" onClick={onMoveUp} disabled={index === 0} className="rounded p-0.5 text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30" aria-label="Move up" data-testid={`customize-up-${sectionKey}`}><ChevronUp className="h-4 w-4" /></button>
      <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="rounded p-0.5 text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30" aria-label="Move down" data-testid={`customize-down-${sectionKey}`}><ChevronDown className="h-4 w-4" /></button>
      <Switch checked={!hidden} onCheckedChange={onToggle} className="data-[state=checked]:bg-brand-primary" data-testid={`customize-toggle-${sectionKey}`} />
    </Reorder.Item>
  );
}

/**
 * The owner-only "Customize" drawer for a public profile. A settings-style panel
 * (right side on desktop, bottom sheet on mobile) whose switches/picker edit a
 * draft `ProfilePrefs`; the page behind it updates live (WYSIWYG). Save publishes
 * the draft to Nostr (kind 30078).
 */
export function ProfileCustomizer({
  open,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  followerCandidates = [],
  emptyKeys,
}: {
  open: boolean;
  draft: ProfilePrefs;
  onChange: (next: ProfilePrefs) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error?: string | null;
  followerCandidates?: Candidate[];
  emptyKeys: Set<string>;
}) {
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const [followerQuery, setFollowerQuery] = useState("");

  const isHidden = (k: string) => draft.hidden.includes(k);
  const setHidden = (k: string, hidden: boolean) =>
    onChange({ ...draft, hidden: hidden ? [...new Set([...draft.hidden, k])] : draft.hidden.filter((x) => x !== k) });

  // Sections in current display order (draft order first, then defaults).
  const orderedSections = useMemo<SectionKey[]>(() => {
    const valid = draft.order.filter((k): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k));
    return [...valid, ...SECTION_KEYS.filter((k) => !valid.includes(k))];
  }, [draft.order]);
  // Sections you actually have content for lead; empty ones sink to a grayed
  // group below (display-only — saved order keeps every section's slot).
  const activeSections = useMemo(() => orderedSections.filter((k) => !emptyKeys.has(k)), [orderedSections, emptyKeys]);
  const emptySections = useMemo(() => orderedSections.filter((k) => emptyKeys.has(k)), [orderedSections, emptyKeys]);

  // framer-motion Reorder drives a LOCAL order while dragging (smooth, touch +
  // mouse, no live-preview churn); we commit to the draft only when the gesture
  // settles. Re-synced whenever the saved order changes (arrows / external).
  const [localOrder, setLocalOrder] = useState<SectionKey[]>(activeSections);
  useEffect(() => { setLocalOrder(activeSections); }, [activeSections]);

  // Write a new active-section order into the full saved order (empties keep
  // their slots) and push it to the draft.
  const commitOrder = (active: SectionKey[]) => {
    let ai = 0;
    const full = orderedSections.map((k) => (emptyKeys.has(k) ? k : active[ai++]));
    onChange({ ...draft, order: full });
  };
  // Arrow reorder (accessible path) — update local order and commit immediately.
  const moveLocal = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= localOrder.length || fromIdx === toIdx) return;
    const next = [...localOrder];
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    setLocalOrder(next);
    commitOrder(next);
  };

  // Follower picker — search filters the owner's followers; up to 5 selected.
  const candMap = useMemo(() => new Map(followerCandidates.map((c) => [c.pubkey, c])), [followerCandidates]);
  const selected: Candidate[] = draft.pinnedFollowers.map((pk) => candMap.get(pk) ?? { pubkey: pk });
  const addPinned = (pk: string) => {
    if (draft.pinnedFollowers.includes(pk) || draft.pinnedFollowers.length >= MAX_FOLLOWERS) return;
    onChange({ ...draft, pinnedFollowers: [...draft.pinnedFollowers, pk] });
  };
  const removePinned = (pk: string) => onChange({ ...draft, pinnedFollowers: draft.pinnedFollowers.filter((x) => x !== pk) });
  const atMax = draft.pinnedFollowers.length >= MAX_FOLLOWERS;
  const q = followerQuery.trim().toLowerCase();
  const results = followerCandidates
    .filter((c) => !draft.pinnedFollowers.includes(c.pubkey))
    .filter((c) => (q ? (c.name || "").toLowerCase().includes(q) : true))
    .slice(0, q ? 12 : 6);

  const PersonAvatar = ({ c, size = "h-6 w-6" }: { c: Candidate; size?: string }) => (
    <Avatar className={`${size} shrink-0 overflow-hidden rounded-full`}>
      {c.picture ? <AvatarImage src={c.picture} alt="" className="object-cover" /> : null}
      <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
    </Avatar>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={`flex flex-col gap-0 p-0 ${isMobile ? "h-[88vh] rounded-t-2xl" : "w-full sm:max-w-md"}`}
        data-testid="profile-customizer"
      >
        <SheetHeader className="border-b border-slate-100 dark:border-slate-800/60 px-5 py-4 text-left">
          <SheetTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Customize your profile</SheetTitle>
          <SheetDescription className="text-xs text-slate-500 dark:text-slate-400">Toggle what visitors see — it previews live behind this panel.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {/* Edit the actual profile content (name, photo, bio) — distinct from
              the visibility toggles below. Users often open "Customize" looking
              for this, so it's pinned at the top. Goes to the app's canonical
              editor at /settings?tab=profile. */}
          <button
            type="button"
            onClick={() => { onCancel(); navigate("/settings?tab=profile"); }}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:border-brand-accent/40 hover:bg-slate-50 dark:hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="customize-edit-profile"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary dark:text-brand-link">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Edit profile info</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Name, photo, bio &amp; banner</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
          </button>

          {/* Sections */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sections · drag or arrows to reorder</p>
            <Reorder.Group as="div" axis="y" values={localOrder} onReorder={setLocalOrder} className="space-y-1.5">
              {localOrder.map((k, i) => (
                <SectionRow
                  key={k}
                  sectionKey={k}
                  label={SECTION_LABELS[k]}
                  index={i}
                  total={localOrder.length}
                  hidden={isHidden(k)}
                  onToggle={(on) => setHidden(k, !on)}
                  onMoveUp={() => moveLocal(i, i - 1)}
                  onMoveDown={() => moveLocal(i, i + 1)}
                  onCommit={() => commitOrder(localOrder)}
                />
              ))}
            </Reorder.Group>
            {emptySections.length > 0 && (
              <div className="mt-1.5 space-y-1.5">
                {emptySections.map((k) => (
                  <div key={k} className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 px-2.5 py-2" data-testid={`customize-section-${k}`}>
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-200 dark:text-slate-700" aria-hidden="true" />
                    <span className="flex-1 truncate text-sm font-medium text-slate-400 dark:text-slate-500">{SECTION_LABELS[k]}</span>
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">Nothing to show yet</span>
                    <Switch checked={false} disabled className="opacity-50" data-testid={`customize-toggle-${k}`} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Profile details */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Profile details</p>
            <div className="space-y-1.5">
              {HERO_KEYS.map((k) => {
                const empty = emptyKeys.has(k);
                return (
                  <div key={k} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${empty ? "border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`} data-testid={`customize-row-${k}`}>
                    <span className={`flex-1 truncate text-sm font-medium ${empty ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>{HERO_LABELS[k]}</span>
                    {empty && <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">Not set yet</span>}
                    <Switch checked={empty ? false : !isHidden(k)} disabled={empty} onCheckedChange={(on) => setHidden(k, !on)} className={empty ? "opacity-50" : "data-[state=checked]:bg-brand-primary"} data-testid={`customize-toggle-${k}`} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* "What you do" used to live here. It was the placeholder for real
              tags, and now that they ship it's gone: a self-declared label and
              a network-attested one competing on the same profile just muddled
              which was which. Add a tag from the profile instead.
              `draft.roles` is still carried through save so existing users'
              stored roles survive a customize-and-save round trip. */}

          {/* Featured followers */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Featured followers · up to {MAX_FOLLOWERS} (empty = auto)</p>
            {selected.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selected.map((c) => (
                  <span key={c.pubkey} className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/40 bg-brand-deep/5 py-0.5 pl-0.5 pr-1.5 text-xs font-semibold text-brand-deep">
                    <PersonAvatar c={c} size="h-5 w-5" />
                    <span className="max-w-[110px] truncate">{c.name || c.pubkey.slice(0, 8) + "…"}</span>
                    <button type="button" onClick={() => removePinned(c.pubkey)} className="rounded-full p-0.5 hover:bg-brand-deep/10" aria-label="Remove" data-testid={`customize-follower-remove-${c.pubkey.slice(0, 8)}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            {!atMax && followerCandidates.length > 0 && (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <input value={followerQuery} onChange={(e) => setFollowerQuery(e.target.value)} placeholder="Search your followers…" className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none" data-testid="customize-follower-search" />
                </div>
                {results.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {results.map((c) => (
                      <button key={c.pubkey} type="button" onClick={() => addPinned(c.pubkey)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800" data-testid={`customize-follower-${c.pubkey.slice(0, 8)}`}>
                        <PersonAvatar c={c} />
                        <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{c.name || c.pubkey.slice(0, 10) + "…"}</span>
                        <span className="text-xs font-semibold text-brand-link">Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {atMax && <p className="text-xs text-slate-400 dark:text-slate-500">Max {MAX_FOLLOWERS} reached — remove one to add another.</p>}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/60 px-5 py-3">
          {error ? <span className="truncate text-xs text-red-500">{error}</span> : <span className="text-xs text-slate-400 dark:text-slate-500">Saved to Nostr — you own it.</span>}
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-60" data-testid="customize-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
