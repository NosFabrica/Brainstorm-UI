import { LegalDocLayout, type Section } from "@/components/LegalDocLayout";

// Body content is rendered VERBATIM from the source copy
// (attached_assets/Pasted-BRAINSTORM-PRIVACY-NOTICE-...txt): original wording,
// punctuation, and numbering are preserved as-is. The only non-text treatments
// are the two explicitly requested by the user: support@nosfabrica.com is a
// mailto link, and the contact address renders on separate lines.
const TITLE = "BRAINSTORM PRIVACY NOTICE";
const LAST_REVISED = "Last revised on April 16th, 2026";

const CONTACT_EMAIL = "support@nosfabrica.com";
const CONTACT_SUBJECT = "Privacy Inquiry";

const PREAMBLE: string[] = [
  "This privacy notice for NosFabrica, Inc. (“Company,” “we,” “us,” or “our”), describes how and why we might collect, store, use, and/or share (“process”) your information when you use our services (“Services”), including the Brainstorm web-of-trust scoring tool. By using our Services, or by accessing our website at brainstorm.nosfabrica.com or any website of ours that links to this privacy notice, you are accepting and consenting to this Privacy Policy.",
];

const SECTIONS: Section[] = [
  {
    id: "what-information",
    title: "1. WHAT INFORMATION DO WE COLLECT?",
    blocks: [
      {
        type: "p",
        text: "We collect personal information that you voluntarily provide to us when you register on the Services, when you participate in activities on the Services, or otherwise when you contact us.",
      },
      {
        type: "p",
        text: "Personal Information Provided by You. The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:",
      },
      { type: "p", text: "Your email address (if you register with an email)" },
      {
        type: "p",
        text: "Your Nostr public key (npub) if you authenticate via the Nostr protocol",
      },
      {
        type: "p",
        text: "Payment and billing information (processed by our third-party payment processors; we may not store your full payment card details)",
      },
      { type: "p", text: "Any other information you choose to provide to us" },
      { type: "p", text: "Information automatically collected" },
      {
        type: "p",
        text: "We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.",
      },
      {
        type: "p",
        text: "Like many businesses, we also collect information through cookies and similar technologies.",
      },
      {
        type: "p",
        text: "The Brainstorm Service processes publicly available data from the Nostr decentralized protocol. This data is not collected from your device but is read from public Nostr relays. The Nostr protocol data we process includes: public keys (npubs), follow lists (kind 3 events), mute lists, reports, and zap/tipping data. This data may relate to individuals who are not users of our Services. We use this data solely to generate Trust Scores and to operate and improve the Service.",
      },
      {
        type: "p",
        text: "Nostr protocol data is published by its users to public relays and is freely accessible to anyone connected to those relays. We do not control the Nostr protocol, the relays, or the data published to them. Our processing of this data is limited to analyzing publicly available information to generate Trust Scores.",
      },
    ],
  },
  {
    id: "how-process",
    title: "2. HOW DO WE PROCESS YOUR INFORMATION?",
    blocks: [
      {
        type: "p",
        text: "We process your personal information for a variety of reasons, depending on how you interact with our Services, including:",
      },
      {
        type: "p",
        text: "To facilitate account creation and authentication and otherwise manage user accounts. We may process your information so you can create and log in to your account, as well as keep your account in working order.",
      },
      {
        type: "p",
        text: "To deliver and facilitate delivery of services to the user. We may process your information to provide you with the requested service.",
      },
      {
        type: "p",
        text: "To respond to user inquiries/offer support to users. We may process your information to respond to your inquiries and solve any potential issues you might have with the requested service.",
      },
      {
        type: "p",
        text: "To send administrative information to you. We may process your information to send you details about our products and services, changes to our terms and policies, and other similar information.",
      },
      {
        type: "p",
        text: "To process payments and manage subscriptions. We may process your information to fulfill and manage your purchases, payments, and subscriptions made through the Services.",
      },
      {
        type: "p",
        text: "To request feedback. We may process your information when necessary to request feedback and to contact you about your use of our Services.",
      },
      {
        type: "p",
        text: "To protect our Services. We may process your information as part of our efforts to keep our Services safe and secure, including fraud monitoring and prevention.",
      },
      {
        type: "p",
        text: "To identify usage trends. We may process information about how you use our Services to better understand how they are being used so we can improve them.",
      },
      {
        type: "p",
        text: "To determine the effectiveness of our marketing and promotional campaigns. We may process your information to better understand how to provide marketing and promotional campaigns that are most relevant to you.",
      },
      {
        type: "p",
        text: "To save or protect an individual’s vital interest. We may process your information when necessary to save or protect an individual’s vital interest, such as to prevent harm.",
      },
      {
        type: "p",
        text: "To generate and deliver Trust Scores. We process publicly available Nostr protocol data to calculate personalized Trust Scores based on your social graph.",
      },
      {
        type: "p",
        text: "To improve our scoring algorithms. We may analyze aggregated and anonymized data to improve the accuracy and reliability of Trust Scores and the Service.",
      },
      {
        type: "p",
        text: "To detect abuse and enforce our Terms of Use. We may process your information to identify violations of our Terms, including misuse of Trust Scores.",
      },
    ],
  },
  {
    id: "share",
    title: "3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?",
    blocks: [
      {
        type: "p",
        text: "We may share your data with third-party vendors, service providers, contractors, or agents (“third parties”) who perform services for us or on our behalf and require access to such information to do that work. These third parties may include payment processors, cloud hosting providers, analytics providers, customer support tools, and any other service providers necessary to operate the Services. We have contracts in place with our third parties, which are designed to help safeguard your personal information. This means that they cannot do anything with your personal information unless we have instructed them to do it. They will also not share your personal information with any organization apart from us. They also commit to protect the data they hold on our behalf and to retain it for the period we instruct.",
      },
    ],
  },
  {
    id: "third-party-websites",
    title: "4. WHAT IS OUR STANCE ON THIRD-PARTY WEBSITES?",
    blocks: [
      {
        type: "p",
        text: "The Services may link to third-party websites, online services, or mobile applications and/or contain advertisements from third parties that are not affiliated with us and which may link to other websites, services, or applications. Accordingly, we do not make any guarantee regarding any such third parties, and we will not be liable for any loss or damage caused by the use of such third-party websites, services, or applications. The inclusion of a link towards a third-party website, service, or application does not imply an endorsement by us. We cannot guarantee the safety and privacy of data you provide to any third parties. Any data collected by third parties is not covered by this privacy notice. We are not responsible for the content or privacy and security practices and policies of any third parties, including other websites, services, or applications that may be linked to or from the Services. You should review the policies of such third parties and contact them directly to respond to your questions.",
      },
    ],
  },
  {
    id: "cookies",
    title: "5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?",
    blocks: [
      {
        type: "p",
        text: "We may use cookies and similar tracking technologies (like web beacons and pixels) to access or store information.",
      },
    ],
  },
  {
    id: "social-logins",
    title: "6. HOW DO WE HANDLE YOUR SOCIAL LOGINS AND NOSTR AUTHENTICATION?",
    blocks: [
      {
        type: "p",
        text: "Our Services may offer you the ability to register and log in using your Nostr cryptographic key pair or third-party social media account details. When you authenticate via your Nostr key, we receive your public key (npub) and can access your publicly available Nostr profile information and follow list. We do not have access to your private key, and we cannot recover or reset it if lost. Where you choose to log in using a third-party social media account, we will receive certain profile information about you from your social media provider. The profile information we receive may vary depending on the provider concerned, but will often include your name, email address, and profile picture, as well as other information you choose to make public on such a platform.",
      },
      {
        type: "p",
        text: "We will use the information we receive only for the purposes that are described in this privacy notice or that are otherwise made clear to you on the relevant Services. Please note that we do not control, and are not responsible for, other uses of your personal information by your third-party social media provider or the Nostr protocol. We recommend that you review any applicable third-party privacy notices to understand how they collect, use, and share your personal information.",
      },
    ],
  },
  {
    id: "public-nostr-data",
    title: "7. PUBLICLY AVAILABLE NOSTR DATA AND THIRD-PARTY DATA",
    blocks: [
      {
        type: "p",
        text: "The Brainstorm Service processes publicly available data from the Nostr decentralized protocol to generate Trust Scores. This data is published by Nostr users to public relays and is freely accessible to anyone on the network. Company does not “collect” this data from individuals in the traditional sense; rather, we read and analyze it from public sources.",
      },
      {
        type: "p",
        text: "Trust Scores generated by the Service may relate to individuals who are not users of our Services and who have not agreed to this privacy notice. Because this data is publicly available on the Nostr network, our processing of it does not require the consent of the individuals to whom it relates.",
      },
      {
        type: "p",
        text: "If you are a Nostr user and you have questions or concerns about how your publicly available data is processed by the Service, you may contact us using the information provided in Section 14 below.",
      },
    ],
  },
  {
    id: "keep-safe",
    title: "8. HOW DO WE KEEP YOUR INFORMATION SAFE?",
    blocks: [
      {
        type: "p",
        text: "We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment.",
      },
    ],
  },
  {
    id: "minors",
    title: "9. DO WE COLLECT INFORMATION FROM MINORS?",
    blocks: [
      {
        type: "p",
        text: "We do not knowingly solicit data from or market to children under 18 years of age. By using the Services, you represent that you are at least 18 or that you are the parent or guardian of such a minor and consent to such minor dependent’s use of the Services. If we learn that personal information from users less than 18 years of age has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under age 18, please contact us at support@nosfabrica.com.",
      },
    ],
  },
  {
    id: "do-not-track",
    title: "10. CONTROLS FOR DO-NOT-TRACK FEATURES",
    blocks: [
      {
        type: "p",
        text: "Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track (“DNT”) feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage no uniform technology standard for recognizing and implementing DNT signals has been finalized. As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this privacy notice.",
      },
    ],
  },
  {
    id: "retention",
    title: "11. HOW LONG DO WE KEEP YOUR INFORMATION?",
    blocks: [
      {
        type: "p",
        text: "We retain your account information for as long as your account is active or as needed to provide you the Services. Nostr protocol data is processed in real time and may be cached temporarily to improve Service performance. Payment records are retained as required by applicable law and our accounting obligations. If you request deletion of your account, we will delete or anonymize your personal information within thirty (30) days, except where we are required to retain it by law.",
      },
    ],
  },
  {
    id: "privacy-rights",
    title: "12. YOUR PRIVACY RIGHTS (CALIFORNIA AND OTHER STATES)",
    blocks: [
      {
        type: "p",
        text: "If you are a resident of California or another state with applicable privacy legislation, you may have the right to: (a) request access to the personal information we have collected about you; (b) request deletion of your personal information; (c) request correction of inaccurate personal information; and (d) opt out of the “sale” or “sharing” of your personal information. We do not sell your personal information, and we do not share your personal information for cross-context behavioral advertising.",
      },
      {
        type: "p",
        text: "To exercise any of these rights, please contact us at support@nosfabrica.com. We will respond to your request consistent with applicable law. We will not discriminate against you for exercising any of these rights.",
      },
    ],
  },
  {
    id: "updates",
    title: "13. DO WE MAKE UPDATES TO THIS NOTICE?",
    blocks: [
      {
        type: "p",
        text: "We may update this privacy notice from time to time. The updated version will be indicated by an updated “Revised” date and the updated version will be effective as soon as it is accessible. If we make material changes to this privacy notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this privacy notice frequently to be informed of how we are protecting your information.",
      },
    ],
  },
  {
    id: "contact",
    title: "14. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?",
    blocks: [
      {
        type: "p",
        text: "If you have questions or comments about this notice, you may contact us at support@nosfabrica.com or by post to:",
      },
      {
        type: "address",
        lines: [
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
    <LegalDocLayout
      testId="page-privacy"
      docKind="privacy"
      eyebrow="Privacy Notice"
      title={TITLE}
      lastRevised={LAST_REVISED}
      preamble={PREAMBLE}
      sections={SECTIONS}
      contactEmail={CONTACT_EMAIL}
      contactSubject={CONTACT_SUBJECT}
    />
  );
}
