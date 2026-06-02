import { InfoPageLayout } from "@/components/InfoPageLayout";

const LAST_REVISED = "April 16, 2026";

type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] };

interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

const SECTIONS: Section[] = [
  {
    id: "what-we-collect",
    title: "1. What information do we collect?",
    blocks: [
      {
        type: "p",
        text: "We collect personal information that you voluntarily provide when you register, participate in activities on the Services, or contact us. What we collect depends on how you interact with us and the features you use, and may include:",
      },
      {
        type: "list",
        items: [
          "Your email address (if you register with an email)",
          "Your Nostr public key (npub) if you authenticate via the Nostr protocol",
          "Payment and billing information (processed by our third-party payment processors; we may not store your full payment card details)",
          "Any other information you choose to provide to us",
        ],
      },
      {
        type: "p",
        text: "We also automatically collect certain information when you use the Services. This does not reveal your specific identity but may include your IP address, browser and device characteristics, operating system, language preferences, referring URLs, country, location, and details about how and when you use the Services. We collect some of this through cookies and similar technologies.",
      },
      {
        type: "p",
        text: "Separately, the Brainstorm Service processes publicly available data from the Nostr decentralized protocol. This data is not collected from your device — it is read from public Nostr relays. It includes public keys (npubs), follow lists (kind 3 events), mute lists, reports, and zap/tipping data, and may relate to people who are not users of our Services. We use it solely to generate Trust Scores and to operate and improve the Service. We do not control the Nostr protocol, the relays, or the data published to them.",
      },
    ],
  },
  {
    id: "how-we-process",
    title: "2. How do we process your information?",
    blocks: [
      {
        type: "p",
        text: "We process your information to:",
      },
      {
        type: "list",
        items: [
          "Create and manage your account, and authenticate you",
          "Deliver and operate the Services you request",
          "Respond to your inquiries and provide support",
          "Send administrative information, such as changes to our terms and policies",
          "Process payments and manage subscriptions",
          "Request feedback and contact you about your use of the Services",
          "Keep our Services safe and secure, including fraud monitoring and prevention",
          "Understand usage trends and improve the Services",
          "Measure the effectiveness of our marketing and promotional campaigns",
          "Protect an individual's vital interest, such as to prevent harm",
          "Generate and deliver personalized Trust Scores from publicly available Nostr data",
          "Improve the accuracy and reliability of our scoring algorithms using aggregated, anonymized data",
          "Detect abuse and enforce our Terms of Use",
        ],
      },
    ],
  },
  {
    id: "sharing",
    title: "3. When and with whom do we share your information?",
    blocks: [
      {
        type: "p",
        text: "We may share your data with third-party vendors, service providers, and contractors who perform services for us and need access to do that work. These may include payment processors, cloud hosting providers, analytics providers, and customer support tools. We have contracts in place designed to safeguard your information, meaning they cannot use it for anything other than the work we have instructed them to do.",
      },
    ],
  },
  {
    id: "third-party-sites",
    title: "4. Third-party websites",
    blocks: [
      {
        type: "p",
        text: "The Services may link to third-party websites, services, or applications that are not affiliated with us. We do not guarantee and are not responsible for any third party, and the inclusion of a link is not an endorsement. We are not liable for any loss or damage caused by your use of such third-party websites, services, or applications. We recommend reviewing the privacy notices of any third parties you interact with.",
      },
    ],
  },
  {
    id: "cookies",
    title: "5. Cookies and tracking technologies",
    blocks: [
      {
        type: "p",
        text: "We may use cookies and similar tracking technologies (such as web beacons and pixels) to access or store information and to help operate and improve the Services.",
      },
    ],
  },
  {
    id: "logins",
    title: "6. Social logins and Nostr authentication",
    blocks: [
      {
        type: "p",
        text: "You can register and log in using your Nostr cryptographic key pair. When you authenticate via your Nostr key, we receive your public key (npub) and can access your publicly available Nostr profile information and follow list. We never have access to your private key, and we cannot recover or reset it if it is lost.",
      },
      {
        type: "p",
        text: "If you log in using a third-party social media account, we may receive certain profile information from that provider. We use information we receive only for the purposes described in this notice. We do not control, and are not responsible for, other uses of your information by your social media provider or the Nostr protocol.",
      },
    ],
  },
  {
    id: "public-nostr-data",
    title: "7. Publicly available Nostr data",
    blocks: [
      {
        type: "p",
        text: "The Brainstorm Service reads and analyzes publicly available Nostr data to generate Trust Scores. This data is published by Nostr users to public relays and is freely accessible to anyone on the network, so we do not collect it from individuals in the traditional sense.",
      },
      {
        type: "p",
        text: "Trust Scores may relate to individuals who are not users of our Services and have not agreed to this notice. Because the underlying data is publicly available, our processing of it does not require their consent. If you are a Nostr user with questions about how your public data is processed, you can contact us using the details in Section 14.",
      },
    ],
  },
  {
    id: "security",
    title: "8. How do we keep your information safe?",
    blocks: [
      {
        type: "p",
        text: "We have implemented reasonable technical and organizational measures designed to protect your personal information. However, no transmission over the Internet or storage technology can be guaranteed to be 100% secure, so we cannot promise that unauthorized third parties will never be able to defeat our security and improperly access or modify your information.",
      },
    ],
  },
  {
    id: "minors",
    title: "9. Information from minors",
    blocks: [
      {
        type: "p",
        text: "We do not knowingly collect data from or market to children under 18 years of age. By using the Services, you confirm you are at least 18, or that you are the parent or guardian of a minor and consent to their use. If we learn that we have collected personal information from a user under 18, we will deactivate the account and take reasonable steps to delete that data. If you believe we may have any data from a child under 18, please contact us.",
      },
    ],
  },
  {
    id: "dnt",
    title: "10. Do-Not-Track features",
    blocks: [
      {
        type: "p",
        text: "Most browsers and some operating systems offer a Do-Not-Track (DNT) setting. No uniform technology standard for recognizing DNT signals has been finalized, so we do not currently respond to DNT browser signals or other mechanisms that automatically communicate your choice not to be tracked.",
      },
    ],
  },
  {
    id: "retention",
    title: "11. How long do we keep your information?",
    blocks: [
      {
        type: "p",
        text: "We retain your account information for as long as your account is active or as needed to provide the Services. Nostr protocol data is processed in real time and may be cached temporarily to improve performance. Payment records are kept as required by law and our accounting obligations. If you request deletion of your account, we will delete or anonymize your personal information within thirty (30) days, except where we are required to retain it by law.",
      },
    ],
  },
  {
    id: "your-rights",
    title: "12. Your privacy rights",
    blocks: [
      {
        type: "p",
        text: "If you are a resident of California or another state with applicable privacy laws, you may have the right to request access to, deletion of, or correction of your personal information, and to opt out of the \u201Csale\u201D or \u201Csharing\u201D of your personal information. We do not sell your personal information, and we do not share it for cross-context behavioral advertising.",
      },
      {
        type: "p",
        text: "To exercise any of these rights, contact us at support@nosfabrica.com. We will respond consistent with applicable law and will not discriminate against you for exercising your rights.",
      },
    ],
  },
  {
    id: "updates",
    title: "13. Updates to this notice",
    blocks: [
      {
        type: "p",
        text: "We may update this privacy notice from time to time. The updated version will be indicated by a revised date and becomes effective as soon as it is accessible. If we make material changes, we may notify you by prominently posting a notice or by contacting you directly. We encourage you to review this notice frequently.",
      },
    ],
  },
  {
    id: "contact",
    title: "14. How can you contact us?",
    blocks: [
      {
        type: "p",
        text: "If you have questions or comments about this notice, you can email us at support@nosfabrica.com or write to us at:",
      },
      {
        type: "list",
        items: [
          "NosFabrica, Inc.",
          "1910 21st Ave S, Nashville, TN 37212",
          "United States",
        ],
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <InfoPageLayout testId="page-privacy">
      <article className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <header className="mb-10">
          <h1
            className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-privacy-title"
          >
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-slate-500" data-testid="text-privacy-revised">
            Last revised on {LAST_REVISED}
          </p>
          <p className="mt-6 text-[15px] sm:text-base text-slate-600 leading-relaxed">
            This notice explains how NosFabrica, Inc. (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
            or &ldquo;our&rdquo;) collects, stores, uses, and shares your information when you use our
            Services, including the Brainstorm web-of-trust scoring tool. By using our Services or visiting
            our website, you accept this Privacy Notice.
          </p>
        </header>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.id} data-testid={`section-privacy-${section.id}`}>
              <h2
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-4"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.blocks.map((block, i) =>
                  block.type === "p" ? (
                    <p
                      key={i}
                      className="text-[15px] sm:text-base text-slate-600 leading-relaxed"
                    >
                      {block.text}
                    </p>
                  ) : (
                    <ul
                      key={i}
                      className="space-y-2 pl-5 list-disc marker:text-indigo-400"
                    >
                      {block.items.map((item, j) => (
                        <li
                          key={j}
                          className="text-[15px] sm:text-base text-slate-600 leading-relaxed"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </article>
    </InfoPageLayout>
  );
}
