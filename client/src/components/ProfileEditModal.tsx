import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
        className="sm:max-w-[520px] max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden p-0"
        data-testid="modal-edit-profile"
      >
        <div className="flex flex-col max-h-[90vh]">
          <div className="px-5 sm:px-7 pt-6 sm:pt-8 pb-2 shrink-0">
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">Your Profile</span>
                <div className="h-px w-10 bg-brand-link/30" />
              </div>
              <DialogTitle
                className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-edit-profile-title"
              >
                Edit your <span className="text-brand-link">profile</span>
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Add a photo, bio, and details. Everything's optional.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-5 sm:px-7 pb-5 sm:pb-7">
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
