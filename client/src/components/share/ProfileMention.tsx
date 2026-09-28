/**
 * A person named inline in a note — an npub mention, or a Primal profile link
 * — as `@Name`, opening their profile through the share page's navigation.
 */
import { useShareNav } from "@/components/share/ShareNavContext";

export function ProfileMention({ npub, name, picture }: { npub: string; name?: string; picture?: string }) {
  const requestNav = useShareNav();
  const label = name ? `@${name}` : `@${npub.slice(0, 10)}…`;
  return (
    <button
      type="button"
      onClick={() => requestNav({ kind: "profile", target: npub, label: name || npub.slice(0, 12) + "…", picture })}
      className="text-brand-link font-medium hover:underline"
    >
      {label}
    </button>
  );
}
