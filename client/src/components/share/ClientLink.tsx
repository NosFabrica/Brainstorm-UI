/**
 * A Primal pretty URL in a note, rendered as what it names: the article
 * (the same card an `a` tag gets), or the person (the same mention an npub
 * gets). While the name resolves — and if it never does — the link stays the
 * chip it always was.
 */
import { LinkChip } from "@/components/share/LinkPreview";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { ProfileMention } from "@/components/share/ProfileMention";
import { primalRef } from "@/lib/clientLinks";
import { useClientLink } from "@/hooks/useClientLink";
import type { MinimalEvent } from "@/lib/noteRefs";

export function ClientLink({ url }: { url: string }) {
  const { entity } = useClientLink(primalRef(url));
  if (entity?.kind === "article") return <EmbeddedArticleCard event={entity.event as MinimalEvent} author={entity.author} />;
  if (entity?.kind === "profile") {
    const name = entity.profile?.display_name || entity.profile?.name;
    return <ProfileMention npub={entity.npub} name={name} picture={entity.profile?.picture} />;
  }
  return <LinkChip url={url} />;
}
