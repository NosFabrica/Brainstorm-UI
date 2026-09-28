import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProfileEditForm } from "@/components/ProfileEditForm";

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Modal wrapper around the shared ProfileEditForm. The canonical home for
 * profile editing is now the Settings "Profile" tab; this modal is kept for any
 * in-context quick-edit entry points that still import it.
 */
export function ProfileEditModal({ open, onOpenChange, onSaved }: ProfileEditModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-w-[520px]"
        data-testid="modal-edit-profile"
      >
        <div className="flex max-h-[90vh] flex-col">
          <div className="shrink-0 px-5 pb-2 pt-6 sm:px-7 sm:pt-8">
            <DialogHeader className="space-y-0 text-left">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                  Your Profile
                </span>
                <div className="h-px w-10 bg-brand-link/30" />
              </div>
              <DialogTitle
                className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-edit-profile-title"
              >
                Edit your <span className="text-brand-link">profile</span>
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Add a photo, bio, and details. Everything's optional.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
            <ProfileEditForm
              onSaved={() => {
                onSaved?.();
                onOpenChange(false);
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
