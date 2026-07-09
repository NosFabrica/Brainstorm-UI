import type { ExternalIdentity, IdentityIcon } from "@/lib/externalIdentity";
import { Link as LinkIcon } from "lucide-react";
import {
  SiGithub,
  SiX,
  SiTelegram,
  SiMastodon,
  SiLinkedin,
  SiYoutube,
  SiSignal,
  SiBluesky,
  SiFacebook,
  SiTiktok,
  SiInstagram,
} from "react-icons/si";

// Accurate official brand marks (Simple Icons), monochrome via currentColor so
// they stay subtle + cohesive with the rest of the profile's link row.
function Glyph({ icon }: { icon: IdentityIcon }) {
  const cls = "h-4 w-4";
  switch (icon) {
    case "github": return <SiGithub className={cls} aria-hidden="true" />;
    case "x": return <SiX className={cls} aria-hidden="true" />;
    case "telegram": return <SiTelegram className={cls} aria-hidden="true" />;
    case "mastodon": return <SiMastodon className={cls} aria-hidden="true" />;
    case "linkedin": return <SiLinkedin className={cls} aria-hidden="true" />;
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
 * The NIP-39 external-account row: subtle, clickable platform icons (GitHub, X,
 * Telegram, Mastodon, …) that link to the linked account. Displayed as links —
 * NOT presented as cryptographically verified — so it sits inline with the
 * profile's other links (website, lightning).
 */
export function ExternalIdentities({ identities }: { identities: ExternalIdentity[] }) {
  if (!identities.length) return null;
  return (
    <>
      {identities.map((id) => {
        const title = `${id.label}: ${id.identity}`;
        const cls = "inline-flex items-center text-slate-400 transition-colors hover:text-[#3730a3]";
        return id.url ? (
          <a key={`${id.platform}:${id.identity}`} href={id.url} target="_blank" rel="noopener noreferrer" title={title} aria-label={title} className={cls} data-testid="profile-identity">
            <Glyph icon={id.icon} />
          </a>
        ) : (
          <span key={`${id.platform}:${id.identity}`} title={title} aria-label={title} className="inline-flex items-center text-slate-400" data-testid="profile-identity">
            <Glyph icon={id.icon} />
          </span>
        );
      })}
    </>
  );
}
