import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ImageUpload";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { publishProfile, getCurrentUser, fetchProfile } from "@/services/nostr";

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type SaveState = "idle" | "saving" | "success" | "error";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 transition disabled:opacity-60";

/**
 * Reusable editor for the user's own Nostr profile (kind 0). Used both for the
 * optional "complete your profile" step after signup and anytime later from the
 * account menu. Reuses ImageUpload for avatar/banner; saves via publishProfile.
 */
export function ProfileEditModal({ open, onOpenChange, onSaved }: ProfileEditModalProps) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [banner, setBanner] = useState("");
  const [nip05, setNip05] = useState("");
  const [website, setWebsite] = useState("");
  const [lud16, setLud16] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  // Prefill from the cached user, then fill any gaps from the live kind-0.
  useEffect(() => {
    if (!open) return;
    const user = getCurrentUser();
    const p = (user?.profile ?? {}) as Record<string, string | undefined>;
    setName(p.display_name || p.name || user?.displayName || "");
    setAbout(p.about || user?.about || "");
    setPicture(p.picture || p.image || user?.picture || "");
    setBanner(p.banner || "");
    setNip05(p.nip05 || user?.nip05 || "");
    setWebsite(p.website || "");
    setLud16(p.lud16 || p.lud06 || "");
    setState("idle");
    setError("");
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
    }
  }, [open]);

  const busy = state === "saving";

  const handleClose = (nextOpen: boolean) => {
    if (busy) return;
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setState("error");
      setError("Please enter a display name.");
      return;
    }
    setState("saving");
    setError("");
    const content: Record<string, unknown> = { name: trimmedName, display_name: trimmedName };
    if (about.trim()) content.about = about.trim();
    if (picture.trim()) content.picture = picture.trim();
    if (banner.trim()) content.banner = banner.trim();
    if (nip05.trim()) content.nip05 = nip05.trim();
    if (website.trim()) content.website = website.trim();
    if (lud16.trim()) content.lud16 = lud16.trim();

    const res = await publishProfile(content);
    if (res.success) {
      setState("success");
      setTimeout(() => {
        onSaved?.();
        onOpenChange(false);
      }, 900);
    } else {
      setState("error");
      setError(res.error || "Couldn't save your profile. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[520px] max-h-[90vh] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/95 via-white/92 to-indigo-50/50 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
        data-testid="modal-edit-profile"
      >
        <div className="relative flex flex-col max-h-[90vh]">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x shrink-0" />

          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2 shrink-0">
            <DialogHeader>
              <DialogTitle
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-edit-profile-title"
              >
                Edit your <span className="text-[#333286]">profile</span>
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed">
                Add a photo, bio, and details. Everything's optional.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0 px-5 sm:px-6 pb-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Banner</label>
              <ImageUpload aspect="banner" value={banner} onChange={setBanner} onRemove={() => setBanner("")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Profile photo</label>
              <ImageUpload aspect="square" value={picture} onChange={setPicture} onRemove={() => setPicture("")} className="w-24" />
            </div>
            <div>
              <label htmlFor="pe-name" className="block text-sm font-medium text-slate-700 mb-1.5">Display name</label>
              <input id="pe-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} disabled={busy} placeholder="Your name" className={inputCls} data-testid="input-edit-name" />
            </div>
            <div>
              <label htmlFor="pe-about" className="block text-sm font-medium text-slate-700 mb-1.5">Bio</label>
              <textarea id="pe-about" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={500} disabled={busy} rows={3} placeholder="A short bio" className={inputCls + " resize-none"} data-testid="input-edit-about" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pe-nip05" className="block text-sm font-medium text-slate-700 mb-1.5">Verified address (NIP-05)</label>
                <input id="pe-nip05" type="text" value={nip05} onChange={(e) => setNip05(e.target.value)} disabled={busy} placeholder="you@example.com" className={inputCls} data-testid="input-edit-nip05" />
              </div>
              <div>
                <label htmlFor="pe-lud16" className="block text-sm font-medium text-slate-700 mb-1.5">Lightning address</label>
                <input id="pe-lud16" type="text" value={lud16} onChange={(e) => setLud16(e.target.value)} disabled={busy} placeholder="you@wallet.com" className={inputCls} data-testid="input-edit-lud16" />
              </div>
            </div>
            <div>
              <label htmlFor="pe-website" className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
              <input id="pe-website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={busy} placeholder="https://…" className={inputCls} data-testid="input-edit-website" />
            </div>

            {state === "error" && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700" data-testid="status-edit-error">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}
          </form>

          <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-3 shrink-0 border-t border-slate-200/60">
            {state === "success" ? (
              <div className="flex items-center justify-center gap-2.5 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700" data-testid="status-edit-success">
                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-bold">Profile saved!</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={busy}
                className="w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-semibold text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="button-edit-save"
              >
                {busy ? (<><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>) : "Save profile"}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
