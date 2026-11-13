import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ProfileEditForm } from "@/components/ProfileEditForm";

/**
 * The whole profile form as a side sheet: the page it was opened from stays in
 * view behind a light backdrop. One header — the form's own — so it never
 * reads as a page inside a page. /setup opens it from "Edit profile"; single
 * fields (photo, banner, bio) are edited in place there instead.
 */
export function ProfileEditSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="bg-black/30"
        className="w-full overflow-y-auto p-5 sm:max-w-[480px] sm:p-7"
        data-testid="sheet-edit-profile"
      >
        <SheetTitle className="sr-only">Edit your profile</SheetTitle>
        <SheetDescription className="sr-only">Your photo, banner, name, bio and links.</SheetDescription>
        <ProfileEditForm onSaved={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
