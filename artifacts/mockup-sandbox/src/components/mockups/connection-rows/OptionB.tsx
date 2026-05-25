import { ArrowLeftRight, ArrowRight, ArrowLeft, Minus } from "lucide-react";

type Direction = "mutual" | "they_follow_owner" | "owner_follows_them" | "none";
type YouLink = "mutual" | "you_follow" | "follows_you" | "none";

type Row = {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarBg: string;
  ownerLink: Direction;
  youLink: YouLink;
  score: number;
};

const ROWS: Row[] = [
  { id: "joe",     name: "Joe Martin",         handle: "joe@nostrplebs.com",    initial: "J", avatarBg: "bg-emerald-100 text-emerald-700",
    ownerLink: "mutual",              youLink: "you_follow",  score: 99 },
  { id: "dawn",    name: "Dawn",               handle: "dawn@spatia-arcana.com",initial: "D", avatarBg: "bg-rose-100 text-rose-700",
    ownerLink: "mutual",              youLink: "mutual",      score: 92 },
  { id: "contra",  name: "Contra",             handle: "reformedsaint@zaps.lol",initial: "C", avatarBg: "bg-slate-200 text-slate-700",
    ownerLink: "they_follow_owner",   youLink: "follows_you", score: 70 },
  { id: "tk",      name: "TK",                 handle: "ti@tk21.co",            initial: "T", avatarBg: "bg-indigo-100 text-indigo-700",
    ownerLink: "mutual",              youLink: "none",        score: 100 },
  { id: "terry",   name: "Terry Yiu",          handle: "_@tyiu.xyz",            initial: "T", avatarBg: "bg-amber-100 text-amber-700",
    ownerLink: "they_follow_owner",   youLink: "none",        score: 99 },
  { id: "satoshi", name: "Satoshi's Apostles", handle: "(no nip-05)",           initial: "S", avatarBg: "bg-orange-100 text-orange-700",
    ownerLink: "they_follow_owner",   youLink: "follows_you", score: 2 },
];

function OwnerPill({ d }: { d: Direction }) {
  if (d === "none") return <span className="text-slate-300 text-xs">—</span>;
  const cfg = {
    mutual:              { label: "Mutual",     Icon: ArrowLeftRight },
    they_follow_owner:   { label: "Follower",   Icon: ArrowLeft },
    owner_follows_them:  { label: "Following",  Icon: ArrowRight },
  }[d];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-teal-50 text-teal-700 border-teal-200">
      <cfg.Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function YouPill({ y }: { y: YouLink }) {
  if (y === "none") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100">
        <Minus className="h-2.5 w-2.5" />
        No overlap
      </span>
    );
  }
  const cfg = {
    mutual:      { label: "Mutual with you", Icon: ArrowLeftRight },
    you_follow:  { label: "You follow",      Icon: ArrowRight },
    follows_you: { label: "Follows you",     Icon: ArrowLeft },
  }[y];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200">
      <cfg.Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

export function OptionB() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Option B — Grouped & Relabeled
          </div>
          <h2 className="mt-2 text-base font-bold text-slate-800">Verified Followers — Jon Gordon</h2>
          <p className="text-xs text-slate-500">
            Two clusters per row. <span className="text-teal-700 font-semibold">Jon</span> shows the profile owner's relationship; <span className="text-indigo-700 font-semibold">You</span> shows yours. "Mutual" replaces redundant Following pills. "Shared *" renamed to plain verbs.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_140px_140px_44px] gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Account</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-teal-600">Jon ↔ them</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">You ↔ them</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right">Trust</div>
          </div>

          <div className="divide-y divide-slate-100">
            {ROWS.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_140px_140px_44px] gap-3 items-center px-4 py-3 hover:bg-slate-50/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${row.avatarBg}`}>
                    {row.initial}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{row.name}</div>
                    <div className="text-xs text-indigo-600 truncate">{row.handle}</div>
                  </div>
                </div>
                <div className="flex justify-start"><OwnerPill d={row.ownerLink} /></div>
                <div className="flex justify-start"><YouPill y={row.youLink} /></div>
                <div className="text-right text-sm font-bold text-slate-800 tabular-nums">{row.score}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-[11px] text-slate-500 leading-relaxed space-y-1.5">
          <div><span className="font-semibold text-slate-700">Reads like a sentence:</span> "For Jon, Joe is Mutual. For you, you follow Joe."</div>
          <div><span className="font-semibold text-slate-700">Max 2 pills per row</span> (was up to 4). Empty right cluster shows "No overlap" so users don't wonder if data is missing.</div>
          <div><span className="font-semibold text-slate-700">Color = scope:</span> teal = profile owner's network, indigo = your network (same indigo used elsewhere in the app).</div>
        </div>
      </div>
    </div>
  );
}
