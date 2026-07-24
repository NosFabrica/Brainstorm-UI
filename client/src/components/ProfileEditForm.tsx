import { useState, useEffect, type FormEvent } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { Loader2, Check, AlertCircle, Pencil, Link2, ChevronDown, Plus, X, UserRound, AtSign } from "lucide-react";
import { publishProfile, getCurrentUser, fetchProfile, fetchProfileEvent } from "@/services/nostr";
import { IDENTITY_PLATFORMS, splitIdentityClaim, formatIdentityClaim } from "@/lib/externalIdentity";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { InfoHint } from "@/components/InfoHint";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC, initialsFor } from "@/lib/profileDefaults";

interface ProfileEditFormProps {
  /** Called after a successful save (the success state shows briefly first). */
  onSaved?: () => void;
  /** Label for the primary button. Defaults to "Save profile". */
  submitLabel?: string;
}

type SaveState = "idle" | "saving" | "success" | "error";

// Editable fields look like normal inputs; in view mode they read as flat values.
const inputEditCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition disabled:opacity-60";
const inputViewCls =
  "w-full rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3.5 py-2.5 text-[15px] text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition cursor-default focus:outline-none";

/**
 * Reusable editor for the user's own Nostr profile (kind 0). The single source of
 * truth for the profile form — rendered inline on the Settings "Profile" tab and
 * inside ProfileEditModal. Reuses ImageUpload for avatar/banner; saves via
 * publishProfile. Prefills from the cached user, then fills gaps from the live
 * kind-0.
 */
export function ProfileEditForm({ onSaved, submitLabel = "Save profile" }: ProfileEditFormProps) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [banner, setBanner] = useState("");
  const [nip05, setNip05] = useState("");
  const [website, setWebsite] = useState("");
  const [lud16, setLud16] = useState("");
  // NIP-39 external identities ("Linked accounts"), collapsed by default.
  const [identities, setIdentities] = useState<{ platform: string; identity: string; proof: string }[]>([]);
  const [showLinked, setShowLinked] = useState(false);
  // Existing kind-0 content + tags, captured on load so save MERGES rather than
  // overwrites — unknown content keys (lud06, bot, custom) and non-`i` tags survive.
  const [baseContent, setBaseContent] = useState<Record<string, unknown>>({});
  const [baseTags, setBaseTags] = useState<string[][]>([]);
  // True once we've actually loaded the live kind-0; until then, save re-fetches
  // so it never merges onto a stale/empty base and drops tags.
  const [baseLoaded, setBaseLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  // View mode by default; user clicks "Edit profile" to unlock the fields.
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);
  const [identSnap, setIdentSnap] = useState<{ platform: string; identity: string; proof: string }[] | null>(null);
  const { toast } = useToast();

  const addIdentity = () => setIdentities((rows) => [...rows, { platform: "github", identity: "", proof: "" }]);
  const removeIdentity = (i: number) => setIdentities((rows) => rows.filter((_, idx) => idx !== i));
  const updateIdentity = (i: number, key: "platform" | "identity" | "proof", val: string) =>
    setIdentities((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const inputCls = editing ? inputEditCls : inputViewCls;

  const enterEdit = () => {
    setSnapshot({ name, about, picture, banner, nip05, website, lud16 });
    setIdentSnap(identities.map((r) => ({ ...r })));
    setState("idle");
    setError("");
    setNameError("");
    setEditing(true);
  };

  const cancelEdit = () => {
    if (snapshot) {
      setName(snapshot.name);
      setAbout(snapshot.about);
      setPicture(snapshot.picture);
      setBanner(snapshot.banner);
      setNip05(snapshot.nip05);
      setWebsite(snapshot.website);
      setLud16(snapshot.lud16);
    }
    if (identSnap) setIdentities(identSnap.map((r) => ({ ...r })));
    setState("idle");
    setError("");
    setNameError("");
    setEditing(false);
  };

  // Prefill from the cached user, then fill any gaps from the live kind-0.
  useEffect(() => {
    const user = getCurrentUser();
    const p = (user?.profile ?? {}) as Record<string, string | undefined>;
    setName(p.display_name || p.name || user?.displayName || "");
    setAbout(p.about || user?.about || "");
    setPicture(p.picture || p.image || user?.picture || "");
    setBanner(p.banner || "");
    setNip05(p.nip05 || user?.nip05 || "");
    setWebsite(p.website || "");
    setLud16(p.lud16 || p.lud06 || "");
    if (user?.pubkey) {
      fetchProfile(user.pubkey)
        .then((c) => {
          if (!c) return;
          const x = c as Record<string, string | undefined>;
          setName((v) => v || x.display_name || x.name || "");
          setAbout((v) => v || x.about || "");
          setPicture((v) => v || x.picture || x.image || "");
          setBanner((v) => v || x.banner || "");
          setNip05((v) => v || x.nip05 || "");
          setWebsite((v) => v || x.website || "");
          setLud16((v) => v || x.lud16 || x.lud06 || "");
        })
        .catch(() => {});
      // Capture the raw kind-0 (content + tags) so save MERGES, and pre-fill the
      // linked-accounts editor from the existing NIP-39 `i` tags.
      fetchProfileEvent(user.pubkey)
        .then((ev) => {
          if (!ev) return;
          setBaseLoaded(true);
          setBaseTags(ev.tags || []);
          try { setBaseContent(JSON.parse(ev.content || "{}")); } catch { /* keep {} */ }
          const rows = (ev.tags || [])
            .filter((t) => t[0] === "i" && t[1] && !t[1].toLowerCase().startsWith("nostr:"))
            .map((t) => ({ ...splitIdentityClaim(t[1]), proof: t[2] || "" }))
            .filter((r) => r.identity);
          if (rows.length) setIdentities(rows);
        })
        .catch(() => {});
    }
  }, []);

  const busy = state === "saving";

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!editing) return; // ignore stray Enter presses in view mode
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Display name is required.");
      return;
    }
    setNameError("");
    setState("saving");
    setError("");
    // Merge onto the freshest kind-0. If the initial load never resolved, re-fetch
    // now so we never merge onto a stale/empty base and silently drop tags/keys.
    let mergeContent = baseContent;
    let mergeTags = baseTags;
    if (!baseLoaded) {
      try {
        const pk = getCurrentUser()?.pubkey;
        const ev = pk ? await fetchProfileEvent(pk) : undefined;
        if (ev) {
          mergeTags = ev.tags || [];
          try { mergeContent = JSON.parse(ev.content || "{}"); } catch { /* keep base */ }
        }
      } catch { /* best-effort */ }
    }

    // Set the fields this form manages, or delete them when cleared; unknown keys
    // (lud06, bot, custom) carry over from the merged base.
    const content: Record<string, unknown> = { ...mergeContent, name: trimmedName, display_name: trimmedName };
    const setOrDel = (k: string, v: string) => { const t = v.trim(); if (t) content[k] = t; else delete content[k]; };
    setOrDel("about", about);
    setOrDel("picture", picture);
    setOrDel("banner", banner);
    setOrDel("nip05", nip05);
    setOrDel("website", website);
    setOrDel("lud16", lud16);

    // Preserve every non-identity tag; rebuild the `i` (NIP-39) tags from the editor.
    const identityTags = identities
      .map((r) => ({ claim: formatIdentityClaim(r.platform, r.identity), proof: r.proof.trim() }))
      .filter((r) => r.claim)
      .map((r) => ["i", r.claim, r.proof]);
    const tags = [...mergeTags.filter((t) => t[0] !== "i"), ...identityTags];

    const res = await publishProfile(content, tags);
    if (res.success) {
      // Seed the profile page's kind-0 cache so your own /profile/:npub shows the
      // new info immediately (it otherwise serves a 5-min-stale cached copy).
      try {
        const pk = getCurrentUser()?.pubkey;
        if (pk) queryClient.setQueryData(["nostr-profile", pk], content);
      } catch {}
      setState("success");
      setEditing(false); // back to view mode after a successful save
      toast({ title: "Profile saved", description: "Your changes are live." });
      setTimeout(() => {
        onSaved?.();
        setState("idle");
      }, 900);
    } else {
      setState("error");
      setError(res.error || "Couldn't save your profile. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="form-profile-edit">
      {/* Banner — full-bleed at the card top (mirrors BrainstormAssistantCard) */}
      <ImageUpload
        aspect="banner"
        value={banner}
        onChange={setBanner}
        onRemove={() => setBanner("")}
        readOnly={!editing}
        containerClassName="w-full h-24 sm:h-32 md:h-36 rounded-t-2xl"
        placeholder={
          <div className={`relative w-full h-full ${DEFAULT_BANNER_CLASS}`}>
            <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-brand-accent-hover/20 to-brand-deep/40 mix-blend-multiply" />
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        }
      />

      {/* Content overlaps the banner via the negative top margin */}
      <div className="px-5 sm:px-7 pb-6 sm:pb-7 -mt-12 sm:-mt-16 relative">
        {/* Circular avatar overlapping the bottom-left of the banner */}
        <div className="mb-3">
          <ImageUpload
            aspect="square"
            value={picture}
            onChange={setPicture}
            onRemove={() => setPicture("")}
            readOnly={!editing}
            containerClassName="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white dark:border-slate-900 shadow-lg bg-white dark:bg-slate-900"
            placeholder={
              <div
                className="w-full h-full flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {initialsFor(name)}
              </div>
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-profile-title">
              Your profile
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="text-profile-subtitle">
              How you appear to people across the network
            </p>
          </div>
          {!editing && state !== "success" && (
            <button
              type="button"
              onClick={enterEdit}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-accent/50 hover:bg-slate-50 dark:hover:bg-slate-800 px-3.5 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              data-testid="button-edit-profile"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        <div className="space-y-5">
          {/* Section: Identity */}
          <div className="flex items-center gap-2">
            <UserRound className="h-3.5 w-3.5 text-brand-accent" />
            <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-brand-accent">Identity</span>
            <span className="h-px flex-1 bg-gradient-to-r from-brand-accent/25 to-transparent" />
          </div>
          <div>
            <label htmlFor="pe-name" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Display name
              <span className="text-brand-link" aria-hidden="true">*</span>
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Required</span>
            </label>
            <input
              id="pe-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(""); }}
              maxLength={50}
              disabled={busy}
              readOnly={!editing}
              placeholder="Your name"
              aria-invalid={!!nameError}
              className={(nameError ? inputCls.replace("border-slate-200", "border-red-300") : inputCls)}
              data-testid="input-edit-name"
            />
            <div className="mt-1 flex items-center justify-between gap-2 min-h-[16px]">
              <span className="text-xs text-red-600 font-medium" data-testid="error-edit-name">{nameError}</span>
              {editing && <span className={`text-xs tabular-nums ${name.length >= 45 ? "text-amber-600" : "text-slate-400 dark:text-slate-500"}`}>{name.length}/50</span>}
            </div>
          </div>
          <div>
            <label htmlFor="pe-about" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Bio
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span>
            </label>
            <textarea id="pe-about" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={500} disabled={busy} readOnly={!editing} rows={3} placeholder="A short bio" className={inputCls + " resize-none"} data-testid="input-edit-about" />
            {editing && (
              <div className="mt-1 flex justify-end">
                <span className={`text-xs tabular-nums ${about.length >= 460 ? "text-amber-600" : "text-slate-400 dark:text-slate-500"}`}>{about.length}/500</span>
              </div>
            )}
          </div>
          {/* Section: Contact & links */}
          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800/60 pt-5">
            <AtSign className="h-3.5 w-3.5 text-brand-accent" />
            <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-brand-accent">Contact &amp; links</span>
            <span className="h-px flex-1 bg-gradient-to-r from-brand-accent/25 to-transparent" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pe-nip05" className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Verified address
                <InfoHint label="About verified address">A username like you@domain that proves you own it. Optional.</InfoHint>
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span>
              </label>
              <input id="pe-nip05" type="text" value={nip05} onChange={(e) => setNip05(e.target.value)} disabled={busy} readOnly={!editing} placeholder="you@example.com" className={inputCls} data-testid="input-edit-nip05" />
            </div>
            <div>
              <label htmlFor="pe-lud16" className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Lightning address
                <InfoHint label="About Lightning address">Lets people send you tips — looks like you@wallet.com. Optional.</InfoHint>
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span>
              </label>
              <input id="pe-lud16" type="text" value={lud16} onChange={(e) => setLud16(e.target.value)} disabled={busy} readOnly={!editing} placeholder="you@wallet.com" className={inputCls} data-testid="input-edit-lud16" />
            </div>
          </div>
          <div>
            <label htmlFor="pe-website" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Website
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span>
            </label>
            <input id="pe-website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={busy} readOnly={!editing} placeholder="https://…" className={inputCls} data-testid="input-edit-website" />
            {editing && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Your site or social link.</p>}
          </div>

          {/* Linked accounts (NIP-39) — optional, collapsed by default so it never
              overwhelms; power users link GitHub / X / Mastodon / Telegram. */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLinked((v) => !v)}
              className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-expanded={showLinked}
              data-testid="button-linked-accounts-toggle"
            >
              <Link2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Linked accounts</span>
              {identities.length > 0 && (
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{identities.length}</span>
              )}
              <span className="ml-auto text-xs font-normal text-slate-400 dark:text-slate-500">Optional</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform ${showLinked ? "rotate-180" : ""}`} />
            </button>
            {showLinked && (
              <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800/60 px-3.5 py-3">
                <p className="text-xs leading-snug text-slate-400 dark:text-slate-500">Link your other profiles — shown as icons on your public profile. Proofs are optional.</p>
                {identities.length === 0 && !editing && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No linked accounts yet.</p>
                )}
                {identities.map((row, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5" data-testid={`row-linked-${i}`}>
                    <div className="flex items-center gap-2">
                      <select
                        value={row.platform}
                        disabled={!editing || busy}
                        onChange={(e) => updateIdentity(i, "platform", e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 disabled:opacity-60"
                        data-testid={`select-linked-platform-${i}`}
                      >
                        {IDENTITY_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <input
                        type="text"
                        value={row.identity}
                        disabled={!editing || busy}
                        onChange={(e) => updateIdentity(i, "identity", e.target.value)}
                        placeholder={IDENTITY_PLATFORMS.find((p) => p.value === row.platform)?.placeholder || "identity"}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 disabled:opacity-60"
                        data-testid={`input-linked-identity-${i}`}
                      />
                      {editing && (
                        <button
                          type="button"
                          onClick={() => removeIdentity(i)}
                          aria-label="Remove linked account"
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600"
                          data-testid={`button-linked-remove-${i}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {editing && (
                      <input
                        type="text"
                        value={row.proof}
                        onChange={(e) => updateIdentity(i, "proof", e.target.value)}
                        placeholder="Proof link — optional"
                        className="w-full rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
                        data-testid={`input-linked-proof-${i}`}
                      />
                    )}
                  </div>
                ))}
                {editing && (
                  <button
                    type="button"
                    onClick={addIdentity}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover"
                    data-testid="button-linked-add"
                  >
                    <Plus className="h-4 w-4" /> Add {identities.length > 0 ? "another" : "account"}
                  </button>
                )}
              </div>
            )}
          </div>

          {state === "error" && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700" data-testid="status-edit-error">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-xs font-medium">{error}</span>
            </div>
          )}

          {(state === "success" || editing) && (
            <div className="pt-1">
              {state === "success" ? (
                <div className="flex items-center justify-center gap-2.5 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700" data-testid="status-edit-success">
                  <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-bold">Profile saved!</span>
                </div>
              ) : (
                <div className="flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={busy}
                    className="h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-sm transition-colors disabled:opacity-50"
                    data-testid="button-edit-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-11 px-6 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    data-testid="button-edit-save"
                  >
                    {busy ? (<><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>) : submitLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
