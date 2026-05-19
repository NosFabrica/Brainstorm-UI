import { Link } from "wouter";
import { Lock } from "lucide-react";
import { SiVisa, SiMastercard, SiAmericanexpress, SiDiscover } from "react-icons/si";

export function ComplianceStrip() {
  return (
    <div
      className="mt-10 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#7c86ff]/15 shadow-sm overflow-hidden"
      data-testid="strip-compliance"
    >
      <div className="px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
            data-testid="badge-secure-checkout"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Secure checkout</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2.5 text-slate-400" data-testid="row-card-logos">
            <SiVisa className="h-6 w-auto" aria-label="Visa" />
            <SiMastercard className="h-5 w-auto" aria-label="Mastercard" />
            <SiAmericanexpress className="h-5 w-auto" aria-label="American Express" />
            <SiDiscover className="h-5 w-auto" aria-label="Discover" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/terms"
            className="text-slate-500 hover:text-[#333286] font-medium transition-colors"
            data-testid="link-compliance-terms"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-slate-500 hover:text-[#333286] font-medium transition-colors"
            data-testid="link-compliance-privacy"
          >
            Privacy
          </Link>
          <Link
            href="/refund-policy"
            className="text-slate-500 hover:text-[#333286] font-medium transition-colors"
            data-testid="link-compliance-refund"
          >
            Refund Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
