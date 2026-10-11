import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDraftTemplates } from "@/hooks/draftTemplates";
import { fetchAvailableTemplates, fetchTemplates } from "@/services/linkTemplates";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import type { LinkRef } from "@/lib/linkTemplates";
import type { CopyDraft } from "@/lib/conceptCopy";
import { draftTemplateProblems, templatesToPublish } from "@/lib/templateDrafts";

/**
 * The templates a definition's links pin (services/linkTemplates). A
 * template drafted in the form (hooks/draftTemplates) answers from there; only
 * the rest are asked of the relays.
 */
export function useLinkTemplates(refs: LinkRef[]) {
  const drafts = useDraftTemplates();
  const wanted = [...new Set(refs.map((r) => r.templateId))].sort();
  const ids = wanted.filter((id) => !drafts.has(id));
  const query = useQuery({
    queryKey: ["link-templates", ids.join(",")],
    queryFn: () => fetchTemplates(refs.filter((r) => !drafts.has(r.templateId))),
    enabled: ids.length > 0,
    // An id names one frozen event: nothing to refresh.
    staleTime: Infinity,
  });
  const drafted = wanted.filter((id) => drafts.has(id));
  const draftedKey = drafted.join(",");
  const data = useMemo(
    () =>
      drafted.length
        ? new Map([...(query.data ?? new Map()), ...drafted.map((id) => [id, drafts.get(id)!] as const)])
        : query.data,
    // `draftedKey` is `drafted`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, drafts, draftedKey],
  );
  return drafted.length ? { ...query, data } : query;
}

/** The URL templates the link picker offers: the reader's governing URL Templates list. */
export function useAvailableTemplates(enabled = true) {
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  return useQuery({
    queryKey: ["link-templates", "available", pubkey, taPubkey],
    queryFn: () => fetchAvailableTemplates({ pubkey, taPubkey }),
    enabled: enabled && settled,
    staleTime: 5 * 60_000,
  });
}

/**
 * What stops a draft's new URL templates being published (lib/templateDrafts),
 * checked against the ones that exist — so it waits for them: a template
 * that's already there mustn't be published again for want of looking.
 */
export function useDraftTemplateProblems(draft: CopyDraft, enabled = true): string[] {
  const available = useAvailableTemplates(enabled);
  if (!templatesToPublish(draft).length) return [];
  if (available.isPending) return ["Checking the URL templates that already exist…"];
  return draftTemplateProblems(draft, available.data ?? []);
}
