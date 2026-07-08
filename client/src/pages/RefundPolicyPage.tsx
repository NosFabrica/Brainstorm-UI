import { LegalDocLayout, type Section } from "@/components/LegalDocLayout";

// NOTE: plain-language policy drafted to match the Lightning/sats billing model
// (recurring via PayWithFlash, no card intermediary today, no chargebacks). This
// is NOT legal advice — the wording should be reviewed/approved by counsel before
// launch, alongside the Terms and Privacy notice.
const TITLE = "BRAINSTORM REFUND & CANCELLATION POLICY";
const LAST_REVISED = "Last revised on July 8th, 2026";

const CONTACT_EMAIL = "support@nosfabrica.com";
const CONTACT_SUBJECT = "Billing Inquiry";

const PREAMBLE: string[] = [
  "This policy explains how billing, renewals, cancellations, and refunds work for paid Brainstorm subscriptions (the Sovereign and Guardian plans). The Grapevine plan is free and is never charged.",
];

const SECTIONS: Section[] = [
  {
    id: "billing",
    title: "1. SUBSCRIPTIONS AND BILLING",
    blocks: [
      {
        type: "p",
        text: "Paid Brainstorm plans are billed monthly in bitcoin (denominated in satoshis, or “sats”) over the Lightning Network through our payment provider, PayWithFlash. Your subscription renews automatically each billing period until you cancel. By subscribing, you authorize this recurring charge for as long as the subscription remains active.",
      },
    ],
  },
  {
    id: "cancellation",
    title: "2. CANCELLATION",
    blocks: [
      {
        type: "p",
        text: "You may cancel at any time from Settings → Billing, or by contacting us at support@nosfabrica.com. When you cancel, your plan remains active through the end of the billing period you have already paid for, and it will not renew again. We do not provide partial-period or prorated refunds for the unused portion of a billing period.",
      },
    ],
  },
  {
    id: "refunds",
    title: "3. REFUNDS",
    blocks: [
      {
        type: "p",
        text: "Bitcoin and Lightning payments are final and are not reversible by us, our payment provider, or your wallet. There are no card networks involved and therefore no chargebacks. Payments are generally non-refundable.",
      },
      {
        type: "p",
        text: "If you believe you were charged in error, contact us within fourteen (14) days at support@nosfabrica.com. Where we choose, in our sole discretion, to grant a refund, it will be issued as a bitcoin payment in sats to a Lightning address you provide. The refunded amount is measured in sats; because the fiat value of bitcoin fluctuates, the equivalent value in your local currency at the time of refund may differ from its value at the time of purchase.",
      },
    ],
  },
  {
    id: "failed-payments",
    title: "4. FAILED OR MISSED RENEWALS",
    blocks: [
      {
        type: "p",
        text: "If an automatic renewal payment cannot be collected, your subscription may enter a short grace period during which we attempt to complete the payment. If payment is still not received, your paid features may be suspended and your account returns to the free Grapevine plan. You can restore paid access at any time by re-subscribing.",
      },
    ],
  },
  {
    id: "free-plan",
    title: "5. THE FREE PLAN",
    blocks: [
      {
        type: "p",
        text: "The Grapevine plan is free and involves no payment, so nothing in this policy about charges or refunds applies to it. You can use Grapevine for as long as you like without a subscription.",
      },
    ],
  },
  {
    id: "changes",
    title: "6. CHANGES TO THIS POLICY",
    blocks: [
      {
        type: "p",
        text: "We may update this policy from time to time. The updated version will be indicated by an updated “revised” date and takes effect when posted. Material changes affecting active subscribers may be communicated directly.",
      },
    ],
  },
  {
    id: "contact",
    title: "7. HOW TO CONTACT US",
    blocks: [
      {
        type: "p",
        text: "For any billing, cancellation, or refund question, contact us at support@nosfabrica.com or by post to:",
      },
      {
        type: "address",
        lines: ["NosFabrica, Inc.", "1910 21st Ave S, Nashville, TN 37212", "United States"],
      },
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalDocLayout
      testId="page-refund-policy"
      docKind="terms"
      eyebrow="Refund & Cancellation"
      title={TITLE}
      lastRevised={LAST_REVISED}
      preamble={PREAMBLE}
      sections={SECTIONS}
      contactEmail={CONTACT_EMAIL}
      contactSubject={CONTACT_SUBJECT}
    />
  );
}
