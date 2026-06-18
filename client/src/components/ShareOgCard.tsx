import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { BadgeCheck } from "lucide-react";
import { initialsFor } from "@/lib/profileDefaults";
import ogBg from "@assets/generated_images/signup_bg_abstract.webp";

/**
 * The Open Graph preview card for a shared profile (the rich card that should
 * unfurl in Slack/X/iMessage). Clean, light, enterprise look — a subtle abstract
 * backdrop behind a white wash (matching the post-signup setup card) with dark,
 * readable text. This is the visual the share modal previews and the design the
 * backend team mirrors server-side. ~1.91:1 (1200×630) aspect.
 */
export function ShareOgCard({
  displayName,
  picture,
  nip05,
}: {
  displayName: string;
  picture?: string;
  nip05?: string;
}) {
  return (
    <div
      className="relative w-full aspect-[1200/630] rounded-xl overflow-hidden bg-white border border-[#7c86ff]/20"
      style={{ containerType: "inline-size" }}
    >
      {/* object-left-top crops the bottom-right corner (where the source image's
          AI watermark sits); the near-opaque white wash keeps it light + subtle. */}
      <img src={ogBg} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-left-top scale-110" />
      <div className="absolute inset-0 bg-gradient-to-br from-white/88 via-white/92 to-white/99" />
      <div className="relative h-full w-full flex flex-col justify-between p-[5%]">
        <div className="flex items-center gap-2">
          <BrainLogo size={22} className="text-[#333286]" />
          <span className="text-[3.2cqw] font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
        </div>
        <div className="flex items-center gap-[4%]">
          <Avatar className="h-[26cqw] w-[26cqw] rounded-2xl border-2 border-white shadow-lg bg-white">
            {picture ? <AvatarImage src={picture} alt={displayName} className="object-cover" /> : null}
            <AvatarFallback className="rounded-2xl bg-indigo-100 text-indigo-700 font-bold text-[8cqw]" style={{ fontFamily: "var(--font-display)" }}>
              {initialsFor(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-[6.5cqw] font-bold leading-tight truncate text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{displayName}</div>
            {nip05 && (
              <div className="flex items-center gap-1 text-[3.4cqw] text-sky-600 font-medium mt-1">
                <BadgeCheck className="h-[3.4cqw] w-[3.4cqw]" /> {nip05.replace(/^_@/, "")}
              </div>
            )}
          </div>
        </div>
        <div className="text-[3cqw] text-[#333286]/80 font-semibold">View their Web of Trust profile on Brainstorm</div>
      </div>
    </div>
  );
}
