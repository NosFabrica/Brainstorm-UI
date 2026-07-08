import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { BillingPanel } from "@/components/BillingPanel";

/**
 * Standalone billing page (auth-gated via RequireAuth). Thin shell around the
 * shared BillingPanel, which is also embedded in Settings → Billing.
 */
export default function BillingPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600" data-testid="link-billing-back">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/" className="inline-flex items-center gap-2">
            <BrainLogo size={20} className="text-indigo-500" />
            <span className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Billing &amp; plan</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your Brainstorm subscription.</p>
        <div className="mt-6">
          <BillingPanel />
        </div>
      </main>
    </div>
  );
}
