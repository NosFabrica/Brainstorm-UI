/**
 * The Account's trust preset in Settings: the server's, overlaid by the one
 * just picked until the save settles. A save that lands offers — never
 * demands — a recalculation in its toast, since the published assertions keep
 * the old preset until the next run; one that fails puts the previous back.
 */
import { useCallback, useState } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useSetTrustPreset, useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { queryClient } from "@/lib/queryClient";
import { presetDisplayLabel, presetDisplayLabelFromBackend, type TrustPreset } from "@/services/trustThreshold";

export function useTrustPresetChoice(pubkey: string | undefined, enabled: boolean, onRecalculate: () => void) {
  const { toast } = useToast();
  const { preset: serverPreset, isLoading: presetLoading } = useTrustPresetSync(enabled);
  const [optimisticPreset, setOptimisticPreset] = useState<TrustPreset | null>(null);
  const activePreset: TrustPreset = optimisticPreset ?? serverPreset ?? "default";

  const setPresetMutation = useSetTrustPreset({
    pubkey,
    onMutate: (preset) => {
      const previous = optimisticPreset;
      setOptimisticPreset(preset);
      return { previous };
    },
    onSettledOk: (preset) => {
      setOptimisticPreset(null);
      const lastResult = queryClient.getQueryData<{ data?: { graperank_preset_used?: string } }>([
        "/user/graperankResult",
      ]);
      const previousUsedLabel = presetDisplayLabelFromBackend(lastResult?.data?.graperank_preset_used);
      const newLabel = presetDisplayLabel(preset);
      const description = previousUsedLabel
        ? `Your pages use ${newLabel} now. Published numbers still reflect ${previousUsedLabel} until your next calculation.`
        : `Your pages use ${newLabel} now.`;
      // Offer — never demand — a recalculation. The switch already worked
      // in-app (every preset-driven read was just invalidated), so a blocking
      // "are you sure?" would imply it hadn't, and would punish the
      // flip-and-compare loop these three buttons invite. But the published
      // Trusted Assertions — the numbers OTHER apps show — keep the old preset
      // until the next run, which on the free schedule can be 60 days out.
      // One click in the toast closes that gap at the moment of highest
      // intent, and manual recalculation is unlimited so it costs nothing.
      toast({
        title: "Trust perspective updated",
        description,
        duration: 8000,
        action: (
          <ToastAction altText="Recalculate now" onClick={() => onRecalculate()} data-testid="toast-recalc-now">
            Recalculate now
          </ToastAction>
        ),
      });
    },
    onError: (error, _preset, context) => {
      setOptimisticPreset((context as { previous?: TrustPreset } | undefined)?.previous ?? null);
      toast({
        variant: "destructive",
        title: "Couldn't save preset",
        description: error instanceof Error ? error.message : "Please try again.",
        duration: 5000,
      });
    },
  });

  const handlePresetChange = useCallback(
    (preset: TrustPreset) => {
      if (preset === activePreset || setPresetMutation.isPending) return;
      setPresetMutation.mutate(preset);
    },
    [activePreset, setPresetMutation],
  );

  return { serverPreset, presetLoading, activePreset, setPresetMutation, handlePresetChange };
}

export type TrustPresetChoice = ReturnType<typeof useTrustPresetChoice>;
