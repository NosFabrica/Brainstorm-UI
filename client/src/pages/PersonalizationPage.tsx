import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Home,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  HelpCircle,
  Shield,
  Copy,
  Search,
  ArrowLeft,
  User,
  Telescope,
  Key,
  Radar,
  Fingerprint,
} from "lucide-react";
import { ProfileCardIcon } from "@/components/ProfileCardIcon";
import { TrustRankIcon } from "@/components/TrustRankIcon";
import { AgentIcon } from "@/components/AgentIcon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
import { isAuthRedirecting } from "@/services/api";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import { Footer } from "@/components/Footer";

export default function PersonalizationPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const calcDone = (() => {
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  })();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-personalization">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.18] pointer-events-none" />

      {user && (
        <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-personalization">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="lg:hidden">
                  <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </div>
                <button type="button" className="flex items-center gap-2" onClick={() => navigate("/dashboard")} data-testid="button-brand">
                  <BrainLogo size={28} className="text-indigo-500" />
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</h1>
                </button>
                <div className="hidden lg:flex gap-1" data-testid="row-nav-links">
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                    <Home className="h-4 w-4" /> Dashboard
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/search")} data-testid="button-nav-search">
                    <Search className="h-4 w-4" /> Search
                  </Button>
                  <Button variant="ghost" size="sm" className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} data-testid="button-nav-network">
                    <User className="h-4 w-4" /> Network
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/agentsuite")} data-testid="button-nav-agentsuite">
                    <AgentIcon className="h-4 w-4" />
                    <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent Suite</span>
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-user-menu">
                      <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                        {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" /> : null}
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anonymous"}</p>
                        <button className="flex items-center gap-1 text-xs leading-none text-slate-500 hover:text-indigo-600 transition-colors" onClick={() => { navigator.clipboard.writeText(user.npub); toast({ title: "Copied!", description: "npub copied to clipboard" }); }} data-testid="button-copy-npub">
                          <span>{user.npub.slice(0, 16)}...</span>
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                      <HelpCircle className="mr-2 h-4 w-4" /> <span>FAQ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                      <SettingsIcon className="mr-2 h-4 w-4" /> <span>Settings</span>
                    </DropdownMenuItem>
                    {isAdminPubkey(user?.pubkey) && (
                      <DropdownMenuItem className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                        <Shield className="mr-2 h-4 w-4" /> <span>Admin Dashboard</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-logout">
                      <LogOut className="mr-2 h-4 w-4" /> <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>
      )}

      {user && <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} currentPath={location} navigate={navigate} calcDone={calcDone} user={user} onLogout={handleLogout} isAdmin={isAdminPubkey(user?.pubkey)} />}

      <main className="relative z-10 w-full flex-1 py-8 sm:py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">

          <button
            onClick={() => navigate("/search")}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors mb-6"
            data-testid="button-back-search"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Search
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }} data-testid="text-page-title">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800">
              How Personalization Works
            </span>
          </h1>

          <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-8" data-testid="text-intro">
            Brainstorm indexes over a million nostr profiles and lets you search them by name, bio, NIP-05, or website. But what makes it different is personalization — the ability to rank and filter search results using your own Web of Trust.
          </p>

          <div className="space-y-8">

            <section data-testid="section-pov">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <Telescope className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Two Points of View</h2>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Every search is filtered through a point of view. There are two options:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/70 border border-slate-100">
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
                    <Radar className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">House Point of View</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">The default. Uses trust scores calculated by the operator of this instance. Available to everyone, no sign-in required.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-white/70 border border-slate-100">
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
                    <Fingerprint className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">My Point of View</h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Your personalized perspective. Uses trust scores derived from your Web of Trust. Requires sign-in and a calculated Grapevine.</p>
                  </div>
                </div>
              </div>
            </section>

            <section data-testid="section-trust-scores">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <TrustRankIcon className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>What are Trust Scores?</h2>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">
                Trust scores come from kind 30382 Trusted Assertions — nostr events that encode reputation metrics like WoT Rank, follower count, and GrapeRank influence. These scores are published by a Grapevine calculator and referenced via a kind 10040 Treasure Map.
              </p>
            </section>

            <section data-testid="section-getting-personalized">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <ProfileCardIcon className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Getting Personalized</h2>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                To unlock your personalized point of view:
              </p>
              <div className="space-y-2">
                {[
                  { step: "1", icon: Key, text: "Sign in with a nostr browser extension (NIP-07)" },
                  { step: "2", icon: ProfileCardIcon, text: "Calculate your Grapevine at brainstorm.nosfabrica.com" },
                  { step: "3", icon: SettingsIcon, text: "Visit Settings to sync your scores and configure your filters" },
                  { step: "4", icon: Telescope, text: 'Switch to "My Point of View" from the search page' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3 p-3 rounded-xl bg-white/70 border border-slate-100">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {item.step}
                    </div>
                    <p className="text-sm text-slate-700">{item.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100" data-testid="section-note">
              <p className="text-sm text-slate-600 leading-relaxed">
                Personalization is entirely optional. The house point of view works well for most searches. Your personalized perspective simply lets you see the nostr world through your own trust network.
              </p>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
