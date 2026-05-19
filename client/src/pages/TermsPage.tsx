import { useEffect, useState } from "react";
import { FileText, Mail } from "lucide-react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";

const LAST_UPDATED = "May 19, 2026";

export default function TermsPage() {
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    document.title = "Terms of Service — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col relative overflow-hidden" data-testid="page-terms">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Terms" />

      <main className="flex-1 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-2 mb-6" data-testid="section-terms-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm">
              <FileText className="h-3 w-3 text-[#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Terms of Service</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-terms-title">
              Terms of Service
            </h1>
            <p className="text-xs text-slate-400 font-medium" data-testid="text-terms-updated">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 text-sm leading-relaxed text-slate-700 space-y-6" data-testid="text-terms-body">
              <section>
                <p className="text-slate-700">These Terms of Service ("Terms") form a binding agreement between you ("you" or "User") and NosFabrica, LLC ("NosFabrica," "we," "us," or "our") governing your access to and use of the Brainstorm web application, APIs, and related services (collectively, the "Service"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>1. The Service</h2>
                <p>Brainstorm is a Web of Trust dashboard for the Nostr protocol. The Service provides tools to visualize and compute personalized trust scores using the GrapeRank algorithm, publish trust attestations (including NIP-85 events) on your behalf when you authorize them, and explore your social graph on Nostr. The Service is offered on a free tier and on paid subscription tiers with additional features such as automated recalculations.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>2. Eligibility</h2>
                <p>You must be at least 18 years old, or the age of majority in your jurisdiction, to use the Service. By using the Service, you represent that you meet this requirement and that you have the legal authority to enter into these Terms.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>3. Your Account & Keys</h2>
                <p>Brainstorm authenticates you using your Nostr public key via a NIP-07 compatible browser extension. You are solely responsible for the security and custody of your Nostr private key. We never see, receive, transmit, or store your private key. Any action signed with your key is deemed authorized by you. Loss of your private key may result in permanent loss of access to your account and to any Nostr identity associated with it; NosFabrica cannot recover lost keys.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>4. Subscriptions, Billing & Renewals</h2>
                <p>Paid plans are billed in advance on the cadence you select at checkout (monthly or annually) and automatically renew at the then-current price until cancelled. You may cancel at any time from your Billing page; cancellation takes effect at the end of the current billing period. All fees are charged in U.S. dollars and exclude any applicable taxes, which are your responsibility. Refunds, where available, are governed by our <a href="/refund-policy" className="text-[#333286] font-semibold hover:underline" data-testid="link-refund-policy">Refund Policy</a>, which is incorporated by reference. You authorize us and our payment processor to charge your payment method on file for all amounts due.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>5. Acceptable Use</h2>
                <p>You agree not to: (a) abuse the Service or use it in any manner that interferes with, degrades, or disrupts its operation; (b) attempt to circumvent rate limits, access controls, or quotas; (c) reverse-engineer, manipulate, game, or attempt to falsify trust calculations, GrapeRank scores, or attestation outputs; (d) use the Service to harass, defame, dox, threaten, or incite violence against any person; (e) use the Service to distribute malware, spam, or illegal content; (f) use the Service in violation of any applicable law or regulation; or (g) resell, sublicense, or commercially redistribute the Service without our prior written consent. We reserve the right to suspend or terminate accounts that violate these terms, at our sole discretion and without prior notice.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>6. The Nostr Network</h2>
                <p>Nostr is a decentralized, permissionless protocol composed of independent relays operated by third parties. Brainstorm reads from and writes to public Nostr relays on your behalf. We do not own or operate the Nostr network or any specific relay (other than relays we may explicitly identify as ours). We cannot guarantee delivery, retention, propagation, ordering, or visibility of any event on any relay, and we are not responsible for the content or availability of any relay or third-party event. Data you publish to Nostr is public by design and may be replicated, archived, or indexed beyond our control.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>7. Intellectual Property</h2>
                <p>The Service, including all software, designs, text, graphics, and trademarks (excluding User-provided or Nostr-sourced content), is owned by NosFabrica or its licensors and is protected by copyright, trademark, and other laws. We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for its intended purpose, subject to these Terms. You retain all rights to content you publish to Nostr; you grant us a worldwide, royalty-free license to read, process, index, and display such content solely as needed to operate the Service.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>8. Disclaimers</h2>
                <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT. TRUST SCORES AND ATTESTATIONS ARE COMPUTED ESTIMATES BASED ON PUBLIC DATA AND ALGORITHMIC HEURISTICS; THEY DO NOT CONSTITUTE LEGAL, FINANCIAL, IDENTITY-VERIFICATION, OR SAFETY ADVICE. YOU ARE SOLELY RESPONSIBLE FOR DECISIONS YOU MAKE ABOUT WHOM TO FOLLOW, TRUST, OR TRANSACT WITH. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>9. Limitation of Liability</h2>
                <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, NOSFABRICA AND ITS OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR REPUTATION, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100). Some jurisdictions do not allow the exclusion or limitation of certain damages; in those jurisdictions our liability is limited to the greatest extent permitted by law.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>10. Indemnification</h2>
                <p>You agree to indemnify, defend, and hold harmless NosFabrica and its affiliates from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or relating to (a) your use of the Service, (b) your violation of these Terms, (c) your violation of any law or the rights of any third party, or (d) content you publish using the Service or to Nostr.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>11. Termination</h2>
                <p>You may stop using the Service at any time. We may suspend or terminate your access to the Service, with or without notice, if you breach these Terms or if we are required to do so by law. Sections that by their nature should survive termination (including disclaimers, limitations of liability, indemnification, and dispute resolution) will survive.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>12. Governing Law & Dispute Resolution</h2>
                <p>These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-laws principles. Any dispute arising out of or relating to these Terms or the Service will be resolved exclusively in the state or federal courts located in Delaware, and you consent to personal jurisdiction and venue in those courts. The parties waive any right to a jury trial. You and NosFabrica each agree to bring claims against the other only in your or its individual capacity and not as a plaintiff or class member in any purported class or representative proceeding.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>13. Changes to These Terms</h2>
                <p>We may update these Terms from time to time. When we make material changes, we will update the "Last updated" date above and, where appropriate, notify you by email or in-product notice. Your continued use of the Service after the effective date of the revised Terms constitutes your acceptance of them.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>14. Miscellaneous</h2>
                <p>These Terms, together with the Refund Policy and Privacy Policy, constitute the entire agreement between you and NosFabrica regarding the Service. If any provision is held unenforceable, the remaining provisions will remain in full force. Our failure to enforce any right is not a waiver. You may not assign these Terms without our prior written consent; we may assign them in connection with a merger, acquisition, or sale of assets.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "var(--font-display)" }}>15. Contact</h2>
                <p>Questions about these Terms? Email <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-support-email">support@nosfabrica.com</a>.</p>
              </section>
            </div>
            <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50 flex items-center gap-2 text-xs text-slate-600">
              <Mail className="h-4 w-4 text-[#7c86ff]" />
              <span>Legal questions? <a href="mailto:support@nosfabrica.com" className="text-[#333286] font-semibold hover:underline" data-testid="link-footer-support-email">support@nosfabrica.com</a></span>
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
