/**
 * The Agent Suite's assistant cards: the hero (create it, or how it stands
 * now with its achievements), the editor once it's live, and the deploy
 * confirmation.
 */
import { useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Settings as SettingsIcon,
  Users,
  Zap,
} from "lucide-react";
import workshopBg from "@assets/Gemini_Generated_Image_9rkzed9rkzed9rkz_800.webp";
import { AgentIcon } from "@/components/AgentIcon";
import { ImageUpload } from "@/components/ImageUpload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentState } from "../userPanelState";
import { ACHIEVEMENTS, type AGENT_STATUS_CONFIG } from "./agentPanelModel";
import { StatusLevelBar } from "./AgentBits";
import type { AgentForm } from "./useAgentForm";

export function AgentHeroCard({
  agentState,
  statusConfig,
  agentIsLive,
  form,
  handleActivateAgent,
  totalNetworkSize,
  nip85Activated,
}: {
  agentState: AgentState;
  statusConfig: (typeof AGENT_STATUS_CONFIG)[keyof typeof AGENT_STATUS_CONFIG];
  agentIsLive: boolean;
  form: AgentForm;
  handleActivateAgent: () => void;
  totalNetworkSize: number;
  nip85Activated: boolean;
}) {
  const [agentCardExpanded, setAgentCardExpanded] = useState(false);
  const {
    agentNameInput,
    setAgentNameInput,
    agentDescInput,
    setAgentDescInput,
    agentPictureInput,
    setAgentPictureInput,
    agentBannerInput,
    setAgentBannerInput,
    agentLud16Input,
    setAgentLud16Input,
    agentNip05Input,
    setAgentNip05Input,
    agentWebsiteInput,
    setAgentWebsiteInput,
  } = form;
  return (
    <div
      className="overflow-hidden rounded-2xl border border-brand-accent/20 shadow-[0_0_30px_rgba(6,182,212,0.08)]"
      data-testid="card-agent-hero"
    >
      <div className="relative bg-gradient-to-br from-slate-950 via-[#0c1929] to-slate-950">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url(${workshopBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "luminosity",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgb(var(--brand-accent)/0.08),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/[0.4] to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent" />

        <div className="relative">
          <button
            onClick={() => setAgentCardExpanded(!agentCardExpanded)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 transition-colors hover:bg-white/[0.02] sm:px-6 sm:py-4"
            data-testid="button-toggle-agent-card"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${(agentIsLive && agentState.picture) || agentPictureInput ? "border border-brand-accent/[0.3] bg-gradient-to-br from-brand-accent/20 to-brand-primary/20" : ""}`}
              >
                {agentIsLive && agentState.picture ? (
                  <img
                    src={agentState.picture}
                    alt={agentState.name}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : agentPictureInput ? (
                  <img src={agentPictureInput} alt="Agent" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <AgentIcon className="h-5 w-5 text-brand-accent" />
                )}
              </div>
              <div className="text-left">
                <h2
                  className="text-sm font-bold tracking-tight text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {agentIsLive ? agentState.name || "Unnamed Assistant" : "Create Your Assistant"}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {agentIsLive ? statusConfig.description : "Deploy a trust agent to represent you on Nostr"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {agentIsLive && !agentCardExpanded && (
                <div className="hidden items-center gap-1.5 sm:flex">
                  {agentState.lud16 && (
                    <span title={agentState.lud16}>
                      <Zap className="h-3 w-3 text-amber-400" />
                    </span>
                  )}
                  {agentState.nip05 && (
                    <span title={agentState.nip05}>
                      <CheckCircle2 className="h-3 w-3 text-brand-link" />
                    </span>
                  )}
                  {agentState.website && (
                    <span title={agentState.website}>
                      <Globe className="h-3 w-3 text-brand-accent" />
                    </span>
                  )}
                </div>
              )}
              {agentIsLive && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${statusConfig.bgClass} border ${statusConfig.borderClass}`}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusConfig.color.replace("text-", "bg-")}`}
                    />
                    <span
                      className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusConfig.color.replace("text-", "bg-")}`}
                    />
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </span>
              )}
              {agentCardExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </div>
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${agentCardExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
              {!agentIsLive ? (
                <div className="mx-auto max-w-2xl space-y-3" data-testid="agent-activation-flow">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                      Name *
                    </label>
                    <Input
                      placeholder="e.g. TrustBot, Guardian..."
                      value={agentNameInput}
                      onChange={(e) => setAgentNameInput(e.target.value)}
                      className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                      data-testid="input-agent-name"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                      Bio
                    </label>
                    <textarea
                      placeholder="Describe its role and purpose..."
                      value={agentDescInput}
                      onChange={(e) => setAgentDescInput(e.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-md border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-1 focus:ring-brand-accent/25"
                      data-testid="input-agent-desc"
                    />
                  </div>
                  <div className="grid grid-cols-[72px_1fr] items-end gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                        Avatar
                      </label>
                      <ImageUpload
                        value={agentPictureInput}
                        onChange={setAgentPictureInput}
                        onRemove={() => setAgentPictureInput("")}
                        aspect="square"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                        Banner
                      </label>
                      <ImageUpload
                        value={agentBannerInput}
                        onChange={setAgentBannerInput}
                        onRemove={() => setAgentBannerInput("")}
                        aspect="banner"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-amber-400" />
                      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/80">
                        Connections
                      </span>
                      <span className="ml-1 text-[9px] italic text-slate-500">optional</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                          Lightning
                        </label>
                        <Input
                          placeholder="you@getalby.com"
                          value={agentLud16Input}
                          onChange={(e) => setAgentLud16Input(e.target.value)}
                          className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                          data-testid="input-agent-lud16"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                          NIP-05
                        </label>
                        <Input
                          placeholder="you@nostr.com"
                          value={agentNip05Input}
                          onChange={(e) => setAgentNip05Input(e.target.value)}
                          className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                          data-testid="input-agent-nip05"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                          Website
                        </label>
                        <Input
                          placeholder="https://yoursite.com"
                          value={agentWebsiteInput}
                          onChange={(e) => setAgentWebsiteInput(e.target.value)}
                          className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                          data-testid="input-agent-website"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleActivateAgent}
                    disabled={agentState.status === "activating"}
                    className="w-full gap-2 bg-gradient-to-r from-brand-accent to-brand-primary py-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 hover:from-brand-accent hover:to-brand-primary hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                    data-testid="button-activate-agent"
                  >
                    {agentState.status === "activating" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Deploying...
                      </>
                    ) : (
                      <>
                        <AgentIcon className="h-4 w-4" /> Activate Assistant
                      </>
                    )}
                  </Button>

                  <StatusLevelBar currentLevel={-1} />
                </div>
              ) : (
                <div className="space-y-6" data-testid="agent-live-view">
                  {agentState.banner && (
                    <div className="relative -mx-6 -mt-6 h-32 overflow-hidden rounded-t-2xl sm:-mx-8 sm:-mt-8 sm:h-40">
                      <img src={agentState.banner} alt="Banner" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                    </div>
                  )}
                  <div
                    className={`flex flex-col items-start gap-6 sm:flex-row sm:items-center ${agentState.banner ? "relative z-10 -mt-12 px-2" : ""}`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-brand-accent/[0.3] shadow-[0_0_40px_rgba(6,182,212,0.2)] ${agentState.picture ? "" : "bg-gradient-to-br from-brand-accent/20 to-emerald-500/20"}`}
                      >
                        {agentState.picture ? (
                          <img src={agentState.picture} alt={agentState.name} className="h-full w-full object-cover" />
                        ) : (
                          <AgentIcon className="h-10 w-10 text-brand-accent" />
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                        <Activity className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2
                          className="text-2xl font-bold tracking-tight text-white"
                          style={{ fontFamily: "var(--font-display)" }}
                          data-testid="text-agent-name"
                        >
                          {agentState.name || "Unnamed Assistant"}
                        </h2>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${statusConfig.bgClass} border ${statusConfig.borderClass}`}
                          data-testid="badge-agent-status"
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            <span
                              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusConfig.color.replace("text-", "bg-")}`}
                            />
                            <span
                              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusConfig.color.replace("text-", "bg-")}`}
                            />
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </span>
                      </div>
                      {agentState.description && (
                        <p className="text-sm text-slate-400" data-testid="text-agent-desc">
                          {agentState.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {agentState.activatedAt && (
                          <span className="flex items-center gap-1" data-testid="text-agent-activated-at">
                            <Zap className="h-3 w-3 text-brand-accent" />
                            Activated{" "}
                            {new Date(agentState.activatedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        <span className="flex items-center gap-1" data-testid="text-agent-network-size">
                          <Users className="h-3 w-3 text-brand-link" />
                          {totalNetworkSize.toLocaleString()} in network
                        </span>
                        {nip85Activated && (
                          <span className="flex items-center gap-1" data-testid="text-agent-nip85">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            NIP-85 Active
                          </span>
                        )}
                        {agentState.lud16 && (
                          <span className="flex items-center gap-1" data-testid="text-agent-lud16">
                            <Zap className="h-3 w-3 text-amber-400" />
                            {agentState.lud16}
                          </span>
                        )}
                        {agentState.nip05 && (
                          <span className="flex items-center gap-1" data-testid="text-agent-nip05">
                            <CheckCircle2 className="h-3 w-3 text-brand-link" />
                            {agentState.nip05}
                          </span>
                        )}
                        {agentState.website && /^https?:\/\//i.test(agentState.website) && (
                          <a
                            href={agentState.website}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1 transition-colors hover:text-brand-accent"
                            data-testid="link-agent-website"
                          >
                            <Globe className="h-3 w-3 text-brand-accent" />
                            {agentState.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const editing = document.getElementById("agent-edit-section");
                          if (editing) editing.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="gap-1.5 border-white/10 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                        data-testid="button-edit-agent"
                      >
                        <SettingsIcon className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  </div>

                  <StatusLevelBar currentLevel={statusConfig.level} />

                  <div className="flex flex-wrap gap-2 pt-2" data-testid="achievements-bar">
                    {ACHIEVEMENTS.map((achievement) => {
                      const earned = achievement.check(agentState);
                      const Icon = achievement.icon;
                      return (
                        <div
                          key={achievement.id}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-300 ${earned ? "border-brand-accent/[0.3] bg-brand-accent/10 shadow-[0_0_8px_rgba(6,182,212,0.15)]" : "border-white/5 bg-white/[0.02]"}`}
                          title={achievement.description}
                          data-testid={`achievement-${achievement.id}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${earned ? "text-brand-accent" : "text-white/15"}`} />
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${earned ? "text-brand-accent" : "text-white/15"}`}
                          >
                            {achievement.label}
                          </span>
                          {earned && <Check className="h-3 w-3 text-emerald-400" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentEditCard({ form, handleUpdateAgent }: { form: AgentForm; handleUpdateAgent: () => void }) {
  const {
    agentNameInput,
    setAgentNameInput,
    agentDescInput,
    setAgentDescInput,
    agentPictureInput,
    setAgentPictureInput,
    agentBannerInput,
    setAgentBannerInput,
    agentLud16Input,
    setAgentLud16Input,
    agentNip05Input,
    setAgentNip05Input,
    agentWebsiteInput,
    setAgentWebsiteInput,
  } = form;
  return (
    <div
      id="agent-edit-section"
      className="overflow-hidden rounded-2xl border border-brand-accent/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-accent/10 shadow-[0_0_15px_rgba(6,182,212,0.05)] backdrop-blur-xl dark:from-slate-900 dark:via-slate-900"
      data-testid="card-agent-edit"
    >
      <div className="h-1 w-full bg-gradient-to-r from-brand-accent via-brand-primary to-brand-accent" />
      <div className="from-brand-accent/8 border-b border-brand-accent/10 bg-gradient-to-b to-white/60 px-5 py-4 dark:to-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <AgentIcon className="h-4 w-4 text-brand-accent" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-edit-title"
            >
              Customize Assistant
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Update your assistant's profile and connections
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-accent">Identity</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Assistant Name
              </label>
              <Input
                value={agentNameInput}
                onChange={(e) => setAgentNameInput(e.target.value)}
                className="text-sm"
                data-testid="input-edit-agent-name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Bio
              </label>
              <Input
                value={agentDescInput}
                onChange={(e) => setAgentDescInput(e.target.value)}
                className="text-sm"
                data-testid="input-edit-agent-desc"
              />
            </div>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="shrink-0">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Avatar
            </label>
            <ImageUpload
              value={agentPictureInput}
              onChange={setAgentPictureInput}
              onRemove={() => setAgentPictureInput("")}
              aspect="square"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Banner
            </label>
            <ImageUpload
              value={agentBannerInput}
              onChange={setAgentBannerInput}
              onRemove={() => setAgentBannerInput("")}
              aspect="banner"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Lightning
            </label>
            <Input
              value={agentLud16Input}
              onChange={(e) => setAgentLud16Input(e.target.value)}
              placeholder="you@getalby.com"
              className="text-sm"
              data-testid="input-edit-agent-lud16"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              NIP-05
            </label>
            <Input
              value={agentNip05Input}
              onChange={(e) => setAgentNip05Input(e.target.value)}
              placeholder="you@nostr.com"
              className="text-sm"
              data-testid="input-edit-agent-nip05"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Website
            </label>
            <Input
              value={agentWebsiteInput}
              onChange={(e) => setAgentWebsiteInput(e.target.value)}
              placeholder="https://yoursite.com"
              className="text-sm"
              data-testid="input-edit-agent-website"
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleUpdateAgent}
          className="gap-1.5 bg-brand-accent text-white hover:bg-brand-accent"
          data-testid="button-save-agent"
        >
          <Check className="h-3.5 w-3.5" /> Save Changes
        </Button>
      </div>
    </div>
  );
}

/** Confirms the deploy: the kind-0 profile, to five relays. */
export function ActivateDialog({
  activateConfirmOpen,
  setActivateConfirmOpen,
  agentNameInput,
  agentDescInput,
  handleConfirmActivation,
}: {
  activateConfirmOpen: boolean;
  setActivateConfirmOpen: (open: boolean) => void;
  agentNameInput: string;
  agentDescInput: string;
  handleConfirmActivation: () => void;
}) {
  return (
    <AlertDialog open={activateConfirmOpen} onOpenChange={setActivateConfirmOpen}>
      <AlertDialogContent
        className="w-[calc(100vw-2rem)] max-w-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        data-testid="dialog-activate-confirm"
      >
        <div className="p-5 sm:p-6">
          <AlertDialogHeader className="space-y-0 text-left">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-accent">
                Agent Suite
              </span>
              <div className="h-px w-10 bg-brand-accent/30" />
            </div>
            <AlertDialogTitle
              className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Deploy {agentNameInput.trim() || "Your Agent"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              This will publish a kind 0 profile event to 5 Nostr relays, making your Brainstorm agent discoverable
              across the network.
            </AlertDialogDescription>

            <div className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Agent Name</span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{agentNameInput.trim()}</span>
              </div>
              {agentDescInput.trim() && (
                <div>
                  <span className="mb-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Description
                  </span>
                  <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    {agentDescInput.trim()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Event</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">kind 0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Relays</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">5 relays</span>
              </div>
              <div className="border-t border-slate-200/80 pt-1.5 dark:border-slate-800">
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/20 bg-gradient-to-r from-brand-accent/10 to-brand-primary/10 px-2.5 py-1"
                  data-testid="badge-certified-assistant"
                >
                  <AgentIcon className="h-3 w-3 text-brand-accent" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">
                    Certified Brainstorm Assistant
                  </span>
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="rounded-xl" data-testid="button-activate-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmActivation}
              className="gap-2 rounded-xl bg-gradient-to-r from-brand-accent to-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:opacity-90"
              data-testid="button-activate-confirm"
            >
              <AgentIcon className="h-4 w-4" /> Deploy Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
