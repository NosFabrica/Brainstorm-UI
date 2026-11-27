import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { useSocialActions } from "@/hooks/useSocialActions";

/** A Network row's Follow / Unfollow / Mute / Unmute, each saying how it went (a declined unlock says nothing). */
export function useRowSocialActions(social: ReturnType<typeof useSocialActions>) {
  const { toast } = useToast();
  const handleSocialFollow = useCallback(
    async (pk: string) => {
      const result = await social.follow(pk);
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Followed", description: "Added to your contact list" });
      else
        toast({
          title: "Error",
          description: result.error || "Follow failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialUnfollow = useCallback(
    async (pk: string) => {
      const result = await social.unfollow(pk);
      if (result.cancelled) return result;
      if (result.success)
        toast({
          title: "Unfollowed",
          description: "Removed from your contact list",
        });
      else
        toast({
          title: "Error",
          description: result.error || "Unfollow failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialMute = useCallback(
    async (pk: string) => {
      const result = await social.mute(pk);
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Muted", description: "Added to your mute list" });
      else
        toast({
          title: "Error",
          description: result.error || "Mute failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialUnmute = useCallback(
    async (pk: string) => {
      const result = await social.unmute(pk);
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Unmuted", description: "Removed from your mute list" });
      else
        toast({
          title: "Error",
          description: result.error || "Unmute failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  return { handleSocialFollow, handleSocialUnfollow, handleSocialMute, handleSocialUnmute };
}
