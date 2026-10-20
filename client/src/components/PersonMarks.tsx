/**
 * Beside a person's name: the marks of their own things the kinds list — a
 * GitHub account their handle owns, say (hooks/useListKinds PersonMark). Each
 * kind draws its own, or nothing; search names no concept (ADR 0007).
 */
import { useListKinds } from "@/hooks/useListKinds";

export function PersonMarks({ pubkey, nip05, inRow = false }: { pubkey: string; nip05?: string; inRow?: boolean }) {
  const kinds = useListKinds();
  return (
    <>{kinds.map((k) => k.PersonMark && <k.PersonMark key={k.key} pubkey={pubkey} nip05={nip05} inRow={inRow} />)}</>
  );
}
