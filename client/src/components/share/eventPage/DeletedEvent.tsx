import { Link } from "wouter";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { DeletedStub } from "@/components/share/DeletedStub";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";

/** An event deleted (by NIP-09, or by overwriting) or past its NIP-40 expiration: said, never drawn. */
export function DeletedEvent({ expired = false }: { expired?: boolean }) {
  return (
    <div className="min-h-page bg-[#F8FAFC] font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHeader />
      <main className={cn(pageWidth("reading"), "py-8")}>
        <div className="py-10" data-testid={expired ? "event-expired" : "event-deleted"}>
          <DeletedStub expired={expired} />
          <p className="mt-4 text-center">
            <Link href="/" className="text-sm font-semibold text-brand-link hover:underline">
              Go to Brainstorm →
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
