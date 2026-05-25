import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MobileMenu } from "@/components/MobileMenu";
import {
  closeMobileMenu,
  useMobileMenuOpen,
} from "@/lib/mobileMenuStore";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { isAdminPubkey } from "@/config/adminAccess";
import { USER_CHANGED_EVENT } from "@/lib/assistantStorage";

export function MobileMenuHost() {
  const open = useMobileMenuOpen();
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(() => getCurrentUser());

  useEffect(() => {
    setUser(getCurrentUser());
  }, [location]);

  useEffect(() => {
    const refresh = () => setUser(getCurrentUser());
    window.addEventListener(USER_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(USER_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [navigate]);

  const calcDone =
    typeof window !== "undefined" &&
    window.localStorage.getItem("brainstorm_calc_completed") === "true";

  return (
    <MobileMenu
      open={open}
      onClose={closeMobileMenu}
      currentPath={location}
      navigate={navigate}
      calcDone={calcDone}
      user={
        user
          ? {
              displayName: user.displayName,
              npub: user.npub,
              picture: user.picture,
              pubkey: user.pubkey,
            }
          : null
      }
      onLogout={handleLogout}
      isAdmin={isAdminPubkey(user?.pubkey)}
    />
  );
}
