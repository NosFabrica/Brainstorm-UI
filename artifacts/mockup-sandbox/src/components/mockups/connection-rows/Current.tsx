type Row = {
  id: string;
  name: string;
  handle: string;
  initial: string;
  avatarBg: string;
  pills: Array<"following" | "mutual" | "shared_follower" | "shared_following">;
  score: number;
};

const ROWS: Row[] = [
  { id: "joe", name: "Joe Martin", handle: "joe@nostrplebs.com", initial: "J", avatarBg: "bg-emerald-100 text-emerald-700",
    pills: ["following", "mutual", "shared_following"], score: 99 },
  { id: "dawn", name: "Dawn", handle: "dawn@spatia-arcana.com", initial: "D", avatarBg: "bg-rose-100 text-rose-700",
    pills: ["following", "mutual", "shared_follower", "shared_following"], score: 92 },
  { id: "contra", name: "Contra", handle: "reformedsaint@zaps.lol", initial: "C", avatarBg: "bg-slate-200 text-slate-700",
    pills: ["shared_follower"], score: 70 },
  { id: "tk", name: "TK", handle: "ti@tk21.co", initial: "T", avatarBg: "bg-indigo-100 text-indigo-700",
    pills: ["following", "mutual"], score: 100 },
  { id: "terry", name: "Terry Yiu", handle: "_@tyiu.xyz", initial: "T", avatarBg: "bg-amber-100 text-amber-700",
    pills: [], score: 99 },
  { id: "satoshi", name: "Satoshi's Apostles", handle: "(no nip-05)", initial: "S", avatarBg: "bg-orange-100 text-orange-700",
    pills: ["shared_follower"], score: 2 },
];

const PILL = {
  following:       { label: "Following",        cls: "bg-blue-50 text-blue-600 border-blue-100" },
  mutual:          { label: "Mutual",           cls: "bg-teal-50 text-teal-600 border-teal-100" },
  shared_follower: { label: "Shared Follower",  cls: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  shared_following:{ label: "Shared Following", cls: "bg-indigo-50 text-indigo-600 border-indigo-100" },
} as const;

export function Current() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Current
          </div>
          <h2 className="mt-2 text-base font-bold text-slate-800">Verified Followers — Jon Gordon</h2>
          <p className="text-xs text-slate-500">Today's layout: 4 word-pills sit in one row. "Mutual" is redundant with "Following", and "Shared Follower" vs "Shared Following" sound identical.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {ROWS.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${row.avatarBg}`}>
                {row.initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{row.name}</div>
                <div className="text-xs text-indigo-600 truncate">{row.handle}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {row.pills.map((p) => (
                  <span key={p} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PILL[p].cls}`}>
                    {PILL[p].label}
                  </span>
                ))}
              </div>
              <div className="shrink-0 w-10 text-right text-sm font-bold text-slate-800 tabular-nums">{row.score}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-[11px] text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-500">Problems users hit:</span> "Mutual" duplicates the info in "Following"; "Shared Follower" and "Shared Following" use the same word "shared" but describe opposite directions; nothing visually separates "Jon's relationship" from "your relationship".
        </div>
      </div>
    </div>
  );
}
