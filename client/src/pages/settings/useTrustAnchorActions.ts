/**
 * The two Service Provider actions in Settings › Trust › Advanced: re-sign and
 * republish the Account's kind-10040 naming Brainstorm, or deactivate it. Each
 * runs idle → signing → publishing → success | error; a failed publish keeps a
 * retry that resends the same signed event, a declined signature returns to
 * idle. `services/trustAnchor` does the signing and publishing.
 */
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  deactivateBrainstormTrustAnchor,
  publishBrainstormTrustAnchor,
  type TrustAnchorPublishResult,
} from "@/services/trustAnchor";

export type TrustAnchorActionState = "idle" | "signing" | "publishing" | "success" | "error";

export function useTrustAnchorActions(userPubkey: string | undefined, taPubkey: string | null) {
  const { toast } = useToast();
  const [republishState, setRepublishState] = useState<TrustAnchorActionState>("idle");
  const [republishError, setRepublishError] = useState("");
  const [deactivateState, setDeactivateState] = useState<TrustAnchorActionState>("idle");
  const [deactivateError, setDeactivateError] = useState("");
  const [republishRetry, setRepublishRetry] = useState<(() => Promise<TrustAnchorPublishResult>) | null>(null);
  const [deactivateRetry, setDeactivateRetry] = useState<(() => Promise<TrustAnchorPublishResult>) | null>(null);

  const handleRepublishNip85 = async () => {
    setRepublishState("signing");
    setRepublishError("");
    setRepublishRetry(null);

    if (!userPubkey) {
      setRepublishState("error");
      setRepublishError("Not logged in.");
      return;
    }

    if (!taPubkey) {
      setRepublishState("error");
      setRepublishError("Service key not available. Please wait for data to load and try again.");
      return;
    }

    await showRepublishResult(await publishBrainstormTrustAnchor(userPubkey, taPubkey, setRepublishState));
  };

  const showRepublishResult = async (result: TrustAnchorPublishResult) => {
    if (result.status === "success") {
      setRepublishState("success");
      toast({
        title: "NIP-85 event updated",
        description: "Your service provider declaration has been re-published.",
        duration: 4000,
      });
      setTimeout(() => setRepublishState("idle"), 3000);
    } else if (result.status === "cancelled") {
      setRepublishState("idle");
      if (result.message)
        toast({ variant: "destructive", title: "Couldn't sign", description: result.message, duration: 3000 });
    } else {
      setRepublishState("error");
      setRepublishError(result.message);
      setRepublishRetry(() => result.retry ?? null);
    }
  };

  const retryRepublish = async () => {
    if (!republishRetry) return;
    setRepublishState("publishing");
    setRepublishError("");
    await showRepublishResult(await republishRetry());
  };

  const handleDeactivateNip85 = async () => {
    setDeactivateState("signing");
    setDeactivateError("");
    setDeactivateRetry(null);

    if (!userPubkey) {
      setDeactivateState("error");
      setDeactivateError("Not logged in.");
      return;
    }

    if (!taPubkey) {
      setDeactivateState("error");
      setDeactivateError("Service key not available. Please wait for data to load and try again.");
      return;
    }

    await showDeactivateResult(await deactivateBrainstormTrustAnchor(userPubkey, taPubkey, setDeactivateState));
  };

  const showDeactivateResult = async (result: TrustAnchorPublishResult) => {
    if (result.status === "success") {
      setDeactivateState("success");
      toast({
        title: "Provider deactivated",
        description: "Brainstorm no longer publishes your scores for other apps to use.",
        duration: 4000,
      });
      setTimeout(() => {
        setDeactivateState("idle");
        window.location.reload();
      }, 2000);
    } else if (result.status === "cancelled") {
      setDeactivateState("idle");
      if (result.message)
        toast({ variant: "destructive", title: "Couldn't sign", description: result.message, duration: 3000 });
    } else {
      setDeactivateState("error");
      setDeactivateError(result.message);
      setDeactivateRetry(() => result.retry ?? null);
    }
  };

  const retryDeactivate = async () => {
    if (!deactivateRetry) return;
    setDeactivateState("publishing");
    setDeactivateError("");
    await showDeactivateResult(await deactivateRetry());
  };

  return {
    republishState,
    republishError,
    republishRetry,
    handleRepublishNip85,
    retryRepublish,
    deactivateState,
    deactivateError,
    deactivateRetry,
    handleDeactivateNip85,
    retryDeactivate,
  };
}

export type TrustAnchorActions = ReturnType<typeof useTrustAnchorActions>;
