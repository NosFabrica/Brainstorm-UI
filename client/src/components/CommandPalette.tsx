import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Home,
  Users,
  UserCircle,
  UserPlus,
  Copy,
  Settings as SettingsIcon,
  HelpCircle,
  Info,
  Code2,
  Shield,
  LogOut,
  Monitor,
  Sun,
  Moon,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { useTheme } from "@/lib/theme";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { logout } from "@/services/nostr";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";

/** Fire from anywhere (e.g. a header button) to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

/**
 * Global command palette — a keyboard-first launcher (⌘K / Ctrl-K) mounted once
 * at the app root. Fuzzy-search to any destination, run quick actions (invite,
 * copy npub, switch theme), or sign out, without reaching for the mouse. This is
 * the power-user spine of the app; the dropdown menu remains for discovery.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [, navigate] = useLocation();
  const { choice, setChoice } = useTheme();
  const user = useActiveAccountDisplay();
  const { toast } = useToast();
  const isAdmin = user?.isAdmin === true;

  // ⌘K / Ctrl-K toggles the palette anywhere; a custom event opens it (so a
  // visible trigger can be wired later without importing this component's state).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Close first, then run — so navigations/modals land after the dialog unmounts.
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const copyNpub = async () => {
    if (!user) return;
    await copyToClipboard(user.npub);
    toast({ title: "Copied!", description: "npub copied to clipboard" });
  };

  const inviteUrl =
    typeof window !== "undefined" && user?.npub ? `${window.location.origin}/p/${user.npub}` : "";

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search or jump to…  (type a page or action)" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>

          <CommandGroup heading="Go to">
            <CommandItem keywords={["home", "find", "people"]} onSelect={() => run(() => navigate("/"))}>
              <Search /> Search
              <CommandShortcut>Home</CommandShortcut>
            </CommandItem>
            {user && (
              <CommandItem keywords={["scores", "trust"]} onSelect={() => run(() => navigate("/dashboard"))}>
                <Home /> Dashboard
              </CommandItem>
            )}
            {user && (
              <CommandItem keywords={["follows", "web of trust", "connections"]} onSelect={() => run(() => navigate("/network"))}>
                <Users /> Network
              </CommandItem>
            )}
            {user && (
              <CommandItem keywords={["public", "me"]} onSelect={() => run(() => navigate(`/p/${user.npub}`))}>
                <UserCircle /> View profile
              </CommandItem>
            )}
            {user && (
              <CommandItem keywords={["preferences", "account", "appearance"]} onSelect={() => run(() => navigate("/settings"))}>
                <SettingsIcon /> Settings
              </CommandItem>
            )}
            <CommandItem keywords={["help", "support", "questions"]} onSelect={() => run(() => navigate("/faq"))}>
              <HelpCircle /> Help &amp; FAQ
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate("/about"))}>
              <Info /> About
            </CommandItem>
            <CommandItem keywords={["api", "nip-50", "build"]} onSelect={() => run(() => navigate("/developers"))}>
              <Code2 /> Developers
            </CommandItem>
          </CommandGroup>

          {user && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem keywords={["share", "colleagues"]} onSelect={() => run(() => setInviteOpen(true))}>
                  <UserPlus /> Invite friends
                </CommandItem>
                <CommandItem keywords={["public key", "address", "id"]} onSelect={() => run(copyNpub)}>
                  <Copy /> Copy npub
                </CommandItem>
                {isAdmin && (
                  <CommandItem keywords={["admin", "console"]} onSelect={() => run(() => navigate("/admin"))}>
                    <Shield /> Admin Dashboard
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Appearance">
            <CommandItem keywords={["auto", "os"]} onSelect={() => run(() => setChoice("system"))}>
              <Monitor /> System theme
              {choice === "system" && <CommandShortcut>Active</CommandShortcut>}
            </CommandItem>
            <CommandItem keywords={["day"]} onSelect={() => run(() => setChoice("light"))}>
              <Sun /> Light theme
              {choice === "light" && <CommandShortcut>Active</CommandShortcut>}
            </CommandItem>
            <CommandItem keywords={["night"]} onSelect={() => run(() => setChoice("dark"))}>
              <Moon /> Dark theme
              {choice === "dark" && <CommandShortcut>Active</CommandShortcut>}
            </CommandItem>
          </CommandGroup>

          {user && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Account">
                <CommandItem
                  keywords={["log out", "exit"]}
                  className="text-red-600 data-[selected=true]:text-red-600 dark:text-red-400 dark:data-[selected=true]:text-red-400"
                  onSelect={() => run(() => { logout(); navigate("/"); })}
                >
                  <LogOut /> Sign out
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      {user && (
        <ShareProfileModal
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          invite
          npub={user.npub}
          displayName={user.displayName || "You"}
          picture={user.picture}
          nip05={user.nip05}
          canonicalUrl={inviteUrl}
        />
      )}
    </>
  );
}
