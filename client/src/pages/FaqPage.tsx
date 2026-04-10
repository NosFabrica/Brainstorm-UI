import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Home,
  LogOut,
  Menu,
  X,
  Settings as SettingsIcon,
  BookOpen,
  Search,
  Users,
  HelpCircle,
  ChevronDown,
  ArrowLeft,
  Shield,
  Copy,
  Bot,
} from "lucide-react";
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
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
import { isAuthRedirecting } from "@/services/api";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";

const userFaqs = [
  {
    question: "What does my trust score mean?",
    answer: "Your trust score reflects how connected and trusted you are within your personal network. It's calculated using GrapeRank, which looks at who follows you, who those people trust, and how that trust flows through your network. A score of 0.50 or higher means you're highly trusted by the people in your graph. It's not a universal rating — it's specific to each observer's point of view.",
  },
  {
    question: "What do the trust tiers mean?",
    answer: "Highly Trusted (50%+) means strong trust signal from multiple paths in your network. Trusted (20–49%) means solid connections with meaningful trust flow. Neutral (7–19%) means known in your network but without strong signal either way. Low Trust (below 7%, above your verified threshold) means minimal trust signal, on the edges of your network. Unverified (below your verified threshold) means no meaningful trust data available yet. You can adjust the verified threshold in Settings — choosing Relax (0%), Default (2%), or Strict (15%). These tiers are relative to your network — someone Highly Trusted to you might be Neutral to someone else.",
  },
  {
    question: 'What does "Flagged" mean?',
    answer: "A flagged account has a trust score below the verified threshold AND has been reported by 2 or more of your trusted contacts. Think of it as a community signal — people you trust have independently identified this account as potentially problematic. It's not a ban — it's information for you to make your own decision.",
  },
  {
    question: "How does GrapeRank calculate trust?",
    answer: "GrapeRank is a graph-based algorithm that propagates trust through your social network. Starting from you (the observer), it follows connections outward — your follows, their follows, and so on. Each hop reduces the trust signal (attenuation), and negative signals like mutes and reports reduce scores further. The result is a personalized trust map unique to your perspective.",
  },
  {
    question: "Why is my score different from what someone else sees?",
    answer: "Every score is calculated from the observer's point of view. Your network is different from everyone else's, so the trust paths are different. This is by design — there's no central authority deciding who is trusted. You are your own trust anchor.",
  },
  {
    question: 'What are "hops" in the Network Health chart?',
    answer: "Hops represent degrees of separation. Hop 1 is your direct connections (people you follow). Hop 2 is people they follow. Hop 3 goes one step further, and so on. The slider lets you expand or narrow how far into the network you're looking.",
  },
  {
    question: "Can I change how my trust scores are calculated?",
    answer: "You can adjust your verified threshold in Settings — this controls the cutoff between Low Trust and Unverified tiers. Choose Relax (0%), Default (2%), or Strict (15%), or set a custom value. Your scores update when you run a new GrapeRank calculation from the Dashboard.",
  },
];

const devFaqs = [
  {
    question: "What is NIP-85?",
    answer: "NIP-85 (Trust Attestations) is a Nostr protocol extension that defines how trust signals are published and consumed. It allows any Nostr client to read and write trust data in a standard format, making trust portable across the ecosystem.",
  },
  {
    question: "What does it take to get my client listed on Brainstorm?",
    answer: "Your client needs to implement NIP-85 Trust Attestations with full support for observer-relative trust. This means: (1) Trust Anchor selection — users must be able to choose their own Trust Anchor. Hardwiring a single Trust Anchor defeats the purpose of decentralized trust. (2) Score consumption — your client reads Trust Attestation events and uses them to filter, sort, or annotate content and profiles. (3) Observer-relative display — scores should be presented as relative to the viewing user, not as universal ratings.",
  },
  {
    question: "What's the difference between full and partial NIP-85 support?",
    answer: "Full support means users can select their Trust Anchor, and scores are observer-relative. Partial support typically means the client hardwires a single Trust Anchor, showing one point of view as if it were \"the\" trust score. Partial implementations are a good starting point, but they miss the key value of NIP-85: that trust is personal and pluralistic.",
  },
  {
    question: "Why does Trust Anchor selection matter?",
    answer: "The Trust Anchor is the service that computes trust scores using a specific algorithm (like GrapeRank). Different Trust Anchors may use different algorithms, different parameters, or weigh different signals. Letting users choose their Trust Anchor means they control whose math they trust — which is the entire point of sovereign trust. A client that hardwires a single TA is essentially making that choice for the user.",
  },
  {
    question: "How do I integrate with Brainstorm as a Trust Anchor?",
    answer: "Brainstorm publishes Trust Attestation events (NIP-85) to Nostr relays. Your client can: (1) Query for kind 30382 events from the Brainstorm Trust Anchor pubkey. (2) Parse the attestation data to get trust scores for profiles. (3) Display scores in your UI relative to the observing user. Visit nosfabrica.com for integration guidance and to get your client reviewed for listing.",
  },
  {
    question: "Can my client use a different trust algorithm?",
    answer: "Absolutely. NIP-85 is algorithm-agnostic. Brainstorm uses GrapeRank, but any Trust Anchor can implement any algorithm. The protocol defines how scores are published, not how they're computed. This is a feature, not a bug — algorithmic diversity strengthens the ecosystem.",
  },
];

export default function FaqPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const { toast } = useToast();

  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get("tab") === "developers" ? "developers" : "users";
  const [activeTab, setActiveTab] = useState<"users" | "developers">(initialTab);

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser(u);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleTabChange = (tab: "users" | "developers") => {
    setActiveTab(tab);
    setExpandedFaq(null);
    const url = new URL(window.location.href);
    if (tab === "developers") {
      url.searchParams.set("tab", "developers");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", url.toString());
  };

  const faqs = activeTab === "users" ? userFaqs : devFaqs;

  if (isAuthRedirecting()) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-faq">
      <PageBackground />

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(user ? "/dashboard" : "/")}>
                <BrainLogo size={28} className="text-indigo-500" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                  Brainstorm
                </h1>
              </div>
              {user && (
                <div className="hidden lg:flex gap-1">
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/search")} data-testid="button-nav-search">
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/network")} data-testid="button-nav-network">
                    <Users className="h-4 w-4" />
                    Network
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/panel")} data-testid="button-nav-panel">
                    <Bot className="h-4 w-4" />
                    Agent HQ
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-user-menu">
                      <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                        {user.picture ? (
                          <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                          {user.displayName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:flex flex-col items-start mr-2">
                        <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                        <span className="text-xs text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20">
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
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>FAQ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    {isAdminPubkey(user?.pubkey) && (
                      <DropdownMenuItem className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Dashboard</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/")}
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentPath={location}
        navigate={navigate}
        user={user}
        onLogout={handleLogout}
        isAdmin={isAdminPubkey(user?.pubkey)}
      />

      <main className="flex-1 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="space-y-6 animate-fade-up">
            <div className="space-y-2" data-testid="section-faq-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit" data-testid="badge-faq">
                <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Brainstorm FAQ</p>
              </div>
              <h1
                className="text-3xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-faq-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Frequently Asked Questions
                </span>
              </h1>
              <p className="text-slate-600 font-medium" data-testid="text-faq-subtitle">
                {activeTab === "users"
                  ? "Everything you need to know about trust scores, tiers, and your personalized Web of Trust."
                  : "Technical details for client developers implementing NIP-85 Trust Attestations."}
              </p>
            </div>

            <div className="inline-flex rounded-full p-1 bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm" data-testid="tabs-faq">
              <button
                onClick={() => handleTabChange("users")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  activeTab === "users"
                    ? "bg-[#3730a3] text-white shadow-lg shadow-[#3730a3]/30"
                    : "text-slate-500 hover:text-[#333286]"
                }`}
                data-testid="tab-users"
              >
                Using Brainstorm
              </button>
              <button
                onClick={() => handleTabChange("developers")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  activeTab === "developers"
                    ? "bg-[#3730a3] text-white shadow-lg shadow-[#3730a3]/30"
                    : "text-slate-500 hover:text-[#333286]"
                }`}
                data-testid="tab-developers"
              >
                For Developers
              </button>
            </div>

            <div
              className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden relative group"
            >
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />

              <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <HelpCircle className="h-4 w-4 text-[#333286]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                      {activeTab === "users" ? "Using Brainstorm" : "For Developers"}
                    </h2>
                    <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                      {activeTab === "users" ? "Trust & Scores" : "NIP-85 Integration"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative p-4 sm:p-5 space-y-2">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2"
                  >
                    {faqs.map((faq, i) => (
                      <motion.div
                        key={`${activeTab}-${i}`}
                        className={`relative overflow-hidden rounded-xl transition-all duration-300 ${
                          expandedFaq === i
                            ? 'bg-gradient-to-br from-[#7c86ff]/8 via-indigo-50/60 to-[#7c86ff]/5 border border-[#7c86ff]/30 shadow-[0_4px_20px_rgba(124,134,255,0.1)]'
                            : 'bg-white/60 border border-slate-200/80 hover:border-[#7c86ff]/25 hover:bg-white/80 hover:shadow-sm'
                        }`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + i * 0.04 }}
                      >
                        {expandedFaq === i && (
                          <motion.div
                            className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-[#7c86ff] to-transparent"
                            initial={{ opacity: 0, scaleX: 0 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                          />
                        )}

                        <button
                          onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                          className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left group"
                          data-testid={`faq-item-${i}`}
                        >
                          <div className="flex items-center gap-3 pr-4">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                                expandedFaq === i
                                  ? 'bg-[#7c86ff]/15 border border-[#7c86ff]/30 shadow-sm'
                                  : 'bg-white border border-[#7c86ff]/12 shadow-sm group-hover:bg-[#7c86ff]/10 group-hover:border-[#7c86ff]/25'
                              }`}
                            >
                              {expandedFaq === i ? (
                                <BrainLogo size={14} className="text-[#333286]" />
                              ) : (
                                <span className="text-[10px] font-bold text-[#7c86ff]/70 font-mono group-hover:text-[#333286]">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                            <span className={`text-sm font-semibold transition-colors ${
                              expandedFaq === i ? 'text-[#333286]' : 'text-slate-700 group-hover:text-slate-900'
                            }`}>
                              {faq.question}
                            </span>
                          </div>
                          <motion.div
                            animate={{ rotate: expandedFaq === i ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex-shrink-0"
                          >
                            <ChevronDown className={`h-4 w-4 transition-colors ${
                              expandedFaq === i ? 'text-[#7c86ff]' : 'text-slate-400 group-hover:text-[#7c86ff]'
                            }`} />
                          </motion.div>
                        </button>

                        <AnimatePresence>
                          {expandedFaq === i && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 sm:px-5 pb-4 pl-[52px] sm:pl-[56px]">
                                <p className="text-sm text-slate-600 leading-relaxed" data-testid={`faq-answer-${i}`}>
                                  {faq.answer}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
