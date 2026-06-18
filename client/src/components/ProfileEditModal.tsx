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

          <div className="overflow-y-auto flex-1 min-h-0 px-5 sm:px-6 pb-5 sm:pb-6">
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
