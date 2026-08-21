import { useState } from "react";
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
import { useShareUrl } from "@/hooks/useShareUrl";
import { useTheme } from "@/lib/theme";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { logout } from "@/accounts/login-flow";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";

/**
 * The palette itself — every destination and action it can run. Its own
 * download: only a reader who actually opens it pays for the list.
 */
export function CommandPaletteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [, navigate] = useLocation();
  const { choice, setChoice } = useTheme();
  const user = useActiveAccountDisplay();
  const { toast } = useToast();
  const isAdmin = user?.isAdmin === true;

  // Close first, then run — so navigations/modals land after the dialog unmounts.
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const copyNpub = async () => {
    if (!user) return;
    await copyToClipboard(user.npub);
    toast({ title: "Copied!", description: "npub copied to clipboard" });
  };

  const inviteUrl = useShareUrl({ npub: user?.npub ?? "", enabled: inviteOpen });

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
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
              <CommandItem keywords={["follows", "network", "web of trust", "connections"]} onSelect={() => run(() => navigate("/network"))}>
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
