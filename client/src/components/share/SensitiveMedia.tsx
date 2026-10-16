/**
 * What stands in for media its creator marked sensitive (a NIP-36
 * `content-warning`, read by `contentWarningOf` in lib/nip36) — a video, a
 * picture post, or the pictures in a note. Where the media would show, a cover
 * says so and asks before showing it; where only a thumbnail would be, a
 * neutral tile says "Sensitive". Neither asks for the picture, the poster or a
 * frame of the video. The caller holds the "shown" state, and moves focus to
 * the media once it is shown: the button that had it is gone.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clip } from "@/lib/resultReaders";
import { cn } from "@/lib/utils";

/** The reason is the creator's free text: this much of it, so the button stays in a short frame. */
const REASON_CHARS = 80;

/** What a flagged tile is called for a screen reader, in place of "Play …". */
export const sensitiveVideoLabel = (title?: string | null) =>
  title?.trim() ? `Sensitive video: ${title.trim()}` : "Sensitive video";

/** What the cover is covering: one video (the default), pictures, or a post's mixed media. */
export type SensitiveSubject = "video" | "photo" | "media";

/** "this video" / "Show video"; "these photos" / "Show photos"; "this post's media" / "Show media". */
function coverWords(subject: SensitiveSubject, count: number): { what: string; action: string } {
  if (subject === "media") return { what: "this post's media", action: "Show media" };
  return count > 1
    ? { what: `these ${subject}s`, action: `Show ${subject}s` }
    : { what: `this ${subject}`, action: `Show ${subject}` };
}

/** In place of the player or the picture. The caller sizes it (`className`) and swaps it for the media on `onShow`. */
export function SensitiveCover({
  reason,
  onShow,
  className,
  subject = "video",
  count = 1,
  style,
}: {
  reason?: string;
  onShow: () => void;
  className?: string;
  /** The frame the media will take (an `aspectRatio` from its `dim`), so showing it moves nothing. */
  style?: CSSProperties;
  subject?: SensitiveSubject;
  /** How many of `subject` it covers: "these photos" past one. */
  count?: number;
}) {
  const words = coverWords(subject, count);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-slate-100 p-4 text-center dark:bg-slate-800",
        className,
      )}
      style={style}
      data-testid="sensitive-cover"
    >
      <EyeOff className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <p className="line-clamp-2 max-w-xs text-sm text-slate-600 dark:text-slate-300" data-testid="sensitive-reason">
        The creator marked {words.what} as sensitive{reason ? `: ${clip(reason, REASON_CHARS)}` : ""}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onShow} data-testid="sensitive-show">
        {words.action}
      </Button>
    </div>
  );
}

/**
 * In place of a thumbnail. The caller sizes it. Given `onClick` it is a button
 * a keyboard reaches, named `label` ("Sensitive video: …"); without, a picture.
 */
export function SensitiveTile({
  className,
  onClick,
  label,
}: {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** What the button is called for a screen reader; "Sensitive" alone says nothing of what opens. */
  label?: string;
}) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    className,
  );
  const inner = (
    <>
      <EyeOff className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-none" aria-hidden={onClick ? true : undefined}>
        Sensitive
      </span>
    </>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label ?? "Show sensitive media"}
        className={cn(cls, "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40")}
        data-testid="sensitive-tile"
      >
        {inner}
      </button>
    );
  return (
    <div className={cls} data-testid="sensitive-tile">
      {inner}
    </div>
  );
}

/**
 * One post, one reveal. A post's sensitive media can sit in two places — the
 * pictures in its words (NoteContent) and the files only its imeta names
 * (EventMedia) — and the reader asks once for all of it. Inside a scope, the
 * first part that has something to cover draws the cover; the others stand in
 * quietly (a tile, or a sound without its art) and show when it is asked.
 * The caller keys the scope on the event, so a reveal never carries to another.
 */
type RevealStore = {
  shown: boolean;
  claims: symbol[];
  version: number;
  listeners: Set<() => void>;
  show: () => void;
  claim: (id: symbol) => () => void;
  subscribe: (fn: () => void) => () => void;
};

function createRevealStore(): RevealStore {
  const store: RevealStore = {
    shown: false,
    claims: [],
    version: 0,
    listeners: new Set(),
    show: () => {
      if (store.shown) return;
      store.shown = true;
      bump();
    },
    claim: (id) => {
      store.claims = [...store.claims, id];
      bump();
      return () => {
        store.claims = store.claims.filter((c) => c !== id);
        bump();
      };
    },
    subscribe: (fn) => {
      store.listeners.add(fn);
      return () => void store.listeners.delete(fn);
    },
  };
  function bump() {
    store.version++;
    store.listeners.forEach((fn) => fn());
  }
  return store;
}

const RevealContext = createContext<RevealStore | null>(null);

/** One reveal for everything sensitive inside it: one post's words and files. */
export function SensitiveRevealScope({ children }: { children: ReactNode }) {
  const [store] = useState(createRevealStore);
  return <RevealContext.Provider value={store}>{children}</RevealContext.Provider>;
}

/** Where another post starts inside a scope (a quoted note): its media are asked for on their own. */
export function SensitiveRevealBoundary({ children }: { children: ReactNode }) {
  return <RevealContext.Provider value={null}>{children}</RevealContext.Provider>;
}

const noSubscribe = () => () => {};
const noVersion = () => 0;

/**
 * Whether the reader has asked for this post's sensitive media, how to ask, and
 * whether this part `leads` — draws the cover and takes focus once shown. Out of
 * a scope every part leads its own reveal. `covers`: this part has media to cover.
 */
export function useSensitiveReveal(covers: boolean): { shown: boolean; show: () => void; leads: boolean } {
  const store = useContext(RevealContext);
  const [own, setOwn] = useState(false);
  const [id] = useState(() => Symbol("reveal"));
  useSyncExternalStore(store?.subscribe ?? noSubscribe, store ? () => store.version : noVersion, noVersion);
  useLayoutEffect(() => (store && covers ? store.claim(id) : undefined), [store, covers, id]);
  const showOwn = useCallback(() => setOwn(true), []);
  if (!store) return { shown: own, show: showOwn, leads: true };
  return { shown: store.shown, show: store.show, leads: store.claims.length === 0 || store.claims[0] === id };
}
