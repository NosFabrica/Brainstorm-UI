import type { ExternalIdentity, IdentityIcon } from "@/lib/externalIdentity";
import { Link as LinkIcon } from "lucide-react";
import {
  SiGithub,
  SiX,
  SiTelegram,
  SiMastodon,
  SiYoutube,
  SiSignal,
  SiBluesky,
  SiFacebook,
  SiTiktok,
  SiInstagram,
} from "react-icons/si";
// LinkedIn was removed from Simple Icons (brand policy) and is no longer
// exported by react-icons/si, so its official mark comes from Font Awesome.
import { FaLinkedin } from "react-icons/fa";

// Accurate official brand marks (Simple Icons), monochrome via currentColor so
// they stay subtle + cohesive with the rest of the profile's link row.
function Glyph({ icon }: { icon: IdentityIcon }) {
  const cls = "h-3.5 w-3.5";
  switch (icon) {
    case "github": return <SiGithub className={cls} aria-hidden="true" />;
    case "x": return <SiX className={cls} aria-hidden="true" />;
    case "telegram": return <SiTelegram className={cls} aria-hidden="true" />;
    case "mastodon": return <SiMastodon className={cls} aria-hidden="true" />;
    case "linkedin": return <FaLinkedin className={cls} aria-hidden="true" />;
    case "youtube": return <SiYoutube className={cls} aria-hidden="true" />;
    case "signal": return <SiSignal className={cls} aria-hidden="true" />;
    case "bluesky": return <SiBluesky className={cls} aria-hidden="true" />;
    case "facebook": return <SiFacebook className={cls} aria-hidden="true" />;
    case "tiktok": return <SiTiktok className={cls} aria-hidden="true" />;
    case "instagram": return <SiInstagram className={cls} aria-hidden="true" />;
    default: return <LinkIcon className={cls} aria-hidden="true" />;
  }
}

/**
 * The NIP-39 linked accounts (GitHub, X, Telegram, Mastodon, …), one row
 * each: the platform's mark, its name, and the handle — so a reader sees
 * WHICH account, not a mystery glyph (the icon-only strip was the
 * complaint). Displayed as links — NOT presented as cryptographically
 * verified — with the profile's other facts (website, lightning).
 */
export function ExternalIdentities({ identities }: { identities: ExternalIdentity[] }) {
  if (!identities.length) return null;
  const row = "flex items-center gap-1.5 min-w-0 text-xs text-slate-600 dark:text-slate-300";
  return (
    <>
      {identities.map((id) => {
        const title = `${id.label}: ${id.identity}`;
        const body = (
          <>
            <span className="shrink-0 text-slate-400 dark:text-slate-500"><Glyph icon={id.icon} /></span>
            <span className="truncate">
              {id.label} · {id.identity}
            </span>
          </>
        );
        return id.url ? (
          <a key={`${id.platform}:${id.identity}`} href={id.url} target="_blank" rel="noopener noreferrer" title={title} className={`${row} hover:text-brand-link transition-colors`} data-testid="profile-identity">
            {body}
          </a>
        ) : (
          <span key={`${id.platform}:${id.identity}`} title={title} className={row} data-testid="profile-identity">
            {body}
          </span>
        );
      })}
    </>
  );
}
