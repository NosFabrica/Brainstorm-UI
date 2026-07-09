import { Link } from "wouter";
import { Lock } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";

/**
 * Trust + legal strip shown under the pricing / checkout surfaces. Brainstorm
 * bills in Bitcoin over Lightning (self-custodial, no card intermediary today —
 * a card rail is planned), so this leads with that rather than card-network logos.
 */
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
            <span>Self-custodial checkout</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-2.5 text-xs" data-testid="row-pay-methods">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
              <FlashIcon className="h-3.5 w-3.5" /> Bitcoin · Lightning
            </span>
            <span className="text-slate-400">Cards coming soon</span>
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
