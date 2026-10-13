/**
 * A zap's page, whatever it was paid with — a Lightning receipt (9735) or the
 * request behind one (9734), a Cashu nutzap (9321), a BOLT12 zap (9736) or an
 * onchain one (8333): how much, from whom to whom, what they said, and the
 * post it was for. A receipt is signed by the recipient's wallet service, so
 * the payer is read from the request it carries (lib/activity), never its key —
 * and said to be unverified when that request is not theirs, signed. The page
 * itself stays the signer's: anyone can write a receipt naming anyone.
 */
import { useMemo } from "react";
import { Bitcoin, Coins, Zap as ZapIcon } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { ReadingText } from "@/components/share/ReadingText";
import { useRefEvents } from "@/hooks/useRefEvents";
import { readZap, zapAmount, type ActivityEvent, type Zap } from "@/lib/activity";
import { hostOf } from "@/lib/resultReaders";
import { ActivityHeader, OutLink, PeopleFlow, QuotedRef, Section } from "./parts";

const RAIL_WORDS: Record<Zap["rail"], string> = {
  lightning: "Zapped over Lightning",
  request: "Asked to zap — a request, not a payment",
  cashu: "Nutzapped in Cashu ecash",
  bolt12: "Zapped over Lightning (BOLT12)",
  onchain: "Zapped onchain — the amount is the sender's claim until the transaction confirms it",
};

export function ZapHero({ event }: { event: ActivityEvent }) {
  const zap = useMemo(() => readZap(event)!, [event]);
  const targets = useMemo(() => (zap.target ? [zap.target] : []), [zap]);
  const refs = useRefEvents(targets);
  const amount = zapAmount(zap);
  const Icon = zap.rail === "onchain" ? Bitcoin : zap.rail === "cashu" ? Coins : ZapIcon;
  return (
    <div data-testid="zap-hero">
      <ActivityHeader
        title={<span data-testid="zap-amount">{amount ? `⚡ ${amount}` : "⚡ A zap"}</span>}
        subtitle={RAIL_WORDS[zap.rail]}
        icon={Icon}
      />
      <PeopleFlow
        from={zap.payer}
        to={zap.recipient}
        fromKicker={zap.payerClaimed ? "From (claimed)" : "From"}
        fromPlaceholder="Anonymous"
      />
      {zap.payerClaimed && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Chip tone="warning" size="sm" data-testid="zap-payer-unverified">
            Sender unverified
          </Chip>
          The zap request it carries is not signed by them, so anyone could have written this receipt.
        </p>
      )}

      {zap.comment && (
        <ReadingText
          text={zap.comment}
          tags={zap.commentTags}
          className="mt-4 border-l-2 border-slate-200 pl-3 dark:border-slate-700"
          testId="zap-comment"
        />
      )}

      {(zap.mint || zap.txid) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {zap.mint && (
            <Chip tone="slate" data-testid="zap-mint">
              Mint · {hostOf(zap.mint)}
            </Chip>
          )}
          {zap.txid && (
            <OutLink href={`https://mempool.space/tx/${zap.txid}`} testId="zap-txid">
              Transaction {zap.txid.slice(0, 8)}…{zap.txid.slice(-6)}
            </OutLink>
          )}
          {zap.block?.height !== null && zap.block?.height !== undefined && (
            <span data-testid="zap-block">Block {zap.block.height.toLocaleString()}</span>
          )}
        </div>
      )}

      {zap.target && (
        <Section kicker="Zapped" testId="zap-target">
          <QuotedRef target={zap.target} refs={refs} />
        </Section>
      )}
    </div>
  );
}
