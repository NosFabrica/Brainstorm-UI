import { getCurrentUser } from "@/services/nostr";
import { extractAdminFlag } from "@/lib/jwt";

export function isAdminPubkey(pubkey: string | undefined | null): boolean {
  if (!pubkey) return false;
  const user = getCurrentUser();
  if (user && user.pubkey === pubkey) {
    if (user.isAdmin !== undefined) {
      return user.isAdmin;
    }
    const token = localStorage.getItem("brainstorm_session_token");
    if (token) {
      return extractAdminFlag(token);
    }
  }
  return false;
}
