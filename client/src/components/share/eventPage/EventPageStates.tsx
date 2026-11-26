import { Link } from "wouter";
import { Loader2, MessageSquare, Smartphone } from "lucide-react";

/** A link that names no event. */
export function EventLinkInvalid() {
  return (
    <div className="py-20 text-center">
      <MessageSquare className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
      <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">That note link isn't valid.</p>
      <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand-link hover:underline">
        Go to Brainstorm →
      </Link>
    </div>
  );
}

export function EventLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

/** No relay asked has the event: an app the reader has may find it (`openInApp`, its nostr: URI). */
export function EventNotFound({ openInApp }: { openInApp: string }) {
  return (
    <div className="py-20 text-center">
      <MessageSquare className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
      <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">We couldn't find this note on the relays.</p>
      {openInApp && (
        <a
          href={openInApp}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
        >
          <Smartphone className="h-4 w-4" /> Try opening in an app
        </a>
      )}
    </div>
  );
}
